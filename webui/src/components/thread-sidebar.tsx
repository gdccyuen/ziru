"use client";

import { useState, type ReactElement } from "react";
import { Check, MessageSquare, Pencil, Plus, Trash2, X } from "lucide-react";
import { DEFAULT_THREAD_TITLE, type ChatThread } from "@/lib/api";

export type ThreadSidebarProps = {
  threads: readonly ChatThread[];
  threadTitles?: Readonly<Record<string, string>>;
  activeThreadId: string | null;
  loading?: boolean;
  creating?: boolean;
  onCreate: () => void;
  onSelect: (threadId: string) => void;
  onRename: (threadId: string, title: string) => void | Promise<void>;
  onDelete: (threadId: string) => void | Promise<void>;
};

export function ThreadSidebar({
  threads,
  threadTitles,
  activeThreadId,
  loading = false,
  creating = false,
  onCreate,
  onSelect,
  onRename,
  onDelete,
}: ThreadSidebarProps): ReactElement {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  function displayTitle(thread: ChatThread): string {
    const derivedTitle = threadTitles?.[thread.id];
    if (derivedTitle) return derivedTitle;
    if (thread.title !== DEFAULT_THREAD_TITLE) return thread.title;
    return DEFAULT_THREAD_TITLE;
  }

  function startRename(thread: ChatThread) {
    setEditingId(thread.id);
    setDraftTitle(thread.title);
  }

  function cancelRename() {
    setEditingId(null);
    setDraftTitle("");
  }

  async function commitRename(threadId: string) {
    const title = draftTitle.trim();
    if (title) {
      await onRename(threadId, title);
    }
    cancelRename();
  }

  function handleDelete(thread: ChatThread) {
    if (window.confirm(`Delete "${thread.title}"?`)) {
      void onDelete(thread.id);
    }
  }

  return (
    <aside className="d-flex flex-column border-end bg-body-tertiary" style={{ height: "100%" }}>
      <div className="d-flex align-items-center justify-content-between gap-2 border-bottom px-3 py-2">
        <h2 className="small text-uppercase fw-bold text-secondary mb-0">Threads</h2>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          disabled={creating}
          onClick={onCreate}
          aria-label="New chat thread"
        >
          {creating ? (
            <span className="spinner-border spinner-border-sm me-1" role="status" />
          ) : (
            <Plus style={{ width: "1em", height: "1em" }} className="me-1" />
          )}
          New
        </button>
      </div>
      <div className="flex-grow-1 overflow-auto p-2">
        {loading ? (
          <div className="text-center py-4">
            <span className="spinner-border spinner-border-sm" role="status" />
          </div>
        ) : threads.length === 0 ? (
          <p className="small text-secondary text-center px-2 py-4 mb-0">
            No threads yet. Start a new chat.
          </p>
        ) : (
          threads.map((thread) => {
            const active = thread.id === activeThreadId;
            return (
              <div
                key={thread.id}
                className={`d-flex align-items-center gap-1 rounded-2 px-2 py-1 my-1 ${active ? "bg-primary-subtle text-primary" : ""}`}
              >
                {editingId === thread.id ? (
                  <div className="d-flex flex-grow-1 align-items-center gap-1">
                    <input
                      className="form-control form-control-sm"
                      value={draftTitle}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void commitRename(thread.id);
                        if (event.key === "Escape") cancelRename();
                      }}
                      aria-label="Thread title"
                      autoFocus
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-link text-secondary p-0"
                      aria-label="Save title"
                      onClick={() => void commitRename(thread.id)}
                    >
                      <Check style={{ width: "1em", height: "1em" }} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-link text-secondary p-0"
                      aria-label="Cancel rename"
                      onClick={cancelRename}
                    >
                      <X style={{ width: "1em", height: "1em" }} />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onSelect(thread.id)}
                      className="d-flex flex-grow-1 align-items-center gap-1 text-start border-0 bg-transparent p-0"
                    >
                      <MessageSquare style={{ width: "1em", height: "1em" }} className="flex-shrink-0" />
                      <span className="small text-truncate">{displayTitle(thread)}</span>
                    </button>
                    <span className="d-none d-md-inline-flex align-items-center gap-1">
                      <button
                        type="button"
                        className="btn btn-sm btn-link text-secondary p-0"
                        aria-label="Rename thread"
                        onClick={() => startRename(thread)}
                      >
                        <Pencil style={{ width: "1em", height: "1em" }} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-link text-secondary p-0"
                        aria-label="Delete thread"
                        onClick={() => handleDelete(thread)}
                      >
                        <Trash2 style={{ width: "1em", height: "1em" }} />
                      </button>
                    </span>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
