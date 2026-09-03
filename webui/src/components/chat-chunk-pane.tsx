"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, X } from "lucide-react";
import type { RetrievalResult } from "@/lib/api";
import { citationLabel } from "@/lib/chat-citations";
import { cn } from "@/lib/utils";

type ChunkPaneMode = "text" | "tree";

type SectionTreeNode = {
  id: string;
  label: string;
  depth: number;
  current: boolean;
  citation?: RetrievalResult;
  citationIndex?: number;
  children: SectionTreeNode[];
};

function sectionBreadcrumb(sectionPath: string | null | undefined): string[] {
  if (!sectionPath) return [];
  return sectionPath
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

function documentKey(citation: RetrievalResult): string {
  return (
    citation.source?.document_id ??
    citation.source?.source_file_name ??
    "source"
  );
}

function documentLabel(citation: RetrievalResult): string {
  return (
    citation.source?.source_file_name ??
    citation.source?.document_id ??
    "Source"
  );
}

function chunkLeafLabel(citation: RetrievalResult): string {
  const kind = citation.chunk_type
    ? citation.chunk_type + " chunk"
    : "chunk";
  const content = citation.content?.trim();
  if (!content) return kind;
  const snippet =
    content.length > 60 ? content.slice(0, 60).trimEnd() + "…" : content;
  return kind + " — " + snippet;
}

function buildCitationTree(
  citations: readonly RetrievalResult[],
  selected: RetrievalResult | null,
): SectionTreeNode[] {
  const groups = new Map<
    string,
    { label: string; entries: { citation: RetrievalResult; index: number }[] }
  >();

  citations.forEach((citation, index) => {
    const key = documentKey(citation);
    let group = groups.get(key);
    if (!group) {
      group = { label: documentLabel(citation), entries: [] };
      groups.set(key, group);
    }
    group.entries.push({ citation, index });
  });

  const roots: SectionTreeNode[] = [];
  for (const [key, group] of groups) {
    const root: SectionTreeNode = {
      id: "doc:" + key,
      label: group.label,
      depth: 0,
      current: false,
      children: [],
    };

    for (const { citation, index } of group.entries) {
      const segments = sectionBreadcrumb(citation.source?.section_path);
      let parent = root;

      segments.forEach((segment, depth) => {
        let child = parent.children.find(
          (candidate) =>
            candidate.citation === undefined &&
            candidate.label === segment &&
            candidate.depth === depth + 1,
        );
        if (!child) {
          child = {
            id: parent.id + "/section:" + depth + ":" + segment,
            label: segment,
            depth: depth + 1,
            current: false,
            children: [],
          };
          parent.children.push(child);
        }
        parent = child;
      });

      parent.children.push({
        id: parent.id + "/leaf:" + (citation.chunk_id ?? parent.children.length),
        label: chunkLeafLabel(citation),
        depth: parent.depth + 1,
        current: false,
        citation,
        citationIndex: index,
        children: [],
      });
    }

    roots.push(root);
  }

  if (!selected) return roots;

  const selectedRoot = roots.find(
    (root) => root.id === "doc:" + documentKey(selected),
  );
  if (!selectedRoot) return roots;

  selectedRoot.current = true;
  const segments = sectionBreadcrumb(selected.source?.section_path);
  let parent = selectedRoot;

  for (let depth = 0; depth < segments.length; depth += 1) {
    const segment = segments[depth];
    const child = parent.children.find(
      (candidate) =>
        candidate.citation === undefined &&
        candidate.label === segment &&
        candidate.depth === depth + 1,
    );
    if (!child) return roots;
    child.current = true;
    parent = child;
  }

  const selectedLeaf = parent.children.find(
    (candidate) => candidate.citation === selected,
  );
  if (selectedLeaf) selectedLeaf.current = true;

  return roots;
}

function viewToggleClassName(active: boolean): string {
  return cn(
    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
    active
      ? "bg-background text-foreground shadow-sm"
      : "text-muted-foreground hover:text-foreground",
  );
}

function SectionTree({
  roots,
  collapsed,
  onToggle,
  onSelect,
}: {
  roots: SectionTreeNode[];
  collapsed: ReadonlySet<string>;
  onToggle: (nodeId: string) => void;
  onSelect: (citationIndex: number) => void;
}) {
  function renderNode(node: SectionTreeNode) {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.id);
    const isExpanded = hasChildren && !isCollapsed;
    const isLeaf = !hasChildren && node.citation !== undefined;

    function handleClick() {
      if (hasChildren) {
        onToggle(node.id);
        return;
      }
      if (typeof node.citationIndex === "number") {
        onSelect(node.citationIndex);
      }
    }

    return (
      <div key={node.id}>
        <button
          type="button"
          role="treeitem"
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-selected={node.current ? "true" : "false"}
          aria-current={node.current ? "true" : undefined}
          onClick={handleClick}
          style={{ paddingLeft: 8 + node.depth * 14 }}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs",
            node.current
              ? "bg-primary/10 font-medium text-primary"
              : "text-foreground hover:bg-muted",
          )}
        >
          {hasChildren ? (
            isCollapsed ? (
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            )
          ) : isLeaf ? (
            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <span className="size-3.5 shrink-0" />
          )}
          <span className="min-w-0 flex-1 truncate">{node.label}</span>
          {node.current ? (
            <span className="shrink-0 text-[9px] font-medium uppercase tracking-wide text-primary/70">
              current
            </span>
          ) : null}
        </button>
        {isExpanded && node.children.length > 0 ? (
          <div className="ml-3 border-l border-border/60 pl-1">
            {node.children.map(renderNode)}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div role="tree" aria-label="Source section tree" className="space-y-0.5">
      {roots.map(renderNode)}
    </div>
  );
}

export function ChatChunkPane({
  open,
  citations,
  selectedIndex,
  onClose,
  onSelectCitation,
}: {
  open: boolean;
  citations: readonly RetrievalResult[];
  selectedIndex: number | null;
  onClose: () => void;
  onSelectCitation?: (index: number) => void;
}) {
  if (!open) return null;

  return (
    <ChatChunkPaneContent
      key={(selectedIndex ?? "none") + ":" + citations.length}
      citations={citations}
      initialIndex={selectedIndex}
      onClose={onClose}
      onSelectCitation={onSelectCitation}
    />
  );
}

function ChatChunkPaneContent({
  citations,
  initialIndex,
  onClose,
  onSelectCitation,
}: {
  citations: readonly RetrievalResult[];
  initialIndex: number | null;
  onClose: () => void;
  onSelectCitation?: (index: number) => void;
}) {
  const [mode, setMode] = useState<ChunkPaneMode>("text");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(initialIndex);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const citation =
    selectedIndex === null ? null : (citations[selectedIndex] ?? null);
  const title = citation
    ? citationLabel(citation, selectedIndex ?? 0)
    : "Source";
  const documentId = citation?.source?.document_id ?? null;

  function selectCitation(index: number) {
    setSelectedIndex(index);
    setMode("text");
    onSelectCitation?.(index);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Source chunk"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-3 backdrop-blur-sm sm:p-6"
    >
      <div className="flex h-full max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-foreground">{title}</h3>
            {documentId ? (
              <a
                href={"/documents?document=" + encodeURIComponent(documentId)}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                {documentId}
              </a>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div
              role="group"
              aria-label="Chunk view"
              className="flex rounded-lg border border-border bg-muted/40 p-0.5"
            >
              <button
                type="button"
                aria-pressed={mode === "text"}
                onClick={() => setMode("text")}
                className={viewToggleClassName(mode === "text")}
              >
                Text
              </button>
              <button
                type="button"
                aria-pressed={mode === "tree"}
                onClick={() => setMode("tree")}
                className={viewToggleClassName(mode === "tree")}
              >
                Tree
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close source chunk"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        {citation ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {mode === "tree" ? (
              <SectionTree
                roots={buildCitationTree(citations, citation)}
                collapsed={collapsed}
                onToggle={(nodeId) => {
                  setCollapsed((current) => {
                    const next = new Set(current);
                    if (next.has(nodeId)) {
                      next.delete(nodeId);
                    } else {
                      next.add(nodeId);
                    }
                    return next;
                  });
                }}
                onSelect={selectCitation}
              />
            ) : (
              <>
                {sectionBreadcrumb(citation.source?.section_path).length > 0 ? (
                  <div className="mb-3 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                    {sectionBreadcrumb(citation.source?.section_path).map(
                      (part, index) => (
                        <span key={index} className="flex items-center gap-1">
                          {index > 0 ? <span>/</span> : null}
                          <span>{part}</span>
                        </span>
                      ),
                    )}
                  </div>
                ) : null}

                <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                  {citation.chunk_type ? (
                    <span className="rounded-full bg-muted px-2 py-0.5">
                      {citation.chunk_type}
                    </span>
                  ) : null}
                  {typeof citation.score === "number" ? (
                    <span className="font-mono">
                      score {citation.score.toFixed(4)}
                    </span>
                  ) : null}
                </div>

                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                    {citation.content || "No chunk content was persisted."}
                  </p>
                </div>

                <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <FileText className="size-3" />
                  <span>
                    {citation.source?.source_file_name ?? "Unknown source"}
                  </span>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            No source selected.
          </div>
        )}
      </div>
    </div>
  );
}
