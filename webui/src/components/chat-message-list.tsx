"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Link2 } from "lucide-react";
import type { ChatMessage, RetrievalResult } from "@/lib/api";
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

  return (
    <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
      {messages.map((message) => (
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
  return (
    <div
      className={cn(
        "flex",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div className={cn("max-w-[85%] rounded-lg border border-border/70 bg-background px-3.5 py-2.5", isUser ? "bg-primary/5" : "")}>
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm text-foreground">{message.content}</p>
        ) : (
          <div>
            <div className="chat-markdown-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
            {message.citations.length > 0 ? (
              <Citations citations={message.citations} />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function Citations({ citations }: { citations: readonly RetrievalResult[] }) {
  const seen = new Set<string>();
  const unique = citations.filter((citation) => {
    const source = citation.source;
    const key =
      String(source?.document_id ?? "") + "|" + String(citation.chunk_id ?? "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <div className="mt-3 border-t border-border/60 pt-2.5">
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Link2 className="size-3" />
        Sources
      </p>
      <div className="grid gap-1.5">
        {unique.slice(0, 5).map((citation, index) => {
          const source = citation.source;
          const title =
            source?.source_file_name ?? source?.document_id ?? "Source " + (index + 1);
          const href = source?.document_id
            ? "/documents?document=" + encodeURIComponent(source.document_id)
            : undefined;
          return (
            <div key={source?.document_id + "-" + index} className="rounded-md border border-border/50 bg-muted/30 px-2.5 py-1.5">
              <a
                href={href}
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <FileText className="size-3.5 shrink-0" />
                <span className="truncate">{title}</span>
              </a>
              {source?.section_path ? (
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {source.section_path}
                </p>
              ) : null}
              {citation.content ? (
                <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                  {citation.content}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
