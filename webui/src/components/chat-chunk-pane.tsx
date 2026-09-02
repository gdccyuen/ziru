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
  children: SectionTreeNode[];
};

function sectionBreadcrumb(sectionPath: string | null | undefined): string[] {
  if (!sectionPath) return [];
  return sectionPath
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

function citationSectionTree(citation: RetrievalResult): SectionTreeNode {
  const root: SectionTreeNode = {
    id: "root",
    label:
      citation.source?.source_file_name ??
      citation.source?.document_id ??
      "Source",
    depth: 0,
    current: false,
    children: [],
  };
  const segments = sectionBreadcrumb(citation.source?.section_path);
  let parent = root;

  segments.forEach((segment, index) => {
    const node: SectionTreeNode = {
      id: parent.id + "/" + index + ":" + segment,
      label: segment,
      depth: parent.depth + 1,
      current: index === segments.length - 1,
      children: [],
    };
    parent.children.push(node);
    parent = node;
  });

  parent.children.push({
    id: parent.id + "/chunk",
    label: citation.chunk_type ? citation.chunk_type + " chunk" : "Chunk",
    depth: parent.depth + 1,
    current: segments.length === 0,
    children: [],
  });

  return root;
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
  root,
  collapsed,
  onToggle,
}: {
  root: SectionTreeNode;
  collapsed: ReadonlySet<string>;
  onToggle: (nodeId: string) => void;
}) {
  function renderNode(node: SectionTreeNode) {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.id);
    const isExpanded = hasChildren && !isCollapsed;

    return (
      <div key={node.id}>
        <button
          type="button"
          role="treeitem"
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-selected={node.current ? "true" : "false"}
          aria-current={node.current ? "true" : undefined}
          onClick={hasChildren ? () => onToggle(node.id) : undefined}
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
      {renderNode(root)}
    </div>
  );
}

export function ChatChunkPane({
  open,
  citation,
  onClose,
}: {
  open: boolean;
  citation: RetrievalResult | null;
  onClose: () => void;
}) {
  if (!open) return null;

  const citationKey = citation
    ? [
        citation.chunk_id ?? "",
        citation.source?.document_id ?? "",
        citation.source?.section_path ?? "",
        citation.source?.source_file_name ?? "",
      ].join("|")
    : "none";

  return (
    <ChatChunkPaneContent
      key={citationKey}
      citation={citation}
      onClose={onClose}
    />
  );
}

function ChatChunkPaneContent({
  citation,
  onClose,
}: {
  citation: RetrievalResult | null;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<ChunkPaneMode>("text");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const title = citation ? citationLabel(citation, 0) : "Source";
  const documentId = citation?.source?.document_id ?? null;

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
                root={citationSectionTree(citation)}
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
