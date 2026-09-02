"use client";

import { Activity } from "lucide-react";
import type { RetrievalTrace } from "@/lib/api";
import { CollapsibleSection } from "@/components/collapsible-section";

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";
  if (seconds < 1) return Math.round(seconds * 1000) + " ms";
  return seconds.toFixed(1) + " s";
}

export function ChatRetrievalTrace({ trace }: { trace: RetrievalTrace | null }) {
  if (!trace) return null;

  const queryCount = trace.queries.length;
  const stats = [
    formatDuration(trace.duration_seconds),
    trace.llm_call_count + " LLM call" + (trace.llm_call_count === 1 ? "" : "s"),
    trace.input_tokens + " input tokens",
    trace.output_tokens + " output tokens",
  ].join(" · ");

  return (
    <CollapsibleSection
      title="Retrieval"
      badge={
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
          {queryCount}
        </span>
      }
      icon={<Activity className="size-3" />}
    >
      <p className="text-[11px] text-muted-foreground">{stats}</p>
      <div className="mt-2 space-y-1.5">
        {trace.queries.map((entry, index) => (
          <div
            key={entry.query + "-" + index}
            className="rounded-md border border-border/50 bg-muted/30 px-2.5 py-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-medium text-foreground">
                {entry.query}
              </p>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {entry.result_count} hit{entry.result_count === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
              <span>{entry.namespace}</span>
              <span>
                {entry.referenced_chunk_count} cited chunk
                {entry.referenced_chunk_count === 1 ? "" : "s"}
              </span>
              {entry.top_scores.length > 0 ? (
                <span className="font-mono">
                  top {entry.top_scores.map((score) => score.toFixed(2)).join(", ")}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}
