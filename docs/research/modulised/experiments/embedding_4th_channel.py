#!/usr/bin/env python
"""Standalone retrieval experiment: 3-channel lexical BM25 RRF vs 4-channel hybrid.

Question: does adding an EMBEDDING 4th channel (bge-m3) to the weighted 3-channel
BM25 RRF improve retrieval on the 55-query SecDocs eval?

This script is read-only against the DB (only SELECT) and against the corpus
files. It does NOT modify the Ziru engine, the eval files, or the database.
It only makes local calls to the Unsloth Studio embeddings API.
"""

from __future__ import annotations

import json
import os
import re
import time
from collections import defaultdict
from math import ceil
from pathlib import Path

import numpy as np
import psycopg
import yaml
from rank_bm25 import BM25Okapi

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
EXPERIMENT_DIR = Path(__file__).resolve().parent
RESULTS_PATH = EXPERIMENT_DIR / "embedding_4th_channel_results.json"

DB = dict(host="127.0.0.1", port=5432, dbname="ziru", user="root", password="root123")

# Repo root: .../docs/research/modulised/experiments -> up 4 = .../ziru
REPO_ROOT = Path(__file__).resolve().parents[4]
EVAL_YAML = REPO_ROOT / "docs" / "research" / "modulised" / "docs" / "samples" / "SecDocs" / "eval" / "queries.yaml"
ENV_FILE = REPO_ROOT / "deploy" / ".env"

EMBEDDING_URL = "http://127.0.0.1:8888/v1/embeddings"
EMBEDDING_MODEL = "gpustack/bge-m3-GGUF"
EMBEDDING_DIM = 1024
EMBEDDING_BATCH = 32
MAX_CHARS = 8000
# bge-m3 via the local GGUF server rejects some long inputs with HTTP 500.
# Split long chunk content into overlapping segments and average the vectors so
# we keep the whole text while each request stays comfortably under the limit.
SEGMENT_CHARS = 800
SEGMENT_OVERLAP = 100

RRF_K = 60
WEIGHTS_LEXICAL = {"path": 1.0, "content": 2.0, "term": 1.5}
WEIGHTS_HYBRID = {"path": 1.0, "content": 2.0, "term": 1.5, "embedding": 1.5}
WEIGHTS_HYBRID_1 = {"path": 1.0, "content": 2.0, "term": 1.5, "embedding": 1.0}

TOP_KS = (8, 50)


def log(msg: str) -> None:
    print(msg, flush=True)


# ---------------------------------------------------------------------------
# Read API key from deploy/.env
# ---------------------------------------------------------------------------
def read_provider_key() -> str:
    txt = ENV_FILE.read_text()
    for line in txt.splitlines():
        if line.startswith("PROVIDER_KEY="):
            val = line.split("=", 1)[1].strip()
            return val.strip('"').strip("'").strip()
    raise RuntimeError("PROVIDER_KEY not found in deploy/.env")


# ---------------------------------------------------------------------------
# Database: load the active corpus once
# ---------------------------------------------------------------------------
def load_corpus() -> list[dict]:
    conn = psycopg.connect(**DB)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT c.chunk_id, c.chunk_type, c.content, c.content_search_text,
               c.path_search_text, c.term_search_text, c.source_chunk_path,
               s.section_path, d.source_file_name
        FROM document_chunks c
        JOIN documents d ON d.document_id = c.document_id
                          AND d.current_job_result_id = c.job_result_id
        LEFT JOIN document_sections s
          ON s.document_id = c.document_id AND s.section_id = c.section_id
        WHERE d.status = 'active'
        """
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()

    corpus = []
    for (
        chunk_id,
        chunk_type,
        content,
        content_search_text,
        path_search_text,
        term_search_text,
        source_chunk_path,
        section_path,
        source_file_name,
    ) in rows:
        section_path = section_path or source_chunk_path or ""
        corpus.append(
            {
                "chunk_id": chunk_id,
                "chunk_type": chunk_type,
                "content": content or "",
                "content_search_text": content_search_text or "",
                "path_search_text": path_search_text or "",
                "term_search_text": term_search_text or "",
                "source_chunk_path": source_chunk_path or "",
                "section_path": section_path,
                "source_file_name": source_file_name or "",
            }
        )
    return corpus


def load_queries() -> list[dict]:
    data = yaml.safe_load(EVAL_YAML.read_text())
    return data["queries"]


# ---------------------------------------------------------------------------
# Embeddings (bge-m3 via Unsloth Studio, OpenAI-compatible)
# ---------------------------------------------------------------------------
def _embed_request(texts: list[str], api_key: str) -> list[list[float]] | None:
    import urllib.request

    body = json.dumps({"model": EMBEDDING_MODEL, "input": texts}).encode("utf-8")
    req = urllib.request.Request(
        EMBEDDING_URL,
        data=body,
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + api_key},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    # Some servers return items out of order; key on index if present.
    items = data["data"]
    if any("index" in d for d in items):
        items = sorted(items, key=lambda d: d["index"])
    return [d["embedding"] for d in items]


def _embed_one_with_truncation(
    text: str, api_key: str, max_retries: int = 4
) -> list[float] | None:
    """Embed a single text; on HTTP 500 (likely too long) retry truncated."""
    candidate = text[:MAX_CHARS]
    for scale in (1.0, 0.85, 0.7, 0.5, 0.35, 0.2, 0.1):
        cut = max(int(len(candidate) * scale), 1)
        piece = candidate[:cut]
        for attempt in range(1, max_retries + 1):
            try:
                return _embed_request([piece], api_key)[0]
            except Exception as exc:
                if attempt == max_retries:
                    # No retries left at this length; try a shorter length.
                    break
                time.sleep(0.8 * attempt)
    return None


def embed_texts(
    texts: list[str], api_key: str, max_retries: int = 4
) -> list[list[float] | None]:
    """Embed a list of texts; returns None per item on unrecoverable failure."""
    out: list[list[float] | None] = [None] * len(texts)
    truncated = [t[:MAX_CHARS] if t else "" for t in texts]

    for start in range(0, len(truncated), EMBEDDING_BATCH):
        batch = truncated[start : start + EMBEDDING_BATCH]
        batch_idx = list(range(start, start + len(batch)))
        vecs = None
        for attempt in range(1, max_retries + 1):
            try:
                vecs = _embed_request(batch, api_key)
                break
            except Exception as exc:  # non-200 / timeout / connection
                log(
                    f"  embedding batch #{start // EMBEDDING_BATCH + 1} attempt "
                    f"{attempt} failed: {type(exc).__name__}: {exc}"
                )
                time.sleep(1.5 * attempt)
        if vecs is None:
            # Try each item individually so a single bad document does not
            # take down the whole batch.
            log(
                f"  embedding batch #{start // EMBEDDING_BATCH + 1} degraded to per-item"
            )
            for j, idx in enumerate(batch_idx):
                out[idx] = _embed_one_with_truncation(batch[j], api_key)
        else:
            for j, idx in enumerate(batch_idx):
                out[idx] = vecs[j]
    return out


# ---------------------------------------------------------------------------
# Channel construction
# ---------------------------------------------------------------------------
def tokenize(text: str) -> list[str]:
    # BM25 lexical channels: lowercase whitespace tokens, stripped of punctuation.
    return re.findall(r"[a-z0-9]+", text.lower())


def split_text_segments(text: str) -> list[str]:
    """Split text into overlapping segments each <= SEGMENT_CHARS."""
    if not text:
        return [""]
    if len(text) <= SEGMENT_CHARS:
        return [text]
    step = SEGMENT_CHARS - SEGMENT_OVERLAP
    segs = []
    i = 0
    while i < len(text):
        segs.append(text[i : i + SEGMENT_CHARS])
        i += step
    return segs


def build_bm25_channel(corpus: list[dict], field: str) -> BM25Okapi:
    return BM25Okapi([tokenize(c[field]) for c in corpus])


def term_scores(corpus: list[dict], query: str) -> list[float]:
    """Raw substring matching over term_search_text (mirrors the engine)."""
    q = query.lower()
    q_tokens = re.findall(r"[a-z0-9]+", q)
    scores = []
    for c in corpus:
        t = c["term_search_text"].lower()
        if not t:
            scores.append(0.0)
            continue
        if q in t:
            scores.append(100.0)
        else:
            cnt = sum(1 for tok in q_tokens if tok and tok in t)
            scores.append(float(cnt))
    return scores


def rank_by_scores(corpus: list[dict], scores: list[float]) -> list[str]:
    """Return chunk_ids sorted by (score desc, chunk_id asc)."""
    pairs = list(zip(scores, [c["chunk_id"] for c in corpus]))
    pairs.sort(key=lambda x: (-x[0], x[1]))
    return [cid for _, cid in pairs]


# ---------------------------------------------------------------------------
# RRF fusion
# ---------------------------------------------------------------------------
def fuse(
    channel_ranked: dict[str, list[str]],
    corpus_by_id: dict[str, dict],
    weights: dict[str, float],
    top_k: int,
) -> list[str]:
    contrib: defaultdict[str, float] = defaultdict(float)
    candidates = top_k * 2
    for channel, ranked_ids in channel_ranked.items():
        w = weights.get(channel, 0.0)
        if w == 0.0:
            continue
        for rank, cid in enumerate(ranked_ids[:candidates]):
            contrib[cid] += w / (RRF_K + rank + 1)
    # Deterministic ordering: score desc, then chunk_id asc.
    ordered = sorted(contrib.items(), key=lambda kv: (-kv[1], kv[0]))
    return [cid for cid, _ in ordered]


# ---------------------------------------------------------------------------
# Grading
# ---------------------------------------------------------------------------
def _files_equal(a: str, b: str) -> bool:
    return os.path.basename(a).strip().lower() == os.path.basename(b).strip().lower()


def _path_segments(path: str) -> set[str]:
    segs = [s.strip().lower() for s in re.split(r"\s*/\s*", path or "") if s.strip()]
    return set(segs)


def _section_match(expected: str, returned: str) -> bool:
    exp_segs = _path_segments(expected)
    ret_segs = _path_segments(returned)
    if not exp_segs:
        return True
    return exp_segs.issubset(ret_segs)


def _doc_match(expected: str, returned_files: list[str]) -> bool:
    return any(_files_equal(expected, f) for f in returned_files)


def eval_query_results(query: dict, results: list[dict]) -> dict:
    """Evaluate a single query against a list of (chunk) results."""
    exp = query["expect"]
    expected_docs = exp.get("documents", [])
    expected_sections = exp.get("sections", [])
    expected_chunks = exp.get("chunks", [])
    must_not = exp.get("must_not_documents", []) or []

    file_names = [r["source_file_name"] for r in results]
    section_paths = [r["section_path"] for r in results]

    doc_ok = all(_doc_match(doc, file_names) for doc in expected_docs)
    sec_ok = all(
        any(_section_match(exp_sec, sp) for sp in section_paths)
        for exp_sec in expected_sections
    )
    chunk_ok = all(
        any(
            r["chunk_type"] == req["type"]
            and (req.get("text_substr") or "").lower()
            in (r["content"] or "").lower()
            for r in results
        )
        for req in expected_chunks
    )
    must_ok = all(not _doc_match(mn, file_names) for mn in must_not)

    passed = doc_ok and sec_ok and chunk_ok and must_ok
    return {
        "doc_ok": doc_ok,
        "section_ok": sec_ok,
        "chunk_ok": chunk_ok,
        "must_not_ok": must_ok,
        "pass": passed,
    }


def coverage_ranks(query: dict, results: list[dict], what: str) -> dict:
    """Rank (1-indexed) at which each piece of expected evidence is first covered.

    what = 'documents' | 'sections' | 'chunks'
    Returns {'ranks': [...], 'covered_at': int | None}.
    """
    exp = query["expect"]
    ranks = []
    if what == "documents":
        items = exp.get("documents", [])
        for doc in items:
            found = None
            for i, r in enumerate(results):
                if _doc_match(doc, [r["source_file_name"]]):
                    found = i + 1
                    break
            ranks.append(found)
    elif what == "sections":
        items = exp.get("sections", [])
        for sec in items:
            found = None
            for i, r in enumerate(results):
                if _section_match(sec, r["section_path"]):
                    found = i + 1
                    break
            ranks.append(found)
    elif what == "chunks":
        items = exp.get("chunks", [])
        for req in items:
            req_type = req["type"] if isinstance(req, dict) else req.get("type")
            req_substr = req["text_substr"] if isinstance(req, dict) else req.get("text_substr")
            found = None
            for i, r in enumerate(results):
                if r["chunk_type"] == req_type and (req_substr or "").lower() in (
                    r["content"] or ""
                ).lower():
                    found = i + 1
                    break
            ranks.append(found)
    else:
        raise ValueError(what)
    covered_ranks = [r for r in ranks if r is not None]
    covered_at = max(covered_ranks) if covered_ranks else None
    return {"ranks": ranks, "covered_at": covered_at}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    t0 = time.time()
    log(f"Loading eval from {EVAL_YAML}")
    queries = load_queries()
    log(f"Loaded {len(queries)} queries")

    log("Loading active corpus from Postgres...")
    corpus = load_corpus()
    corpus_by_id = {c["chunk_id"]: c for c in corpus}
    log(f"Loaded {len(corpus)} active chunks")

    api_key = read_provider_key()
    log(f"Embedding URL: {EMBEDDING_URL}; model: {EMBEDDING_MODEL}")

    # --- chunk embeddings (content, with fallbacks) ---
    # Long contents are split into segments and averaged so the whole text is
    # represented while each API call stays under the server's length limit.
    log("Embedding chunk contents (bge-m3, segment-averaged)...")
    seg_flat: list[str] = []
    seg_owner: list[int] = []
    for ci, c in enumerate(corpus):
        text = c["content"].strip()
        if not text:
            text = c["content_search_text"].strip()
        if not text:
            text = c["term_search_text"]
        segs = split_text_segments(text)
        for s in segs:
            seg_flat.append(s)
            seg_owner.append(ci)
    seg_vecs = embed_texts(seg_flat, api_key)
    seg_ok = sum(1 for v in seg_vecs if v is not None)
    log(f"Embedded {seg_ok}/{len(seg_flat)} text segments")

    # Average segment vectors per chunk; failed chunks become zero vectors.
    ids_by_owner: dict[int, list[int]] = defaultdict(list)
    for si, oi in enumerate(seg_owner):
        ids_by_owner[oi].append(si)
    chunk_vec_mat = np.zeros((len(corpus), EMBEDDING_DIM), dtype=np.float32)
    n_embed_none = 0
    for ci in range(len(corpus)):
        idxs = ids_by_owner.get(ci, [])
        vecs = [seg_vecs[i] for i in idxs if seg_vecs[i] is not None]
        if vecs:
            vec = np.mean(np.array(vecs, dtype=np.float32), axis=0)
            if not np.isfinite(vec).all():
                vec = np.zeros(EMBEDDING_DIM, dtype=np.float32)
                n_embed_none += 1
            chunk_vec_mat[ci] = vec
        else:
            n_embed_none += 1
    log(f"Built {len(corpus) - n_embed_none}/{len(corpus)} chunk vectors "
        f"({n_embed_none} chunks with no usable segments)")

    # --- query embeddings ---
    log("Embedding queries...")
    q_embeddings = embed_texts([q["query"] for q in queries], api_key)

    # Build lexical channels once.
    log("Building BM25Okapi channels (path, content)...")
    bm25_path = build_bm25_channel(corpus, "path_search_text")
    bm25_content = build_bm25_channel(corpus, "content_search_text")

    chunk_ids = [c["chunk_id"] for c in corpus]
    chunk_id_index = {cid: i for i, cid in enumerate(chunk_ids)}

    # Precompute per-query channel rankings for lexical channels + embedding.
    # Each channel_ranked is {channel: [chunk_ids ranked best-first]}.
    per_query_channel = {}
    for qi, q in enumerate(queries):
        qtokens = tokenize(q["query"])
        path_scores = bm25_path.get_scores(qtokens)
        content_scores = bm25_content.get_scores(qtokens)
        term_scr = term_scores(corpus, q["query"])

        ranked = {
            "path": rank_by_scores(corpus, list(path_scores)),
            "content": rank_by_scores(corpus, list(content_scores)),
            "term": [
                cid for cid, s in zip(chunk_ids, term_scr) if s > 0
            ],
        }
        # Term channel keeps only matching rows; re-rank within matches by score.
        term_pairs = [(cid, s) for cid, s in zip(chunk_ids, term_scr) if s > 0]
        term_pairs.sort(key=lambda x: (-x[1], x[0]))
        ranked["term"] = [cid for cid, _ in term_pairs]

        # Embedding ranked list (if available).
        qvec = q_embeddings[qi]
        if qvec is not None and chunk_vec_mat is not None:
            qv = np.asarray(qvec, dtype=np.float32)
            qn = np.linalg.norm(qv)
            if qn > 0:
                with np.errstate(divide="ignore", invalid="ignore", over="ignore"):
                    sims = chunk_vec_mat @ qv / (
                        np.linalg.norm(chunk_vec_mat, axis=1) * qn + 1e-9
                    )
                sims = np.where(np.isfinite(sims), sims, 0.0).astype(np.float32)
            else:
                sims = np.zeros(len(corpus), dtype=np.float32)
            ranked["embedding"] = rank_by_scores(corpus, list(sims))
        else:
            ranked["embedding"] = []

        per_query_channel[q["id"]] = ranked

    log("Fusing and grading...")
    # config name -> (weights)
    configs = {
        "lexical_3ch": WEIGHTS_LEXICAL,
        "hybrid_4ch": WEIGHTS_HYBRID,
        "hybrid_4ch_emb1.0": WEIGHTS_HYBRID_1,
    }

    results_by_query = {}
    aggregates = {}
    for config_name, weights in configs.items():
        per_q = {}
        for top_k in TOP_KS:
            agg = {
                "total": len(queries),
                "pass": 0,
                "doc_fail": 0,
                "section_fail": 0,
                "chunk_fail": 0,
                "must_not_fail": 0,
                "queries": {},
            }
            for q in queries:
                ranked = per_query_channel[q["id"]]
                fused = fuse(ranked, corpus_by_id, weights, top_k)
                results = [corpus_by_id[cid] for cid in fused[:top_k]]
                ev = eval_query_results(q, results)
                agg["queries"][q["id"]] = {
                    "pass": ev["pass"],
                    "doc_ok": ev["doc_ok"],
                    "section_ok": ev["section_ok"],
                    "chunk_ok": ev["chunk_ok"],
                    "must_not_ok": ev["must_not_ok"],
                    "top_k": top_k,
                }
                if ev["pass"]:
                    agg["pass"] += 1
                if not ev["doc_ok"]:
                    agg["doc_fail"] += 1
                if not ev["section_ok"]:
                    agg["section_fail"] += 1
                if not ev["chunk_ok"]:
                    agg["chunk_fail"] += 1
                if not ev["must_not_ok"]:
                    agg["must_not_fail"] += 1
            per_q[top_k] = agg
        results_by_query[config_name] = per_q
        aggregates[config_name] = {
            top_k: {
                "total": per_q[top_k]["total"],
                "pass": per_q[top_k]["pass"],
                "pass_rate": round(per_q[top_k]["pass"] / per_q[top_k]["total"], 4),
                "doc_fail": per_q[top_k]["doc_fail"],
                "section_fail": per_q[top_k]["section_fail"],
                "chunk_fail": per_q[top_k]["chunk_fail"],
                "must_not_fail": per_q[top_k]["must_not_fail"],
            }
            for top_k in TOP_KS
        }

    # --- flip analysis between lexical and hybrid ---
    flips = {}
    for top_k in TOP_KS:
        lex = {qid: d["pass"] for qid, d in results_by_query["lexical_3ch"][top_k]["queries"].items()}
        hyb = {qid: d["pass"] for qid, d in results_by_query["hybrid_4ch"][top_k]["queries"].items()}
        fail_to_pass = sorted([qid for qid in lex if not lex[qid] and hyb[qid]])
        pass_to_fail = sorted([qid for qid in lex if lex[qid] and not hyb[qid]])
        flips[top_k] = {
            "fail_to_pass": fail_to_pass,
            "pass_to_fail": pass_to_fail,
            "n_fail_to_pass": len(fail_to_pass),
            "n_pass_to_fail": len(pass_to_fail),
        }

    # --- embedding contribution / placement analysis ---
    # For each expected evidence piece (section / chunk / document), determine
    # whether it is present within top-k in the lexical baseline and in the
    # hybrid. "only due to embedding" = present in hybrid at <=top_k but absent
    # from lexical at <=top_k.
    contrib = {}
    for top_k in TOP_KS:
        n_sec_new = 0
        n_chunk_new = 0
        n_doc_new = 0
        n_q_sec_emb_only = 0
        n_q_chunk_emb_only = 0
        n_q_doc_emb_only = 0
        lists_info = []
        for q in queries:
            # build lexical results and hybrid results
            lex_ranked = per_query_channel[q["id"]]
            lex_fused = fuse(lex_ranked, corpus_by_id, WEIGHTS_LEXICAL, top_k)
            hyb_fused = fuse(lex_ranked, corpus_by_id, WEIGHTS_HYBRID, top_k)
            lex_results = [corpus_by_id[cid] for cid in lex_fused[:top_k]]
            hyb_results = [corpus_by_id[cid] for cid in hyb_fused[:top_k]]

            lex_sec = coverage_ranks(q, lex_results, "sections")
            hyb_sec = coverage_ranks(q, hyb_results, "sections")
            lex_chunk = coverage_ranks(q, lex_results, "chunks")
            hyb_chunk = coverage_ranks(q, hyb_results, "chunks")
            lex_doc = coverage_ranks(q, lex_results, "documents")
            hyb_doc = coverage_ranks(q, hyb_results, "documents")

            new_sec = sum(
                1 for le, hy in zip(lex_sec["ranks"], hyb_sec["ranks"])
                if le is None and hy is not None
            )
            new_chunk = sum(
                1 for le, hy in zip(lex_chunk["ranks"], hyb_chunk["ranks"])
                if le is None and hy is not None
            )
            new_doc = sum(
                1 for le, hy in zip(lex_doc["ranks"], hyb_doc["ranks"])
                if le is None and hy is not None
            )
            n_sec_new += new_sec
            n_chunk_new += new_chunk
            n_doc_new += new_doc
            if new_sec:
                n_q_sec_emb_only += 1
            if new_chunk:
                n_q_chunk_emb_only += 1
            if new_doc:
                n_q_doc_emb_only += 1
            lists_info.append({
                "qid": q["id"],
                "lex_sec_rank": lex_sec["covered_at"],
                "hyb_sec_rank": hyb_sec["covered_at"],
                "lex_chunk_rank": lex_chunk["covered_at"],
                "hyb_chunk_rank": hyb_chunk["covered_at"],
                "lex_doc_rank": lex_doc["covered_at"],
                "hyb_doc_rank": hyb_doc["covered_at"],
                "new_section_evidence": new_sec,
                "new_chunk_evidence": new_chunk,
                "new_doc_evidence": new_doc,
            })
        contrib[top_k] = {
            "section_evidence_new": n_sec_new,
            "chunk_evidence_new": n_chunk_new,
            "doc_evidence_new": n_doc_new,
            "queries_section_emb_only": n_q_sec_emb_only,
            "queries_chunk_emb_only": n_q_chunk_emb_only,
            "queries_doc_emb_only": n_q_doc_emb_only,
            "detail": lists_info,
        }

    # ---- write results ----
    payload = {
        "experiment": "embedding_4th_channel_sec_docs",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "config": {
            "rrf_k": RRF_K,
            "top_ks": list(TOP_KS),
            "weights": {
                "lexical_3ch": WEIGHTS_LEXICAL,
                "hybrid_4ch": WEIGHTS_HYBRID,
                "hybrid_4ch_emb1.0": WEIGHTS_HYBRID_1,
            },
            "embedding_model": EMBEDDING_MODEL,
            "embedding_dim": EMBEDDING_DIM,
            "n_queries": len(queries),
            "n_chunks": len(corpus),
            "n_chunk_embeddings_failed": n_embed_none,
        },
        "aggregates": aggregates,
        "results_by_query": results_by_query,
        "flips_lexical_vs_hybrid": flips,
        "embedding_placement": contrib,
    }
    RESULTS_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    log(f"Wrote {RESULTS_PATH}")

    # ---- console summary ----
    summary = build_summary(aggregates, flips, contrib, n_embed_none)
    log("\n" + summary)


def build_summary(aggregates, flips, contrib, n_embed_none) -> str:
    lines = []
    lines.append("=" * 78)
    lines.append("SecDocs 55-query retrieval: 3-channel lexical BM25 RRF vs 4-channel hybrid")
    lines.append("=" * 78)

    for top_k in TOP_KS:
        lx = aggregates["lexical_3ch"][top_k]
        hy = aggregates["hybrid_4ch"][top_k]
        h1 = aggregates["hybrid_4ch_emb1.0"][top_k]
        lines.append(f"\n--- top_k = {top_k} ---")
        lines.append(
            f"LEXICAL 3ch       pass {lx['pass']}/{lx['total']} "
            f"({lx['pass_rate']*100:.1f}%)  "
            f"doc_fail {lx['doc_fail']} sec_fail {lx['section_fail']} "
            f"chunk_fail {lx['chunk_fail']} must_not_fail {lx['must_not_fail']}"
        )
        lines.append(
            f"HYBRID  4ch       pass {hy['pass']}/{hy['total']} "
            f"({hy['pass_rate']*100:.1f}%)  "
            f"doc_fail {hy['doc_fail']} sec_fail {hy['section_fail']} "
            f"chunk_fail {hy['chunk_fail']} must_not_fail {hy['must_not_fail']}"
        )
        lines.append(
            f"HYBRID  4ch w1.0  pass {h1['pass']}/{h1['total']} "
            f"({h1['pass_rate']*100:.1f}%)"
        )
        fl = flips[top_k]
        lines.append(
            f"  flips lexical->hybrid: {fl['n_fail_to_pass']} pass, "
            f"{fl['n_pass_to_fail']} fail"
        )
        if fl["fail_to_pass"]:
            lines.append(f"    newly passing: {', '.join(fl['fail_to_pass'])}")
        if fl["pass_to_fail"]:
            lines.append(f"    newly failing: {', '.join(fl['pass_to_fail'])}")

    lines.append("\n--- embedding-only placements (evidence within top-k only via embedding) ---")
    for top_k in TOP_KS:
        c = contrib[top_k]
        lines.append(
            f"  @{top_k}: section-only {c['queries_section_emb_only']}, "
            f"chunk-only {c['queries_chunk_emb_only']}, "
            f"doc-only {c['queries_doc_emb_only']}"
        )
        lines.append(
            f"          (evidence pieces newly within top-k via embedding: "
            f"section {c['section_evidence_new']}, chunk {c['chunk_evidence_new']}, "
            f"doc {c['doc_evidence_new']})"
        )

    if n_embed_none:
        lines.append(f"\nNOTE: {n_embed_none} chunk embeddings failed/skipped.")
    lines.append("=" * 78)
    return "\n".join(lines)


if __name__ == "__main__":
    main()
