"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import {
  ApiError,
  api,
  originalFileUrl,
  type AttributeEntry,
  type DocumentItem,
  type RetrievalResult,
} from "@/lib/api";
import {
  getCorpusScope,
  setCorpusScope,
  subscribeCorpusScope,
  type CorpusScope,
} from "@/lib/corpus-scope";
import { formatDateTime } from "@/lib/format";
import { ChatChunkPane } from "@/components/chat-chunk-pane";

/** Built-in/system attribute keys, hidden from the hover tooltip. */
const SYSTEM_ATTR_KEYS = new Set([
  "createBy",
  "createTime",
  "fileHash",
  "originalFile",
]);

const PAGE_SIZE = 25;

function statusBadge(status: string): string {
  if (status === "done") return "text-bg-success";
  if (status === "failed") return "text-bg-danger";
  return "text-bg-secondary";
}

/** Build a synthetic citation so ChatChunkPane can render a doc's tree. */
function treeCitation(document: DocumentItem): RetrievalResult {
  return {
    chunk_id: document.document_id,
    chunk_type: "text",
    content: "",
    content_source: "content",
    score: null,
    asset_url: null,
    source_chunk_path: null,
    metadata: null,
    source: {
      document_id: document.document_id,
      source_file_name: document.source_file_name ?? document.document_id,
      section_path: null,
    },
  };
}

export default function DocumentsPage() {
  const searchParams = useSearchParams();
  const highlightDocument = searchParams.get("document");
  const [attributes, setAttributes] = useState<AttributeEntry[]>([]);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [corpusScope, setCorpusScopeState] = useState<CorpusScope>(() =>
    getCorpusScope(),
  );
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"filename" | "creator" | "created">(
    "filename",
  );
  const [treeDoc, setTreeDoc] = useState<DocumentItem | null>(null);
  const [reparsingId, setReparsingId] = useState<string | null>(null);
  const [reparseError, setReparseError] = useState<string | null>(null);

  const sortedDocuments = useMemo(() => {
    const list = [...documents];
    list.sort((a, b) => {
      if (sortBy === "creator") {
        return (a.creator_email ?? "").localeCompare(b.creator_email ?? "");
      }
      if (sortBy === "created") {
        const ta = a.created_at ? Date.parse(a.created_at) : 0;
        const tb = b.created_at ? Date.parse(b.created_at) : 0;
        return ta - tb;
      }
      return (a.source_file_name ?? "").localeCompare(b.source_file_name ?? "");
    });
    return list;
  }, [documents, sortBy]);

  useEffect(() => {
    void (async () => {
      try {
        const entries = await api.attributes();
        setAttributes(entries);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load attributes.");
      }
    })();
  }, []);

  useEffect(() => subscribeCorpusScope((scope) => setCorpusScopeState(scope)), []);

  const requestIdRef = useRef(0);
  const loadDocuments = useCallback(
    (silent: boolean) => {
      const requestId = ++requestIdRef.current;
      if (!silent) setLoading(true);
      setError(null);
      const filters: string[] = [];
      for (const [key, values] of Object.entries(selected)) {
        for (const value of values) filters.push(key + "=" + value);
      }
      api
        .documents({ page, page_size: PAGE_SIZE, filters })
        .then((response) => {
          if (requestId !== requestIdRef.current) return;
          setDocuments(response.documents);
          setTotalPages(response.pagination.total_pages);
          setTotal(response.pagination.total);
        })
        .catch((err) => {
          if (requestId !== requestIdRef.current) return;
          if (!silent) {
            setError(err instanceof ApiError ? err.message : "Failed to load documents.");
          }
        })
        .finally(() => {
          if (!silent && requestId === requestIdRef.current) setLoading(false);
        });
    },
    [page, selected],
  );

  const loadDocumentsRef = useRef(loadDocuments);
  loadDocumentsRef.current = loadDocuments;

  // Re-query on filter/page change (show the loading spinner).
  useEffect(() => {
    loadDocuments(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDocuments]);

  // Auto-refresh the table every minute, silently (no loading flash).
  useEffect(() => {
    const id = window.setInterval(() => loadDocumentsRef.current(true), 60_000);
    return () => window.clearInterval(id);
  }, []);

  function toggleValue(key: string, value: string) {
    const values = selected[key] ?? [];
    const nextValues = values.includes(value)
      ? values.filter((item) => item !== value)
      : [...values, value];
    const next = { ...selected, [key]: nextValues };
    setSelected(next);
    setCorpusScope(selectedToScope(next));
    setPage(1);
  }

  function selectedToScope(filters: Record<string, string[]>): CorpusScope {
    return Object.entries(filters)
      .filter(([, values]) => values.length > 0)
      .map(([key, values]) => ({ key, values }));
  }

  async function handleReparse(
    document: DocumentItem,
    backend: "pipeline" | "vlm-engine",
  ) {
    setReparsingId(document.document_id);
    setReparseError(null);
    try {
      await api.reparseDocument(document.document_id, backend);
      setReparseError(
        backend === "pipeline"
          ? "Re-parse queued under MinerU pipeline + numbering-first resolver. Track progress on the Jobs page."
          : "Re-parse queued under MinerU VLM (vlm-engine). Track progress on the Jobs page.",
      );
    } catch (err) {
      setReparseError(
        err instanceof ApiError ? err.message : "Failed to queue re-parse.",
      );
    } finally {
      setReparsingId(null);
    }
  }

  return (
    <div className="mb-4">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <div>
          <h1 className="fs-4 fw-bold">Document</h1>
          {corpusScope.length > 0 ? (
            <div className="d-flex flex-wrap align-items-center gap-1 mt-1 small text-secondary">
              <span className="fw-semibold text-uppercase small">Scoped corpus</span>
              {corpusScope.map((filter) => (
                <span key={filter.key} className="badge text-bg-secondary">
                  {filter.key}: {filter.values.join(", ")}
                </span>
              ))}
              {total > 0 ? (
                <span className="ms-2">{total} document{total === 1 ? "" : "s"}</span>
              ) : null}
            </div>
          ) : total > 0 ? (
            <span className="small text-secondary d-inline-block mt-1">
              {total} document{total === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        <div className="dropdown">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary dropdown-toggle"
            data-bs-toggle="dropdown"
            aria-expanded="false"
          >
            Sort: {sortBy === "filename" ? "Filename" : sortBy === "creator" ? "Created by" : "Created date"}
          </button>
          <ul className="dropdown-menu dropdown-menu-end">
            <li>
              <button type="button" className="dropdown-item" onClick={() => setSortBy("filename")}>
                Filename
              </button>
            </li>
            <li>
              <button type="button" className="dropdown-item" onClick={() => setSortBy("creator")}>
                Created by (email)
              </button>
            </li>
            <li>
              <button type="button" className="dropdown-item" onClick={() => setSortBy("created")}>
                Created date
              </button>
            </li>
          </ul>
        </div>
      </div>

      {attributes.length > 0 ? (
        <div className="d-flex flex-wrap align-items-center gap-1 border rounded-3 p-2 mb-3 bg-body-tertiary">
          {attributes.map((attribute) => (
            <div key={attribute.key} className="d-flex flex-wrap align-items-center gap-1">
              <span className="small fw-semibold me-1">{attribute.key}</span>
              {(attribute.allowedValues ?? []).map((value) => {
                const active = (selected[attribute.key] ?? []).includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleValue(attribute.key, value)}
                    className={`btn btn-sm ${active ? "btn-primary" : "btn-outline-secondary"}`}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}

      {error ? <div className="alert alert-danger py-2">{error}</div> : null}

      {reparseError ? (
        <div className="alert alert-info py-2">{reparseError}</div>
      ) : null}

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border spinner-border-sm" role="status" />
        </div>
      ) : documents.length === 0 ? (
        <div className="border rounded-3 p-5 text-center text-secondary">
          No documents match the current filters in your visible scope.
        </div>
      ) : (
        <div className="list-group rounded-3">
          {sortedDocuments.map((document) => (
            <DocumentRow
              key={document.document_id}
              document={document}
              highlighted={document.document_id === highlightDocument}
              onOpenTree={(doc) => setTreeDoc(doc)}
              reparsing={reparsingId === document.document_id}
              onReparse={(backend) => handleReparse(document, backend)}
            />
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <nav className="d-flex align-items-center justify-content-between mt-3">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            <ChevronLeft className="me-1" style={{ width: "1em", height: "1em" }} />
            Previous
          </button>
          <span className="small text-secondary">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            Next
            <ChevronRight className="ms-1" style={{ width: "1em", height: "1em" }} />
          </button>
        </nav>
      ) : null}

      {treeDoc ? (
        <ChatChunkPane
          open
          citations={[treeCitation(treeDoc)]}
          selectedIndex={0}
          initialMode="tree"
          onClose={() => setTreeDoc(null)}
        />
      ) : null}
    </div>
  );
}

function DocumentRow({
  document,
  highlighted,
  onOpenTree,
  reparsing,
  onReparse,
}: {
  document: DocumentItem;
  highlighted: boolean;
  onOpenTree: (doc: DocumentItem) => void;
  reparsing: boolean;
  onReparse: (backend: "pipeline" | "vlm-engine") => void;
}) {
  const attributes = document.attributes ?? {};
  const hasOriginal = Boolean(attributes["originalFile"]?.length);
  const manualAttrs = Object.entries(attributes).filter(
    ([key]) => !SYSTEM_ATTR_KEYS.has(key),
  );
  const hoverText = manualAttrs.length
    ? manualAttrs.map(([key, values]) => `${key}: ${values.join(", ")}`).join(" · ")
    : undefined;
  const quality = document.outline_quality ?? null;
  return (
    <div
      className={`list-group-item d-flex flex-column gap-1 ${highlighted ? "bg-primary-subtle" : ""}`}
      title={hoverText}
    >
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
        <div className="d-flex align-items-start gap-2">
          <FileText className="mt-1 text-secondary" style={{ width: "1em", height: "1em" }} />
          <div className="min-w-0">
            <p className="mb-0 fw-semibold text-truncate">
              {document.source_file_name ?? document.document_id}
            </p>
            <p className="mb-0 small text-secondary text-truncate">
              {document.creator_email ?? "—"} · created{" "}
              {formatDateTime(document.created_at)}
            </p>
          </div>
        </div>
        <div className="d-flex align-items-center gap-2">
          {quality ? (
            <span
              className={`badge ${quality.verdict === "ok" ? "text-bg-success" : "text-bg-warning"}`}
              title={`Outline Quality ${(quality.score * 100).toFixed(0)}% · ${quality.n_anomalies} anomalies`}
            >
              outline {Math.round(quality.score * 100)}%
            </span>
          ) : null}
          {quality?.verdict === "needs_vlm" ? (
            <span
              className="badge text-bg-danger"
              title="Deterministic outline repair can't restore a clean tree. This one genuinely warrants a VLM re-parse."
            >
              needs VLM
            </span>
          ) : quality?.verdict === "resolver_recoverable" ? (
            <span
              className="badge text-bg-info"
              title="Levels were misassigned but the numbering-first resolver restores a healthy tree — no VLM re-parse needed."
            >
              resolver fixes
            </span>
          ) : null}
          <span className={`badge ${statusBadge(document.status)}`}>{document.status}</span>
          <button
            type="button"
            className="btn btn-sm btn-link p-0 fw-medium link-primary"
            onClick={() => onOpenTree(document)}
          >
            Tree
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary py-0 px-2"
            disabled={reparsing}
            title="Re-parse using the deterministic pipeline + numbering-first resolver (no VLM). Use for documents where the 'resolver fixes' or 'outline' badge shows mis-assigned heading levels."
            onClick={() => onReparse("pipeline")}
          >
            {reparsing ? "Queuing…" : "Re-parse (resolver)"}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary py-0 px-2"
            disabled={reparsing}
            title="Re-parse with MinerU VLM (vlm-engine) for full re-detection. Only for documents whose heading set is suspect (the 'needs VLM' badge)."
            onClick={() => onReparse("vlm-engine")}
          >
            {reparsing ? "Queuing…" : "Re-parse (VLM)"}
          </button>
          {hasOriginal ? (
            <a
              href={originalFileUrl(document.document_id)}
              className="small fw-medium link-primary"
            >
              File
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
