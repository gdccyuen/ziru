"use client";

import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExternalLink, FileText, Link2 } from "lucide-react";
import type { ChatMessage, RetrievalResult } from "@/lib/api";
import { annotateSourceMarkers, citationLabel, numberedCitations } from "@/lib/chat-citations";
import { ChatArtifacts } from "@/components/chat-artifacts";
import { ChatChunkPane } from "@/components/chat-chunk-pane";
import { ChatRetrievalTrace } from "@/components/chat-retrieval-trace";
import { CollapsibleSection } from "@/components/collapsible-section";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ChatMessageList({
  messages,
  pending,
}: {
  messages: readonly ChatMessage[];
  pending?: boolean;
}) {
  if (messages.length === 0 && !pending) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-12 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          Start a conversation to search your knowledge. Answers cite the
          passages they come from.
        </p>
      </div>
    );
  }

  const orderedMessages = messages.slice().sort((left, right) => {
    const leftTime = left.created_at ? Date.parse(left.created_at) : Number.NaN;
    const rightTime = right.created_at ? Date.parse(right.created_at) : Number.NaN;
    const leftSafe = Number.isNaN(leftTime) ? 0 : leftTime;
    const rightSafe = Number.isNaN(rightTime) ? 0 : rightTime;
    if (leftSafe !== rightSafe) return leftSafe - rightSafe;
    return left.id.localeCompare(right.id);
  });

  return (
    <div className="flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-5">
      {orderedMessages.map((message) => (
        <ChatBubble key={message.id} message={message} />
      ))}
      {pending ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-2 animate-pulse rounded-full bg-primary" />
          Searching your knowledge…
        </div>
      ) : null}
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const [selectedCitation, setSelectedCitation] = useState<number | null>(null);

  function openCitation(index: number) {
    setSelectedCitation(index);
    document
      .getElementById("source-" + (index + 1))
      ?.scrollIntoView({ block: "nearest" });
  }

  const markdownComponents: Components = {
    a: ({ href, children, node, ...props }) => {
      void node;
      const marker =
        typeof href === "string" ? href.match(/^#source-(\d+)$/) : null;
      if (marker) {
        return (
          <button
            type="button"
            onClick={() => openCitation(Number(marker[1]) - 1)}
            className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
          >
            {children}
          </button>
        );
      }
      return (
        <a href={href} {...props}>
          {children}
        </a>
      );
    },
  };

  return (
    <>
      <div
        className={cn(
          "flex max-w-[85%] flex-col",
          isUser ? "items-end" : "items-start",
        )}
      >
        <div className={cn("w-full rounded-lg border border-border/70 bg-background px-3.5 py-2.5", isUser ? "bg-primary/5" : "")}>
          {isUser ? (
            <p className="whitespace-pre-wrap text-base leading-7 text-foreground">{message.content}</p>
          ) : (
            <div>
              <div className="chat-markdown-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {annotateSourceMarkers(message.content)}
                </ReactMarkdown>
              </div>
              <ChatRetrievalTrace trace={message.trace} />
              {message.citations.length > 0 ? (
                <Sources
                  citations={message.citations}
                  selectedCitation={selectedCitation}
                  onOpenCitation={openCitation}
                />
              ) : null}
              <ChatArtifacts
                citations={message.citations}
                onOpenCitation={openCitation}
              />
            </div>
          )}
        </div>
        <time className="mt-1 text-[10px] text-muted-foreground">
          {formatDateTime(message.created_at)}
        </time>
      </div>
      <ChatChunkPane
        open={selectedCitation !== null}
        citations={message.citations}
        selectedIndex={selectedCitation}
        initialMode="tree"
        onClose={() => setSelectedCitation(null)}
        onSelectCitation={setSelectedCitation}
      />
    </>
  );
}

function Sources({
  citations,
  selectedCitation,
  onOpenCitation,
}: {
  citations: readonly RetrievalResult[];
  selectedCitation: number | null;
  onOpenCitation: (index: number) => void;
}) {
  const numbered = numberedCitations(citations);

  return (
    <CollapsibleSection
      title="Sources"
      badge={
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
          {numbered.length}
        </span>
      }
      icon={<Link2 className="size-3" />}
    >
      <div className="space-y-1.5">
        {numbered.map(({ citation, index }) => {
          const title = citationLabel(citation, index);
          const href = citation.source?.document_id
            ? "/documents?document=" + encodeURIComponent(citation.source.document_id)
            : undefined;
          return (
            <div
              key={citation.source?.document_id + "-" + index}
              id={"source-" + (index + 1)}
              className={cn(
                "rounded-md border border-border/50 bg-muted/30 px-2.5 py-1.5",
                selectedCitation === index && "border-primary/60 bg-primary/5",
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="shrink-0 text-[10px] font-semibold text-muted-foreground">
                  {index + 1}.
                </span>
                <button
                  type="button"
                  onClick={() => onOpenCitation(index)}
                  className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  <FileText className="size-3.5 shrink-0" />
                  <span className="truncate">{title}</span>
                </button>
                {href ? (
                  <a
                    href={href}
                    aria-label={"Open document for " + title}
                    className="ml-auto shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ExternalLink className="size-3" />
                  </a>
                ) : null}
              </div>
              {citation.source?.section_path ? (
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {citation.source.section_path}
                </p>
              ) : null}
              {citation.content ? (
                <button
                  type="button"
                  onClick={() => onOpenCitation(index)}
                  className="mt-1 block w-full text-left line-clamp-2 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  {citation.content}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}
