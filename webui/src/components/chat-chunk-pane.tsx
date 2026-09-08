"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, FileText, X } from "lucide-react";
import {
  api,
  type DocumentSectionNode,
  type DocumentSectionsResponse,
  type RetrievalResult,
} from "@/lib/api";
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
  kind?: "document" | "section" | "chunk";
  sectionPath?: string | null;
  content?: string;
  contentSnippet?: string;
  chunkCount?: number;
  chunkId?: string;
  documentId?: string;
  sourceFile?: string | null;
};

type ActiveChunk = {
  title: string;
  sectionPath: string | null;
  content: string;
  chunkType: string | null;
  sourceFile: string | null;
  documentId: string | null;
  chunkId: string | null;
  status: "loading" | "ready" | "error";
};

type DocumentTreeState =
  | { status: "idle" }
  | { status: "ready"; response: DocumentSectionsResponse | null }
  | { status: "error"; message: string };

function sectionBreadcrumb(sectionPath: string | null | undefined): string[] {
  if (!sectionPath) return [];
  return sectionPath
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeSectionPath(sectionPath: string | null | undefined): string {
  return sectionBreadcrumb(sectionPath).join("/");
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

function sectionTitle(section: DocumentSectionNode): string {
  const title = section.title?.trim();
  if (title) return title;
  const parts = sectionBreadcrumb(section.section_path);
  return parts[parts.length - 1] ?? section.section_path;
}

function chunkContentLabel(
  kind: string | undefined,
  content: string | null | undefined,
): string {
  const chunkKind = kind ? kind + " chunk" : "chunk";
  const snippet = content?.trim();
  if (!snippet) return "No content snippet";
  const label =
    snippet.length > 60 ? snippet.slice(0, 60).trimEnd() + "…" : snippet;
  return chunkKind + " — " + label;
}

function buildCitationTree(
  citations: readonly RetrievalResult[],
  selected: RetrievalResult | null,
): SectionTreeNode[] {
  const groups = new Map<
    string,
    {
      label: string;
      documentId: string | null;
      sourceFile: string | null;
      entries: { citation: RetrievalResult; index: number }[];
    }
  >();

  citations.forEach((citation, index) => {
    const key = documentKey(citation);
    let group = groups.get(key);
    if (!group) {
      group = {
        label: documentLabel(citation),
        documentId: citation.source?.document_id ?? null,
        sourceFile: citation.source?.source_file_name ?? null,
        entries: [],
      };
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
      kind: "document",
      documentId: group.documentId ?? undefined,
      sourceFile: group.sourceFile,
      children: [],
    };

    for (const { citation, index } of group.entries) {
      const segments = sectionBreadcrumb(citation.source?.section_path);
      let parent = root;

      segments.forEach((segment, depth) => {
        let child = parent.children.find(
          (candidate) =>
            candidate.citation === undefined &&
            candidate.kind !== "chunk" &&
            candidate.label === segment &&
            candidate.depth === depth + 1,
        );
        if (!child) {
          child = {
            id: parent.id + "/section:" + depth + ":" + segment,
            label: segment,
            depth: depth + 1,
            current: false,
            kind: "section",
            children: [],
          };
          parent.children.push(child);
        }
        parent = child;
      });

      parent.children.push({
        id: parent.id + "/leaf:" + (citation.chunk_id ?? parent.children.length),
        label: chunkContentLabel(citation.chunk_type, citation.content),
        depth: parent.depth + 1,
        current: false,
        citation,
        citationIndex: index,
        kind: "chunk",
        sectionPath: citation.source?.section_path ?? null,
        contentSnippet: citation.content,
        chunkId: citation.chunk_id,
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
        candidate.kind !== "chunk" &&
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

function buildDocumentTree(
  documentSections: DocumentSectionsResponse,
  citations: readonly RetrievalResult[],
  selected: RetrievalResult | null,
): SectionTreeNode[] {
  const sections = documentSections.sections;
  const byId = new Map(sections.map((section) => [section.id, section]));
  const childrenByParent = new Map<string, DocumentSectionNode[]>();
  const roots: DocumentSectionNode[] = [];

  for (const section of sections) {
    const parentId = section.parent?.trim() || null;
    if (parentId && byId.has(parentId)) {
      const siblings = childrenByParent.get(parentId) ?? [];
      siblings.push(section);
      childrenByParent.set(parentId, siblings);
    } else {
      roots.push(section);
    }
  }

  const selectedPath = normalizeSectionPath(selected?.source?.section_path);

  function buildSection(
    section: DocumentSectionNode,
    depth: number,
  ): SectionTreeNode {
    const normalizedPath = normalizeSectionPath(section.section_path);
    const children: SectionTreeNode[] = [];

    for (const child of childrenByParent.get(section.id) ?? []) {
      children.push(buildSection(child, depth + 1));
    }

    for (const chunk of section.chunks ?? []) {
      const citationIndex = citations.findIndex(
        (citation) => citation.chunk_id === chunk.chunk_id,
      );
      const matchedCitation =
        citationIndex >= 0 ? citations[citationIndex] : undefined;
      children.push({
        id: "sec:" + section.id + ":chunk:" + chunk.chunk_id,
        label: chunkContentLabel("text", chunk.snippet),
        depth: depth + 1,
        current: matchedCitation === selected,
        citation: matchedCitation,
        citationIndex: citationIndex >= 0 ? citationIndex : undefined,
        sectionPath: chunk.section_path ?? section.section_path,
        contentSnippet: chunk.snippet ?? undefined,
        chunkId: chunk.chunk_id,
        kind: "chunk",
        children: [],
      });
    }

    return {
      id: "sec:" + section.id,
      label: sectionTitle(section),
      depth,
      current: normalizedPath === selectedPath,
      kind: "section",
      sectionPath: section.section_path,
      chunkCount: section.chunk_count,
      children,
    };
  }

  return [
    {
      id: "doc:" + documentSections.document_id,
      label:
        documentSections.source_file_name ??
        documentSections.document_id ??
        "Document",
      depth: 0,
      current: true,
      kind: "document",
      documentId: documentSections.document_id,
      sourceFile: documentSections.source_file_name,
      children: roots.map((section) => buildSection(section, 1)),
    },
  ];
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
  onSelect: (node: SectionTreeNode) => void;
}) {
  function renderNode(node: SectionTreeNode) {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.id);
    const isExpanded = hasChildren && !isCollapsed;
    const isLeaf =
      !hasChildren && (node.kind === "chunk" || node.citation !== undefined);
    const isChunkLeaf = isLeaf && node.kind === "chunk";

    function handleClick() {
      if (hasChildren) {
        onToggle(node.id);
        return;
      }
      onSelect(node);
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
            "flex w-full gap-1.5 rounded-md px-2 text-left text-xs",
            isChunkLeaf
              ? "items-start border border-violet-200/80 bg-violet-50/70 py-1.5 text-violet-950 hover:bg-violet-100/80 dark:border-violet-800/70 dark:bg-violet-950/40 dark:text-violet-100 dark:hover:bg-violet-950/60"
              : "items-center py-1",
            !isChunkLeaf &&
              (node.current
                ? "bg-primary/10 font-medium text-primary"
                : "text-foreground hover:bg-muted"),
            isChunkLeaf && node.current && "border-primary/60 bg-primary/5",
          )}
        >
          {hasChildren ? (
            isCollapsed ? (
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            )
          ) : isLeaf ? (
            <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <span className="size-3.5 shrink-0" />
          )}
          {isChunkLeaf ? (
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 block whitespace-pre-wrap break-words leading-snug">
                {node.contentSnippet ?? node.label}
              </span>
              {node.sectionPath ? (
                <span className="mt-0.5 block text-[9px] font-normal text-muted-foreground">
                  {node.sectionPath}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate">{node.label}</span>
          )}
          {!isChunkLeaf &&
          typeof node.chunkCount === "number" &&
          node.chunkCount > 0 ? (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
              {node.chunkCount}
            </span>
          ) : null}
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
  initialMode = "text",
  onClose,
  onSelectCitation,
}: {
  open: boolean;
  citations: readonly RetrievalResult[];
  selectedIndex: number | null;
  initialMode?: ChunkPaneMode;
  onClose: () => void;
  onSelectCitation?: (index: number) => void;
}) {
  if (!open) return null;

  return (
    <ChatChunkPaneContent
      key={citations.length}
      citations={citations}
      initialIndex={selectedIndex}
      initialMode={initialMode}
      onClose={onClose}
      onSelectCitation={onSelectCitation}
    />
  );
}

function ChatChunkPaneContent({
  citations,
  initialIndex,
  initialMode,
  onClose,
  onSelectCitation,
}: {
  citations: readonly RetrievalResult[];
  initialIndex: number | null;
  initialMode: ChunkPaneMode;
  onClose: () => void;
  onSelectCitation?: (index: number) => void;
}) {
  const [mode, setMode] = useState<ChunkPaneMode>(initialMode);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(initialIndex);
  const [activeChunk, setActiveChunk] = useState<ActiveChunk | null>(null);
  const activeChunkRequest = useRef(0);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [documentTree, setDocumentTree] = useState<DocumentTreeState>({
    status: "idle",
  });

  const citation =
    selectedIndex === null ? null : (citations[selectedIndex] ?? null);
  const documentId = citation?.source?.document_id ?? null;
  const title = activeChunk
    ? activeChunk.title
    : citation
      ? citationLabel(citation, selectedIndex ?? 0)
      : "Source";

  useEffect(() => {
    if (mode !== "tree" || !documentId) return;
    let cancelled = false;
    api
      .documentSections(documentId)
      .then((response) => {
        if (cancelled) return;
        setDocumentTree({ status: "ready", response });
        setCollapsed(
          new Set(response.sections.map((section) => "sec:" + section.id)),
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setDocumentTree({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unable to load the document tree",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [mode, documentId]);

  function selectCitation(index: number) {
    activeChunkRequest.current += 1;
    setActiveChunk(null);
    setSelectedIndex(index);
    setMode("text");
    onSelectCitation?.(index);
  }

  function selectChunkLeaf(node: SectionTreeNode) {
    const matchedCitation =
      node.citation ??
      (node.chunkId
        ? citations.find((citation) => citation.chunk_id === node.chunkId)
        : undefined);
    const chunkDocumentId = node.documentId ?? documentId;
    const sectionPath =
      node.sectionPath ?? matchedCitation?.source?.section_path ?? null;
    const sourceFile =
      node.sourceFile ??
      matchedCitation?.source?.source_file_name ??
      citation?.source?.source_file_name ??
      null;
    const chunkType = matchedCitation?.chunk_type ?? "text";
    const matchedContent = matchedCitation?.content?.trim();
    const requestId = ++activeChunkRequest.current;

    setMode("text");

    if (matchedContent) {
      setActiveChunk({
        title: node.label,
        sectionPath,
        content: matchedContent,
        chunkType,
        sourceFile,
        documentId: chunkDocumentId,
        chunkId: node.chunkId ?? null,
        status: "ready",
      });
      return;
    }

    if (!chunkDocumentId || !node.chunkId) {
      setActiveChunk({
        title: node.label,
        sectionPath,
        content: "No chunk content available.",
        chunkType,
        sourceFile,
        documentId: chunkDocumentId,
        chunkId: node.chunkId ?? null,
        status: "error",
      });
      return;
    }

    setActiveChunk({
      title: node.label,
      sectionPath,
      content: "Loading chunk content…",
      chunkType,
      sourceFile,
      documentId: chunkDocumentId,
      chunkId: node.chunkId,
      status: "loading",
    });

    api
      .documentChunk(chunkDocumentId, node.chunkId)
      .then((detail) => {
        if (requestId !== activeChunkRequest.current) return;
        setActiveChunk((current) => {
          if (!current) return current;
          return {
            ...current,
            sectionPath: detail.section_path ?? current.sectionPath,
            content: detail.content ?? "No chunk content available.",
            chunkType: detail.chunk_type ?? current.chunkType,
            status: "ready",
          };
        });
      })
      .catch(() => {
        if (requestId !== activeChunkRequest.current) return;
        setActiveChunk((current) => {
          if (!current) return current;
          return {
            ...current,
            content: "No chunk content available.",
            status: "error",
          };
        });
      });
  }

  function handleTreeSelect(node: SectionTreeNode) {
    if (typeof node.citationIndex === "number") {
      selectCitation(node.citationIndex);
      return;
    }
    if (node.kind === "chunk") {
      selectChunkLeaf(node);
    }
  }

  function renderTree() {
    if (!documentId) {
      return (
        <SectionTree
          roots={buildCitationTree(citations, citation)}
          collapsed={collapsed}
          onToggle={toggleNode}
          onSelect={handleTreeSelect}
        />
      );
    }

    if (documentTree.status === "error") {
      return (
        <div className="space-y-3">
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {documentTree.message}
          </p>
          <SectionTree
            roots={buildCitationTree(citations, citation)}
            collapsed={collapsed}
            onToggle={toggleNode}
            onSelect={handleTreeSelect}
          />
        </div>
      );
    }

    if (
      documentTree.status === "ready" &&
      documentTree.response &&
      documentTree.response.document_id === documentId
    ) {
      return (
        <SectionTree
          roots={buildDocumentTree(documentTree.response, citations, citation)}
          collapsed={collapsed}
          onToggle={toggleNode}
          onSelect={handleTreeSelect}
        />
      );
    }

    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        Loading document tree…
      </p>
    );
  }

  function toggleNode(nodeId: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }

  const breadcrumbPath = activeChunk
    ? activeChunk.sectionPath
    : citation?.source?.section_path;
  const chunkType = activeChunk?.chunkType ?? citation?.chunk_type;
  const content = activeChunk
    ? activeChunk.content
    : (citation?.content ?? "No chunk content available.");
  const sourceFile =
    activeChunk?.sourceFile ??
    citation?.source?.source_file_name ??
    "Unknown source";

  const toggleButton = (active: boolean, onClick: () => void, label: string) => (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`btn btn-sm ${active ? "btn-primary" : "btn-outline-secondary"}`}
    >
      {label}
    </button>
  );

  return (
    <div
      className="modal fade show d-block"
      role="dialog"
      aria-modal="true"
      aria-label="Source chunk"
      tabIndex={-1}
    >
      <div className="modal-dialog modal-dialog-centered modal-lg">
        <div className="modal-content" style={{ maxHeight: "85vh" }}>
          <div className="modal-header py-2 d-flex justify-content-between align-items-center">
            <div className="min-w-0 flex-grow-1 me-2">
              <h5 className="modal-title fs-6 text-truncate">{title}</h5>
            </div>
            <div className="d-flex align-items-center gap-2 flex-shrink-0">
              <div role="group" aria-label="Chunk view" className="btn-group btn-group-sm">
                {toggleButton(mode === "text", () => setMode("text"), "Text")}
                {toggleButton(mode === "tree", () => setMode("tree"), "Tree")}
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={onClose}
                aria-label="Close source chunk"
              />
            </div>
          </div>

          <div className="modal-body overflow-auto">
            {citation || activeChunk ? (
              mode === "tree" ? (
                renderTree()
              ) : (
                <>
                  {sectionBreadcrumb(breadcrumbPath).length > 0 ? (
                    <nav aria-label="breadcrumb" className="mb-2">
                      <ol className="breadcrumb mb-0 small">
                        {sectionBreadcrumb(breadcrumbPath).map((part, index) => (
                          <li key={index} className="breadcrumb-item">
                            {part}
                          </li>
                        ))}
                      </ol>
                    </nav>
                  ) : null}

                  <div className="d-flex flex-wrap align-items-center gap-2 mb-2 small text-secondary">
                    {chunkType ? (
                      <span className="badge text-bg-secondary">{chunkType}</span>
                    ) : null}
                    {!activeChunk && typeof citation?.score === "number" ? (
                      <span className="font-monospace">
                        score {citation.score.toFixed(4)}
                      </span>
                    ) : null}
                  </div>

                  <div className="border rounded-3 bg-body-tertiary p-3">
                    <p className="mb-0 small lh-base whitespace-pre-wrap">{content}</p>
                  </div>

                  <div className="mt-2 d-flex align-items-center gap-1 small text-secondary">
                    <FileText style={{ width: "1em", height: "1em" }} />
                    <span>{sourceFile}</span>
                  </div>
                </>
              )
            ) : (
              <div className="d-flex align-items-center justify-center small text-secondary" style={{ minHeight: "10rem" }}>
                No source selected.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
