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
        <span className="badge text-bg-secondary">{queryCount}</span>
      }
      icon={<Activity style={{ width: "1em", height: "1em" }} />}
    >
      <p className="small text-secondary mb-1">{stats}</p>
      <div className="d-flex flex-column gap-2">
        {trace.queries.map((entry, index) => (
          <div
            key={entry.query + "-" + index}
            className="border rounded-2 px-2 py-1 bg-body-tertiary"
          >
            <div className="d-flex align-items-center justify-content-between gap-2">
              <p className="small fw-medium text-truncate mb-0">
                {entry.query}
              </p>
              <span className="small text-secondary flex-shrink-0">
                {entry.result_count} hit{entry.result_count === 1 ? "" : "s"}
              </span>
            </div>
            <div className="d-flex flex-wrap align-items-center gap-2 small text-secondary mt-1">
              <span>{entry.namespace}</span>
              <span>
                {entry.referenced_chunk_count} cited chunk
                {entry.referenced_chunk_count === 1 ? "" : "s"}
              </span>
              {entry.top_scores.length > 0 ? (
                <span className="font-monospace">
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
