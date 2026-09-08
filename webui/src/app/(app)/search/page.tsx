"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import {
  ApiError,
  api,
  originalFileUrl,
  type AttributeEntry,
  type RetrievalResult,
  type SearchResponse,
} from "@/lib/api";
import {
  RETRIEVAL_DEFAULTS,
  RetrievalSettingsRow,
  type RetrievalSettings,
} from "@/components/retrieval-settings";
import { useAuth } from "@/lib/auth-context";
import { profileSummary } from "@/lib/format";

type SelectedFilters = Record<string, string[]>;

export default function SearchPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [retrievalSettings, setRetrievalSettings] = useState<RetrievalSettings>(
    RETRIEVAL_DEFAULTS,
  );
  const queryRef = useRef<HTMLInputElement>(null);
  const [attributes, setAttributes] = useState<AttributeEntry[]>([]);
  const [selected, setSelected] = useState<SelectedFilters>({});
  const [freeText, setFreeText] = useState<Record<string, string>>({});
  const [loadingAttributes, setLoadingAttributes] = useState(true);
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [documentAttributes, setDocumentAttributes] = useState<
    Record<string, Record<string, string[]>>
  >({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const entries = await api.attributes();
        setAttributes(entries);
        const initial: SelectedFilters = {};
        for (const entry of entries) initial[entry.key] = [];
        setSelected(initial);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load attributes.");
      } finally {
        setLoadingAttributes(false);
      }
    })();
  }, []);

  const profileFilters = useMemo(() => {
    const filters: SelectedFilters = {};
    for (const entry of user?.profile ?? []) {
      filters[entry.key] = [...entry.values];
    }
    return filters;
  }, [user?.profile]);

  function toggleValue(key: string, value: string) {
    setSelected((current) => {
      const values = current[key] ?? [];
      const next = values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value];
      return { ...current, [key]: next };
    });
  }

  function handleSelectPrompt(prompt: string) {
    setQuery(prompt);
    requestAnimationFrame(() => {
      const input = queryRef.current;
      if (!input) return;
      input.focus({ preventScroll: true });
      const match = prompt.match(/\[[^\]\r\n]{1,80}\]/);
      if (!match || match.index === undefined) {
        input.setSelectionRange(prompt.length, prompt.length);
        return;
      }
      input.setSelectionRange(match.index, match.index + match[0].length);
    });
  }

  function buildFilters(): { filters: SelectedFilters; usedProfile: boolean } {
    const filters: SelectedFilters = {};
    for (const [key, values] of Object.entries(selected)) {
      if (values.length > 0) filters[key] = values;
    }
    const extraValues = Object.entries(freeText)
      .map(([key, raw]) => {
        const values = raw
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        return [key, values] as const;
      })
      .filter(([, values]) => values.length > 0);
    for (const [key, values] of extraValues) {
      filters[key] = [...(filters[key] ?? []), ...values];
    }
    if (Object.keys(filters).length === 0) {
      return { filters: profileFilters, usedProfile: true };
    }
    return { filters, usedProfile: false };
  }

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setError("Enter a search query.");
      return;
    }
    const { filters, usedProfile } = buildFilters();
    const filterList = Object.entries(filters).map(([key, values]) => ({
      key,
      values,
    }));
    if (filterList.length === 0) {
      setError("Select at least one attribute filter (or your profile scope) to search.");
      return;
    }
    setError(null);
    setSearching(true);
    try {
      const response = await api.search({
        query: trimmed,
        filters: filterList,
        top_k: retrievalSettings.top_k,
        internal_recall_k: retrievalSettings.internal_recall_k,
        rerank: retrievalSettings.rerank,
        use_agentic: retrievalSettings.use_agentic,
      });
      setResult(response);
      if (!usedProfile) {
        void loadDocumentAttributes();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  async function loadDocumentAttributes() {
    try {
      const response = await api.documents({ page_size: 200 });
      const map: Record<string, Record<string, string[]>> = {};
      for (const document of response.documents) {
        map[document.document_id] = document.attributes ?? {};
      }
      setDocumentAttributes(map);
    } catch {
      // Optional enrichment; results still render without it.
    }
  }

  return (
    <div className="mx-auto mb-4" style={{ maxWidth: "56rem" }}>
      {user && user.profile.length > 0 ? (
        <div className="d-flex align-items-center gap-2 border rounded-3 bg-body-tertiary px-3 py-2 small text-secondary mb-3">
          <span className="badge text-bg-secondary">Profile scope</span>
          <span className="text-truncate">{profileSummary(user.profile)}</span>
        </div>
      ) : null}

      <form onSubmit={handleSearch} className="d-flex flex-column gap-3">
        <div className="d-flex gap-2">
          <input
            ref={queryRef}
            aria-label="Search query"
            className="form-control form-control-lg"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your knowledge corpus…"
          />
          <button type="submit" className="btn btn-primary btn-lg" disabled={searching}>
            {searching ? (
              <span className="spinner-border spinner-border-sm me-1" role="status" />
            ) : (
              <SearchIcon className="me-1" style={{ width: "1em", height: "1em" }} />
            )}
            Search
          </button>
        </div>

        <div className="border rounded-3 p-2 bg-body-tertiary">
          <RetrievalSettingsRow
            value={retrievalSettings}
            onChange={setRetrievalSettings}
            onSelectPrompt={handleSelectPrompt}
            disabled={searching}
          />
        </div>

        {loadingAttributes ? (
          <p className="small text-secondary">Loading attribute filters…</p>
        ) : attributes.length === 0 ? (
          <p className="small text-secondary">No attribute filters configured yet.</p>
        ) : (
          <div className="border rounded-3 p-3 d-flex flex-column gap-3">
            {attributes.map((attribute) => (
              <AttributeFilterRow
                key={attribute.key}
                attribute={attribute}
                selected={selected[attribute.key] ?? []}
                freeText={freeText[attribute.key] ?? ""}
                onToggle={(value) => toggleValue(attribute.key, value)}
                onFreeText={(value) =>
                  setFreeText((current) => ({ ...current, [attribute.key]: value }))
                }
              />
            ))}
          </div>
        )}

        {error ? <div className="alert alert-danger py-2">{error}</div> : null}
      </form>

      {result ? (
        <SearchResults result={result} documentAttributes={documentAttributes} />
      ) : null}
    </div>
  );
}

function AttributeFilterRow({
  attribute,
  selected,
  freeText,
  onToggle,
  onFreeText,
}: {
  attribute: AttributeEntry;
  selected: readonly string[];
  freeText: string;
  onToggle: (value: string) => void;
  onFreeText: (value: string) => void;
}) {
  return (
    <div className="d-flex flex-wrap align-items-center gap-2">
      <span className="small fw-semibold" style={{ minWidth: "8rem" }}>
        {attribute.key}
      </span>
      {attribute.allowedValues ? (
        attribute.allowedValues.map((value) => {
          const active = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              onClick={() => onToggle(value)}
              className={`btn btn-sm ${active ? "btn-primary" : "btn-outline-secondary"}`}
            >
              {value}
            </button>
          );
        })
      ) : (
        <input
          className="form-control form-control-sm"
          style={{ maxWidth: "15rem" }}
          value={freeText}
          onChange={(event) => onFreeText(event.target.value)}
          placeholder="Values (comma-separated)"
        />
      )}
    </div>
  );
}

function SearchResults({
  result,
  documentAttributes,
}: {
  result: SearchResponse;
  documentAttributes: Record<string, Record<string, string[]>>;
}) {
  return (
    <div className="d-flex flex-column gap-3 mt-4">
      {result.evidence_text ? (
        <div className="border rounded-3 p-3">
          <p className="mb-1 small text-uppercase fw-semibold text-secondary">Evidence</p>
          <p className="mb-0 whitespace-pre-wrap small lh-base">{result.evidence_text}</p>
        </div>
      ) : null}
      <div className="d-flex flex-column gap-2">
        <p className="small text-secondary mb-0">
          {result.results.length} result{result.results.length === 1 ? "" : "s"} · router:{" "}
          {result.router_used}
        </p>
        {result.results.length === 0 ? (
          <p className="border rounded-3 p-3 small text-secondary">
            No matching knowledge found in your visible corpus.
          </p>
        ) : (
          result.results.map((item, index) => (
            <ResultCard
              key={item.chunk_id ?? index}
              item={item}
              attributes={
                item.source?.document_id
                  ? documentAttributes[item.source.document_id]
                  : undefined
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

function ResultCard({
  item,
  attributes,
}: {
  item: RetrievalResult;
  attributes?: Record<string, string[]>;
}) {
  const source = item.source;
  const documentId = source?.document_id ?? null;
  const hasOriginal = Boolean(attributes?.["originalFile"]?.length);
  return (
    <div className="border rounded-3 p-3">
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
        <div className="min-w-0">
          <p className="mb-0 fw-semibold text-truncate">
            {source?.source_file_name ?? documentId ?? "Unknown source"}
          </p>
          {source?.section_path ? (
            <p className="mb-0 small text-secondary text-truncate">{source.section_path}</p>
          ) : null}
        </div>
        {item.score !== null && item.score !== undefined ? (
          <span className="badge text-bg-secondary">{item.score.toFixed(3)}</span>
        ) : null}
      </div>
      {item.content ? (
        <p className="mt-2 mb-0 small text-secondary line-clamp-4">{item.content}</p>
      ) : null}
      <div className="mt-2 d-flex flex-wrap align-items-center gap-2 small">
        {documentId ? (
          <a
            href={"/documents?document=" + encodeURIComponent(documentId)}
            className="link-primary fw-medium"
          >
            View document
          </a>
        ) : null}
        {hasOriginal && documentId ? (
          <a href={originalFileUrl(documentId)} className="link-primary fw-medium">
            View original
          </a>
        ) : null}
      </div>
    </div>
  );
}
