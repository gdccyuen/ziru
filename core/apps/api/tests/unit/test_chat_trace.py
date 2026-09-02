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


class _FakeSynthesisClient:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def chat_completion_with_usage(self, **kwargs):
        self.calls.append(kwargs)
        return self.responses.pop(0)


def _empty_usage():
    return {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}


def test_synthesis_answer_retries_once_when_first_response_is_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = _chat_service()
    usage1 = _empty_usage()
    usage2 = {"prompt_tokens": 12, "completion_tokens": 4, "total_tokens": 16}
    client = _FakeSynthesisClient([("", usage1), ("  retried answer  ", usage2)])
    monkeypatch.setattr(service, "get_text_client", lambda: (client, "test-model"))

    answer, usage = service._synthesis_answer_sync("question?", [])

    assert answer == "retried answer"
    assert usage == usage2
    assert [call["max_tokens"] for call in client.calls] == [8192, 16384]
    assert client.calls[0]["messages"] == client.calls[1]["messages"]


def test_synthesis_answer_returns_empty_after_two_empty_responses(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = _chat_service()
    usage1 = _empty_usage()
    usage2 = _empty_usage()
    client = _FakeSynthesisClient([("", usage1), ("   ", usage2)])
    monkeypatch.setattr(service, "get_text_client", lambda: (client, "test-model"))

    answer, usage = service._synthesis_answer_sync("question?", [])

    assert answer == ""
    assert usage == usage2
    assert [call["max_tokens"] for call in client.calls] == [8192, 16384]


def test_synthesis_answer_does_not_retry_when_first_response_is_nonempty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = _chat_service()
    usage = {"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5}
    client = _FakeSynthesisClient([("  first answer  ", usage)])
    monkeypatch.setattr(service, "get_text_client", lambda: (client, "test-model"))

    answer, returned_usage = service._synthesis_answer_sync("question?", [])

    assert answer == "first answer"
    assert returned_usage == usage
    assert [call["max_tokens"] for call in client.calls] == [8192]
