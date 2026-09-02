"""Unit tests for chat turn trace and marker prompt helpers."""

from __future__ import annotations

import sys
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest
from tests.support.import_environment import (
    configure_import_environment,
    ensure_import_paths,
)

configure_import_environment()
ensure_import_paths()

_API_ROOT = str(Path(__file__).resolve().parents[2])


def _is_api_app_module(module: ModuleType | None) -> bool:
    if module is None:
        return False
    module_file = getattr(module, "__file__", None)
    if isinstance(module_file, str) and module_file.startswith(_API_ROOT):
        return True
    module_paths = getattr(module, "__path__", ())
    try:
        return any(str(path).startswith(_API_ROOT) for path in module_paths)
    except KeyError:
        return False


def _drop_api_app_modules() -> None:
    for module_name in sorted(sys.modules, key=len, reverse=True):
        if module_name != "app" and not module_name.startswith("app."):
            continue
        if _is_api_app_module(sys.modules.get(module_name)):
            sys.modules.pop(module_name, None)


def _prioritize_api_import_root() -> None:
    ensure_import_paths()
    if _API_ROOT in sys.path:
        sys.path.remove(_API_ROOT)
    sys.path.insert(0, _API_ROOT)


@pytest.fixture(autouse=True)
def _clear_api_app_modules_after_unit_test():
    yield
    _drop_api_app_modules()


def _chat_service() -> Any:
    _prioritize_api_import_root()
    _drop_api_app_modules()
    from app.services.chat import chat_service

    return chat_service


def test_synthesis_prompt_instructs_source_marker_protocol() -> None:
    prompt = _chat_service()._synthesis_prompt(
        "where is alpha?",
        [
            {
                "content": "alpha lives here",
                "source": {
                    "section_path": "contract/intro",
                    "source_file_name": "finance.pdf",
                },
            }
        ],
    )

    assert "[1] Section: contract/intro" in prompt
    assert "[Source N: label]" in prompt
    assert "Reference sections by their paths in parentheses" not in prompt


def test_retrieval_trace_queries_uses_existing_results() -> None:
    queries = _chat_service()._retrieval_trace_queries(
        "alpha",
        {"router_used": "classic"},
        [
            {"chunk_id": "c1", "score": 0.81},
            {"chunk_id": "c2", "score": 0.63},
            {"chunk_id": "c1", "score": None},
        ],
    )

    assert queries == [
        {
            "query": "alpha",
            "namespace": "classic",
            "result_count": 3,
            "referenced_chunk_count": 2,
            "top_scores": [0.81, 0.63],
        }
    ]


def test_retrieval_trace_queries_handles_empty_citations() -> None:
    queries = _chat_service()._retrieval_trace_queries(
        "alpha",
        {"router_used": "empty_corpus_scoped"},
        [],
    )

    assert queries == [
        {
            "query": "alpha",
            "namespace": "empty_corpus_scoped",
            "result_count": 0,
            "referenced_chunk_count": 0,
            "top_scores": [],
        }
    ]
