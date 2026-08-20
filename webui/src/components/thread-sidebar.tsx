"use client";

import { useState, type ReactElement } from "react";
import { Check, MessageSquare, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { ChatThread } from "@/lib/api";

export type ThreadSidebarProps = {
  threads: readonly ChatThread[];
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
    <aside className="flex h-full w-full flex-col border-r border-border/70 bg-background">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2.5">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Threads
        </h2>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={creating}
          onClick={onCreate}
          aria-label="New chat thread"
          className="h-7 gap-1 rounded-md px-2 text-xs"
        >
          {creating ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" />}
          New
        </Button>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex justify-center py-6">
            <Spinner className="size-4" />
          </div>
        ) : threads.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No threads yet. Start a new chat.
          </p>
        ) : (
          threads.map((thread) => (
            <div
              key={thread.id}
              className={cn(
                "group flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors",
                thread.id === activeThreadId
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-muted",
              )}
            >
              {editingId === thread.id ? (
                <div className="flex flex-1 items-center gap-1">
                  <Input
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void commitRename(thread.id);
                      if (event.key === "Escape") cancelRename();
                    }}
                    aria-label="Thread title"
                    className="h-7 text-xs"
                    autoFocus
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-6"
                    aria-label="Save title"
                    onClick={() => void commitRename(thread.id)}
                  >
                    <Check className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-6"
                    aria-label="Cancel rename"
                    onClick={cancelRename}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onSelect(thread.id)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    <MessageSquare className="size-3.5 shrink-0" />
                    <span className="truncate text-xs font-medium">{thread.title}</span>
                  </button>
                  <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-6"
                      aria-label="Rename thread"
                      onClick={() => startRename(thread)}
                    >
                      <Pencil className="size-3" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-6"
                      aria-label="Delete thread"
                      onClick={() => handleDelete(thread)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
