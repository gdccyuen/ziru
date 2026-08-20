"use client";

import { useEffect, useMemo, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { ApiError, api, originalFileUrl, type AttributeEntry, type RetrievalResult, type SearchResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth-context";
import { profileSummary } from "@/lib/format";

type SelectedFilters = Record<string, string[]>;

export default function SearchPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
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
    <div className="mx-auto max-w-4xl space-y-5">
      {user && user.profile.length > 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Badge variant="secondary">Profile scope</Badge>
          <span className="truncate">{profileSummary(user.profile)}</span>
        </div>
      ) : null}
      <form onSubmit={handleSearch} className="space-y-4">
        <div className="flex gap-2">
          <Input
            aria-label="Search query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your knowledge corpus…"
            className="h-11 flex-1"
          />
          <Button type="submit" className="h-11 gap-1.5" disabled={searching}>
            {searching ? <Spinner className="size-4" /> : <SearchIcon className="size-4" />}
            Search
          </Button>
        </div>
        {loadingAttributes ? (
          <p className="text-xs text-muted-foreground">Loading attribute filters…</p>
        ) : attributes.length === 0 ? (
          <p className="text-xs text-muted-foreground">No attribute filters configured yet.</p>
        ) : (
          <div className="grid gap-3 rounded-lg border border-border/70 bg-background p-3">
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
        {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
      </form>
      {result ? (
        <SearchResults
          result={result}
          documentAttributes={documentAttributes}
        />
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
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-28 shrink-0 text-xs font-semibold text-foreground">{attribute.key}</span>
      {attribute.allowedValues ? (
        attribute.allowedValues.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onToggle(value)}
            className={"rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors" + (selected.includes(value) ? " border-primary bg-primary/10 text-primary" : " border-border text-muted-foreground hover:bg-muted")}
          >
            {value}
          </button>
        ))
      ) : (
        <Input
          value={freeText}
          onChange={(event) => onFreeText(event.target.value)}
          placeholder="Values (comma-separated)"
          className="h-7 w-56 text-xs"
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
    <div className="space-y-4">
      {result.evidence_text ? (
        <div className="rounded-lg border border-border/70 bg-background p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Evidence
          </p>
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
            {result.evidence_text}
          </p>
        </div>
      ) : null}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {result.results.length} result{result.results.length === 1 ? "" : "s"} · router: {result.router_used}
        </p>
        {result.results.length === 0 ? (
          <p className="rounded-lg border border-border/70 bg-background p-4 text-sm text-muted-foreground">
            No matching knowledge found in your visible corpus.
          </p>
        ) : (
          result.results.map((item, index) => (
            <ResultCard
              key={item.chunk_id ?? index}
              item={item}
              attributes={item.source?.document_id ? documentAttributes[item.source.document_id] : undefined}
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
    <div className="rounded-lg border border-border/70 bg-background p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {source?.source_file_name ?? documentId ?? "Unknown source"}
          </p>
          {source?.section_path ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{source.section_path}</p>
          ) : null}
        </div>
        {item.score !== null && item.score !== undefined ? (
          <Badge variant="secondary" className="shrink-0 text-[10px]">{item.score.toFixed(3)}</Badge>
        ) : null}
      </div>
      {item.content ? (
        <p className="mt-2 line-clamp-4 text-sm leading-6 text-muted-foreground">{item.content}</p>
      ) : null}
      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
        {documentId ? (
          <a
            href={"/documents?document=" + encodeURIComponent(documentId)}
            className="font-medium text-primary hover:underline"
          >
            View document
          </a>
        ) : null}
        {hasOriginal && documentId ? (
          <a
            href={originalFileUrl(documentId)}
            className="font-medium text-primary hover:underline"
          >
            View original
          </a>
        ) : null}
      </div>
    </div>
  );
}
