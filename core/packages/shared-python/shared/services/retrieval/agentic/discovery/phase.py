"""Discovery and document selection phase for agentic retrieval."""
from __future__ import annotations

from typing import Any

from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models.database.document import Document
from shared.services.retrieval.agentic import tools
from shared.services.retrieval.agentic.prompts import RETRY_BROADEN_PROMPT
from shared.services.retrieval.agentic.core.budget import BudgetExceeded
from shared.services.retrieval.agentic.core.trace import TraceRecorder
from shared.services.retrieval.agentic.core.types import AgentState, CandidateDoc, ToolResult
from shared.services.retrieval.llm_adapter import LLMFn
from shared.services.retrieval.search.lexical_text import normalize_section_path


async def run_initial_discovery(
    db: AsyncSession,
    *,
    state: AgentState,
    trace: TraceRecorder,
    trace_enabled: bool,
    query: str,
    top_k: int,
    exclude_document_ids: list[str],
    exclude_sections: list[dict[str, str]],
    chunk_types: set[str] | None,
    signal_paths: list[str] | None,
    filter_mode: str,
    channels: list[str] | None,
    channel_weights: dict[str, float] | None,
    internal_recall_k: int | None,
    bootstrap_llm_fn: LLMFn | None,
) -> list[dict[str, Any]]:
    discovery_kwargs: dict[str, Any] = {
        "query": query,
        "top_k": top_k,
        "exclude_document_ids": exclude_document_ids,
        "exclude_sections": exclude_sections,
        "chunk_types": chunk_types,
        "signal_paths": signal_paths,
        "filter_mode": filter_mode,
        "channels": channels,
        "channel_weights": channel_weights,
        "internal_recall_k": internal_recall_k,
    }

    logger.info("  agentic: Phase 1 — discovery + document selection")
    discovery_result = await tools.bottom_discovery(db, **discovery_kwargs)
    state.step_count += 1
    discovery_rows = (
        discovery_result.payload.get("fused_rows", [])
        if discovery_result.status != "error"
        else []
    )
    state.discovery_top_doc_ids = (
        discovery_result.payload.get("top_doc_ids", [])
        if discovery_result.status != "error"
        else []
    )

    if trace_enabled:
        trace.record_step(
            "bottom_discovery",
            discovery_result,
            decision_reason="phase_1_mandatory",
        )

    logger.info(
        f"  agentic step {state.step_count}: bottom_discovery "
        f"status={discovery_result.status} latency={discovery_result.latency_ms}ms"
    )

    # Build per-document discovery signals for KG soft-prompting
    discovery_signals = build_discovery_signals(discovery_rows)

    if bootstrap_llm_fn is not None:
        await _select_documents(
            db,
            state=state,
            trace=trace,
            trace_enabled=trace_enabled,
            query=query,
            exclude_document_ids=exclude_document_ids,
            bootstrap_llm_fn=bootstrap_llm_fn,
            discovery_signals=discovery_signals,
            discovery_kwargs=dict(discovery_kwargs),
        )

    return discovery_rows


def build_discovery_signals(
    discovery_rows: list[dict[str, Any]],
) -> dict[str, list[str]]:
    """Build per-document discovery signals from bottom discovery results.

    Returns a mapping of ``{doc_id: [path1, path2, ...]}`` for documents
    where keyword/semantic search found potentially relevant section paths.
    These signals are injected as soft hints into the KG document selection
    prompt, allowing the LLM to make an informed decision rather than
    force-injecting documents.
    """
    signals: dict[str, list[str]] = {}
    seen: dict[str, set[str]] = {}
    for row in discovery_rows:
        doc_id = row.get("document_id", "")
        section_path = normalize_section_path(
            str(row.get("section_path", "") or "").strip()
        )
        if not doc_id or not section_path or section_path == "Root":
            continue
        if doc_id not in seen:
            seen[doc_id] = set()
            signals[doc_id] = []
        if section_path not in seen[doc_id]:
            seen[doc_id].add(section_path)
            signals[doc_id].append(section_path)
    return signals


async def _select_documents(
    db: AsyncSession,
    *,
    state: AgentState,
    trace: TraceRecorder,
    trace_enabled: bool,
    query: str,
    exclude_document_ids: list[str],
    bootstrap_llm_fn: LLMFn,
    discovery_signals: dict[str, list[str]] | None = None,
    discovery_kwargs: dict[str, Any] | None = None,
) -> None:
    """P1 document-selection ladder.

    Layer 1: original LLM selection over the KG overview.
    Layer 2: if empty, retry once with an LLM-broadened restatement of the
             question (discovery hints recomputed for the broader wording).
    Layer 3: if still empty, fall back to the BM25 top discovery documents so
             the turn navigates real candidates instead of returning empty
             evidence (no LLM cost).
    """
    kg_result = await _run_selection_attempt(
        db,
        state=state,
        exclude_document_ids=exclude_document_ids,
        query=query,
        llm_fn=bootstrap_llm_fn,
        discovery_signals=discovery_signals,
        attempt_label="original",
    )

    if kg_result.status != "selected_docs" and discovery_kwargs is not None:
        broadened = await _broaden_query(query, bootstrap_llm_fn)
        if broadened and broadened.lower().strip() != query.lower().strip():
            logger.info(
                "  agentic: original selection empty - retrying with broadened query"
            )
            retry_kwargs = dict(discovery_kwargs)
            retry_kwargs["query"] = broadened
            retry_discovery = await tools.bottom_discovery(db, **retry_kwargs)
            retry_signals: dict[str, list[str]] | None = None
            if retry_discovery.status != "error":
                retry_rows = retry_discovery.payload.get("fused_rows", []) or []
                retry_signals = build_discovery_signals(retry_rows)
            retry_result = await _run_selection_attempt(
                db,
                state=state,
                exclude_document_ids=exclude_document_ids,
                query=broadened,
                llm_fn=bootstrap_llm_fn,
                discovery_signals=retry_signals,
                attempt_label="broadened",
            )
            if retry_result.status == "selected_docs":
                kg_result = retry_result

    if kg_result.status != "selected_docs":
        fallback = await _fallback_to_discovery_top_docs(
            db,
            state=state,
            exclude_document_ids=exclude_document_ids,
        )
        if fallback.status == "selected_docs":
            logger.info(
                "  agentic: LLM selection empty after retry - BM25 discovery fallback "
                f"selected {len(fallback.payload.get('candidate_docs', []))} docs"
            )
            kg_result = fallback

    state.step_count += 1

    if trace_enabled:
        if kg_result.payload.get("reason") == "bootstrap budget exhausted":
            trace.record_budget_stop("bootstrap_exhausted")
        trace.record_step(
            "kg_document_select",
            kg_result,
            decision_reason="phase_1_doc_selection",
        )

    _append_selected_docs(state, kg_result)

    logger.info(
        f"  agentic step {state.step_count}: kg_document_select "
        f"status={kg_result.status} docs={len(state.selected_docs)} "
        f"latency={kg_result.latency_ms}ms"
    )


async def _run_selection_attempt(
    db: AsyncSession,
    *,
    state: AgentState,
    exclude_document_ids: list[str],
    query: str,
    llm_fn: LLMFn,
    discovery_signals: dict[str, list[str]] | None,
    attempt_label: str,
) -> ToolResult:
    """One LLM document-selection attempt (budget-guarded)."""
    try:
        return await tools.kg_document_select(
            db,
            query=query,
            llm_fn=llm_fn,
            exclude_document_ids=list(state.ever_explored_doc_ids | set(exclude_document_ids)),
            budget_snapshot=state.ledger.snapshot() if state.ledger else None,
            discovery_signals=discovery_signals,
        )
    except BudgetExceeded:
        logger.info(
            f"  agentic: bootstrap budget exhausted during document selection "
            f"({attempt_label} attempt)"
        )
        return ToolResult(
            status="no_confident_doc",
            payload={"reason": "bootstrap budget exhausted"},
        )


async def _broaden_query(query: str, llm_fn: LLMFn) -> str | None:
    """Ask the LLM for one broader restatement of a failed routing query."""
    try:
        raw = await llm_fn(RETRY_BROADEN_PROMPT.format(query=query))
    except BudgetExceeded:
        logger.info("  agentic: bootstrap budget exhausted during query broadening")
        return None
    text = str(raw or "").strip().strip('"').strip()
    if len(text) < 8:
        logger.info(
            "  agentic: query broadening returned unusable text - skipping retry"
        )
        return None
    logger.info(f"  agentic: broadened query: {text[:140]!r}")
    return text


async def _fallback_to_discovery_top_docs(
    db: AsyncSession,
    *,
    state: AgentState,
    exclude_document_ids: list[str],
) -> ToolResult:
    """P1 layer 3: select the BM25 top discovery documents for navigation."""
    excluded = set(exclude_document_ids) | state.ever_explored_doc_ids
    candidate_ids = [
        doc_id
        for doc_id in state.discovery_top_doc_ids
        if doc_id not in excluded
    ]
    if not candidate_ids:
        return ToolResult(
            status="no_confident_doc",
            payload={"reason": "no BM25 discovery candidates for fallback"},
        )
    result = await db.execute(
        select(
            Document.document_id,
            Document.source_file_name,
            Document.current_job_result_id,
        ).where(Document.document_id.in_(candidate_ids))
    )
    info: dict[str, tuple[str, str | None]] = {}
    for document_id, source_file_name, job_result_id in result.all():
        info[str(document_id)] = (
            source_file_name or str(document_id),
            job_result_id,
        )
    candidate_docs: list[dict[str, Any]] = []
    doc_id_to_name: dict[str, str] = {}
    doc_job_map: dict[str, str] = {}
    for doc_id in candidate_ids:
        entry = info.get(doc_id)
        if entry is None or not entry[1]:
            continue
        name, job_result_id = entry
        candidate_docs.append(
            {
                "document_id": doc_id,
                "source_file_name": name,
                "confidence": 1.0,
                "reason": "BM25 discovery fallback after empty LLM selection",
                "source": "bm25_fallback",
            }
        )
        doc_id_to_name[doc_id] = name
        doc_job_map[doc_id] = str(job_result_id)
    if not candidate_docs:
        return ToolResult(
            status="no_confident_doc",
            payload={
                "reason": "BM25 discovery fallback found no navigable documents"
            },
        )
    return ToolResult(
        status="selected_docs",
        payload={
            "candidate_docs": candidate_docs,
            "doc_id_to_name": doc_id_to_name,
            "doc_job_map": doc_job_map,
        },
    )


def _append_selected_docs(state: AgentState, kg_result: ToolResult) -> None:
    if kg_result.status != "selected_docs":
        return
    for doc_data in kg_result.payload.get("candidate_docs", []):
        state.selected_docs.append(
            CandidateDoc(
                document_id=doc_data.get("document_id", ""),
                source_file_name=doc_data.get("source_file_name", ""),
                confidence=doc_data.get("confidence", 0.0),
                reason=doc_data.get("reason", ""),
                source=doc_data.get("source", ""),
            )
        )
    state.doc_id_to_name.update(kg_result.payload.get("doc_id_to_name", {}))
    state.doc_job_map.update(kg_result.payload.get("doc_job_map", {}))
