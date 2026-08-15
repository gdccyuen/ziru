export type ChatProgressPhase = "preparing" | "answering"

export type RetrievalProgressEvent =
  | {
      readonly type: "retrieval_start"
      readonly attempt: number
      readonly query: string
      readonly namespace: string
    }
  | {
      readonly type: "retrieval_done"
      readonly attempt: number
      readonly resultCount: number
      readonly referencedChunkCount: number
    }

export type ChatProgressEvent =
  | { readonly type: "phase"; readonly phase: ChatProgressPhase }
  | RetrievalProgressEvent

const QUERY_TEXT_LIMIT = 48
const SEARCHING_PREFIX = "Searching sources…"
const PROGRESS_EVENT_TYPES = new Set(["phase", "retrieval_start", "retrieval_done"])

export function isChatProgressEvent(value: unknown): value is ChatProgressEvent {
  if (typeof value !== "object" || value === null) return false
  const type = (value as { readonly type?: unknown }).type
  return typeof type === "string" && PROGRESS_EVENT_TYPES.has(type)
}

export function formatChatProgressText(
  event: ChatProgressEvent,
): string {
  switch (event.type) {
    case "phase":
      return event.phase === "answering"
        ? `${SEARCHING_PREFIX} composing answer…`
        : SEARCHING_PREFIX
    case "retrieval_start": {
      const query = truncateQueryText(event.query)
      return `${SEARCHING_PREFIX} query ${event.attempt}: ${query}`
    }
    case "retrieval_done": {
      const hitCount = event.resultCount + event.referencedChunkCount
      return `${SEARCHING_PREFIX} query ${event.attempt} · ${hitCount} ${
        hitCount === 1 ? "hit" : "hits"
      }`
    }
  }
}

function truncateQueryText(query: string): string {
  const normalized = query.replace(/\s+/g, " ").trim()
  if (normalized.length <= QUERY_TEXT_LIMIT) return normalized
  return `${normalized.slice(0, QUERY_TEXT_LIMIT)}…`
}
