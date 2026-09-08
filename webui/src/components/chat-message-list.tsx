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
      <div className="flex-grow-1 d-flex align-items-center justify-center px-4 py-5 text-center">
        <p className="small text-secondary mb-0" style={{ maxWidth: "24rem" }}>
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
    <div className="flex-grow-1 d-flex flex-column gap-3 overflow-auto px-3 py-3">
      {orderedMessages.map((message) => (
        <ChatBubble key={message.id} message={message} />
      ))}
      {pending ? (
        <div className="d-flex align-items-center gap-2 small text-secondary">
          <span
            className="spinner-border spinner-border-sm"
            role="status"
          />
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
    a: ({ href, children, node, title, ...props }) => {
      void node;
      const marker =
        typeof href === "string" ? href.match(/^#source-(\d+)$/) : null;
      if (marker) {
        return (
          <button
            type="button"
            onClick={() => openCitation(Number(marker[1]) - 1)}
            title={title}
            className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
          >
            {children}
          </button>
        );
      }
      return (
        <a href={href} title={title} {...props}>
          {children}
        </a>
      );
    },
  };

  return (
    <>
      <div
        className={cn(
          "d-flex flex-column",
          isUser ? "align-items-end" : "align-items-start",
        )}
        style={{ maxWidth: "85%" }}
      >
        <div
          className={cn(
            "w-100 border rounded-3 px-3 py-2",
            isUser ? "bg-primary-subtle" : "bg-body-tertiary",
          )}
        >
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
        <time className="small text-secondary mt-1">
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
      badge={<span className="badge text-bg-secondary">{numbered.length}</span>}
      icon={<Link2 style={{ width: "1em", height: "1em" }} />}
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
                "border rounded-2 px-2 py-1 bg-body-tertiary",
                selectedCitation === index && "border-primary bg-primary-subtle",
              )}
            >
              <div className="d-flex align-items-center gap-1">
                <span className="small fw-semibold text-secondary flex-shrink-0">
                  {index + 1}.
                </span>
                <button
                  type="button"
                  onClick={() => onOpenCitation(index)}
                  className="d-flex min-w-0 align-items-center gap-1 small fw-medium border-0 bg-transparent p-0 text-primary hover:underline"
                >
                  <FileText style={{ width: "1em", height: "1em" }} className="flex-shrink-0" />
                  <span className="text-truncate">{title}</span>
                </button>
                {href ? (
                  <a
                    href={href}
                    aria-label={"Open document for " + title}
                    className="ms-auto flex-shrink-0 p-1 text-secondary hover:text-body"
                  >
                    <ExternalLink style={{ width: "1em", height: "1em" }} />
                  </a>
                ) : null}
              </div>
              {citation.source?.section_path ? (
                <p className="small text-secondary text-truncate mb-0">
                  {citation.source.section_path}
                </p>
              ) : null}
              {citation.content ? (
                <button
                  type="button"
                  onClick={() => onOpenCitation(index)}
                  className="mt-1 d-block w-100 text-start border-0 bg-transparent p-0 small text-secondary hover:text-body"
                >
                  <span className="line-clamp-2">{citation.content}</span>
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}
