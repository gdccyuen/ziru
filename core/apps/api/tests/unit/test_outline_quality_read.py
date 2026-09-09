"""Unit tests for deriving Outline Quality on read (ADR-0004).

The verdict is computed from a Document's published sections, never read from
stored state, so these tests fake the repository and assert the seam.
"""

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

# Defer importing apps/api `app` until test bodies run (both apps/api and
# apps/worker use the package name `app`).
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


class _Section:
    def __init__(self, level: int, title: str, path: str) -> None:
        self.section_level = level
        self.section_title = title
        self.section_path = path


class _Document:
    document_id = "doc_1"
    status = "active"
    current_job_result_id = "jr_1"
    source_file_name = "sample.pdf"
    document_metadata: dict[str, Any] = {}
    created_at = None
    updated_at = None
    archived_at = None


class _FakeRepository:
    def __init__(self, sections: list[_Section]) -> None:
        self._sections = sections
        self.batched_section_calls = 0

    async def count_documents_matching(self, db: Any, *, constraints: Any) -> int:
        return 1

    async def list_documents_matching(
        self, db: Any, *, constraints: Any, limit: int, offset: int
    ) -> list[_Document]:
        return [_Document()]

    async def get_document_attributes_map(self, db: Any, *, document_ids: Any):
        return {}

    async def get_user_emails_by_ids(self, db: Any, *, user_ids: Any):
        return {}

    async def list_current_sections_by_document(
        self, db: Any, *, documents: Any
    ) -> dict[str, list[_Section]]:
        self.batched_section_calls += 1
        return {"doc_1": self._sections}


def _misassigned_sections() -> list[_Section]:
    # The G3_EN shape: chapters one level too deep but the numbering is clean.
    return [
        _Section(2, "1. Intro", "sample.pdf / 1. Intro"),
        _Section(3, "1.1 A", "sample.pdf / 1. Intro / 1.1 A"),
        _Section(2, "2. Next", "sample.pdf / 2. Next"),
    ]


async def test_list_documents_v2_derives_outline_quality_from_sections() -> None:
    _prioritize_api_import_root()
    _drop_api_app_modules()
    from app.services.documents.lifecycle_service import DocumentService

    repository = _FakeRepository(_misassigned_sections())
    service = DocumentService(repository=repository)

    result = await service.list_documents_v2(
        db=None,  # the fake repository ignores the session
        page=1,
        page_size=10,
        constraints=[],
    )

    payload = result["documents"][0]
    assert payload["outline_quality"]["verdict"] == "resolver_recoverable"
    assert payload["outline_quality"]["resolver_score"] == 1.0
    # One batched sections query for the whole page, not one per document.
    assert repository.batched_section_calls == 1


def test_outline_verdict_payload_is_none_without_sections() -> None:
    _prioritize_api_import_root()
    _drop_api_app_modules()
    from app.services.documents.lifecycle_service import outline_verdict_payload

    assert outline_verdict_payload([]) is None
