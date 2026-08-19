from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from shared.models.database.document import (
    Document,
    DocumentChunk,
    GraphEdge,
    GraphNode,
)
from shared.services.retrieval.graph.keywords import (
    KEYWORD_SCORE_WEIGHT,
    MIN_ENTITY_OVERLAP,
    MIN_KEYWORD_OVERLAP,
    MIN_SCORE_THRESHOLD,
    compute_entity_score,
    compute_keyword_score,
    compute_tfidf_keywords,
    extract_document_top_summary,
    get_normalized_entity_set,
    get_normalized_keyword_set,
    normalize_keyword,
)

logger = logging.getLogger(__name__)


def _parse_stored_entities(stored: object) -> set[tuple[str, str]]:
    """Reconstruct a (type, text) set from a node's stored top_entities.

    Stored form is a list of "type:text" strings (or bare "text" when the
    entity was untyped). Splits on the first colon only, since entity text may
    itself contain colons.
    """
    if not isinstance(stored, list):
        return set()
    result: set[tuple[str, str]] = set()
    for item in stored:
        token = str(item).strip()
        if not token:
            continue
        if ":" in token:
            etype, etext = token.split(":", 1)
            result.add((etype.strip(), etext.strip()))
        else:
            result.add(("", token))
    return result


class DocumentGraphService:
    """Write-side graph publication over persisted graph_nodes/graph_edges.

    Knowledge objects are standalone (Q2): no user/namespace scope columns.
    """

    def publish_document_graph(
        self,
        db: Session,
        *,
        document_id: str,
        job_result_id: str,
        top_summary: str | None = None,
    ) -> None:
        document = db.execute(
            select(Document).where(Document.document_id == document_id)
        ).scalar_one_or_none()
        if document is None:
            return

        chunk_meta_rows = list(
            db.execute(
                select(DocumentChunk.chunk_type, DocumentChunk.chunk_metadata)
                .where(DocumentChunk.document_id == document_id)
                .where(DocumentChunk.job_result_id == job_result_id)
            ).all()
        )
        chunk_metadata_list = [row[1] or {} for row in chunk_meta_rows]

        top_keywords = compute_tfidf_keywords(chunk_metadata_list)
        new_doc_kws = get_normalized_keyword_set(chunk_metadata_list)
        new_doc_entities = get_normalized_entity_set(chunk_metadata_list)

        types_breakdown: dict[str, int] = defaultdict(int)
        for chunk_type, _ in chunk_meta_rows:
            types_breakdown[chunk_type or 'text'] += 1
        chunks_count = len(chunk_meta_rows)

        resolved_top_summary = str(top_summary or "").strip()
        if not resolved_top_summary:
            resolved_top_summary = extract_document_top_summary(chunk_metadata_list)

        # Clean up old graph data for this document
        self.remove_document_graph(db, document_id=document_id)

        top_entities = sorted(
            f"{etype}:{etext}" if etype else etext
            for etype, etext in new_doc_entities
        )

        document_node_id = f"doc:{document_id}"
        db.add(
            GraphNode(
                node_id=document_node_id,
                node_kind='document',
                owner_document_id=document_id,
                job_result_id=job_result_id,
                ref_document_id=document_id,
                ref_section_id=None,
                properties={
                    'source_file_name': document.source_file_name,
                    'top_keywords': top_keywords,
                    'top_entities': top_entities,
                    'chunks_count': chunks_count,
                    'types': dict(types_breakdown),
                    'top_summary': resolved_top_summary,
                },
            )
        )
        db.flush()

        # Cross-document edges (global graph)
        other_doc_nodes = list(
            db.execute(
                select(GraphNode)
                .where(GraphNode.node_kind == 'document')
                .where(GraphNode.owner_document_id != document_id)
            ).scalars()
        )

        for peer_node in other_doc_nodes:
            peer_props = peer_node.properties or {}

            edge_props = self._build_edge_properties(
                new_doc_entities=new_doc_entities,
                new_doc_kws=new_doc_kws,
                peer_entities=_parse_stored_entities(
                    peer_props.get('top_entities', [])
                ),
                peer_keywords=peer_props.get('top_keywords', []),
            )
            if edge_props is None:
                continue
            score = edge_props.pop('_score')

            peer_doc_id = peer_node.owner_document_id
            edge_pair = tuple(sorted([document_id, peer_doc_id]))
            db.add(
                GraphEdge(
                    edge_id=f"related:{edge_pair[0]}<->{edge_pair[1]}",
                    edge_kind='related',
                    source_node_id=document_node_id,
                    target_node_id=peer_node.node_id,
                    owner_document_id=document_id,
                    job_result_id=job_result_id,
                    is_directed=False,
                    weight=round(score, 4),
                    properties=edge_props,
                )
            )

        db.flush()
        logger.info(
            f"publish_document_graph: doc={document_id} "
            f"keywords={len(top_keywords)} entities={len(top_entities)} "
            f"chunks={chunks_count}"
        )

    def remove_document_graph(self, db: Session, *, document_id: str) -> None:
        db.execute(
            delete(GraphEdge).where(
                (GraphEdge.owner_document_id == document_id)
                | (GraphEdge.source_node_id == f"doc:{document_id}")
                | (GraphEdge.target_node_id == f"doc:{document_id}")
            )
        )
        db.execute(
            delete(GraphNode).where(GraphNode.owner_document_id == document_id)
        )

    @staticmethod
    def _build_edge_properties(
        *,
        new_doc_entities: set[tuple[str, str]],
        new_doc_kws: set[str],
        peer_entities: set[tuple[str, str]],
        peer_keywords: list,
    ) -> dict[str, Any] | None:
        if new_doc_entities and peer_entities:
            shared_entities = new_doc_entities & peer_entities
            if len(shared_entities) >= MIN_ENTITY_OVERLAP:
                score = compute_entity_score(
                    shared_entities=shared_entities,
                    entities_a=new_doc_entities,
                    entities_b=peer_entities,
                    weight=KEYWORD_SCORE_WEIGHT,
                )
                if score >= MIN_SCORE_THRESHOLD:
                    return {
                        '_score': score,
                        'edge_basis': 'entities',
                        'shared_entities': sorted(
                            f"{etype}:{etext}" if etype else etext
                            for etype, etext in shared_entities
                        ),
                        'connection_count': len(shared_entities),
                    }

        peer_kws: set[str] = set()
        for k in peer_keywords:
            normalized = normalize_keyword(str(k))
            if normalized:
                peer_kws.add(normalized)
        if not new_doc_kws or not peer_kws:
            return None

        shared_kws = new_doc_kws & peer_kws
        if len(shared_kws) < MIN_KEYWORD_OVERLAP:
            return None

        score = compute_keyword_score(
            shared_keywords=shared_kws,
            keywords_a=new_doc_kws,
            keywords_b=peer_kws,
            weight=KEYWORD_SCORE_WEIGHT,
        )
        if score < MIN_SCORE_THRESHOLD:
            return None

        return {
            '_score': score,
            'edge_basis': 'keywords',
            'shared_keywords': sorted(shared_kws),
            'connection_count': len(shared_kws),
        }
