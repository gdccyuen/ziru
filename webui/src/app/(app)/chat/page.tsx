"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { ApiError, api, type AttributeFilter, type ChatMessage, type ChatThread } from "@/lib/api";
import { ChatComposer } from "@/components/chat-composer";
import { ChatMessageList } from "@/components/chat-message-list";
import {
  RETRIEVAL_DEFAULTS,
  type RetrievalSettings,
} from "@/components/retrieval-settings";
import { ThreadSidebar } from "@/components/thread-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { clearCorpusScope, getCorpusScope, subscribeCorpusScope, type CorpusScope } from "@/lib/corpus-scope";

function settingsFromThread(thread: ChatThread | null): RetrievalSettings {
  return {
    ...RETRIEVAL_DEFAULTS,
    ...(thread?.retrieval_params ?? {}),
  };
}

function filtersEqual(left: AttributeFilter[], right: AttributeFilter[]): boolean {
  const normalize = (filters: AttributeFilter[]) =>
    filters
      .filter((filter) => filter.values.length > 0)
      .map((filter) => ({ key: filter.key, values: [...filter.values].sort() }))
      .sort((a, b) => a.key.localeCompare(b.key));
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

export default function ChatPage() {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrievalSettings, setRetrievalSettings] = useState<RetrievalSettings>(
    RETRIEVAL_DEFAULTS,
  );
  const [corpusScope, setCorpusScopeState] = useState<CorpusScope>(() =>
    getCorpusScope(),
  );
  const initializedRef = useRef(false);

  const loadThreads = useCallback(async () => {
    setLoadingThreads(true);
    setError(null);
    try {
      const response = await api.chatThreads.list();
      setThreads(response.threads);
      return response.threads;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load threads.");
      return [];
    } finally {
      setLoadingThreads(false);
    }
  }, []);

  const loadMessages = useCallback(async (threadId: string) => {
    setLoadingMessages(true);
    setError(null);
    try {
      const response = await api.chatThreads.messages(threadId);
      setMessages(response.messages);
      setRetrievalSettings(settingsFromThread(response.thread));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load messages.");
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => subscribeCorpusScope((scope) => setCorpusScopeState(scope)), []);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    void (async () => {
      const loaded = await loadThreads();
      if (loaded.length > 0) {
        setActiveThreadId(loaded[0].id);
        await loadMessages(loaded[0].id);
      }
    })();
  }, [loadMessages, loadThreads]);

  function handleSelectThread(threadId: string) {
    setActiveThreadId(threadId);
    void loadMessages(threadId);
  }

  async function handleCreateThread() {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const thread = await api.chatThreads.create(
        corpusScope.length > 0 ? { filters: corpusScope } : {},
      );
      setThreads((current) => [thread, ...current]);
      setActiveThreadId(thread.id);
      setMessages([]);
      setRetrievalSettings(RETRIEVAL_DEFAULTS);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create thread.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRenameThread(threadId: string, title: string) {
    try {
      const updated = await api.chatThreads.rename(threadId, title);
      setThreads((current) =>
        current.map((thread) => (thread.id === threadId ? updated : thread)),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not rename thread.");
    }
  }

  async function handleRetrievalSettingsChange(next: RetrievalSettings) {
    setRetrievalSettings(next);
    if (!activeThreadId) return;
    try {
      const updated = await api.chatThreads.update(activeThreadId, {
        retrieval_params: next,
      });
      setThreads((current) =>
        current.map((thread) =>
          thread.id === activeThreadId ? updated : thread,
        ),
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not update retrieval settings.",
      );
    }
  }

  async function handleDeleteThread(threadId: string) {
    try {
      await api.chatThreads.archive(threadId);
      const remaining = threads.filter((thread) => thread.id !== threadId);
      setThreads(remaining);
      if (activeThreadId === threadId) {
        if (remaining.length > 0) {
          setActiveThreadId(remaining[0].id);
          await loadMessages(remaining[0].id);
        } else {
          setActiveThreadId(null);
          setMessages([]);
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete thread.");
    }
  }

  async function ensureThreadScope(threadId: string) {
    const thread = threads.find((item) => item.id === threadId);
    if (!thread || filtersEqual(thread.filters, corpusScope)) return;
    const updated = await api.chatThreads.update(threadId, {
      filters: corpusScope,
    });
    setThreads((current) =>
      current.map((item) => (item.id === threadId ? updated : item)),
    );
  }

  async function handleSend(text: string) {
    if (!activeThreadId || sending) return;
    setSending(true);
    setError(null);
    try {
      await ensureThreadScope(activeThreadId);
      const result = await api.chatThreads.postMessage(activeThreadId, {
        content: text,
      });
      setMessages((current) => [
        ...current,
        result.user_message,
        result.assistant_message,
      ]);
      const shortTitle = result.user_message.content.slice(0, 60);
      setThreads((current) =>
        current.map((thread) =>
          thread.id === activeThreadId
            ? { ...thread, title: shortTitle }
            : thread,
        ),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  }

  const activeThread =
    threads.find((thread) => thread.id === activeThreadId) ?? null;
  const messageCountLabel =
    messages.length === 1 ? "1 message" : messages.length + " messages";

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[480px] overflow-hidden rounded-xl border border-border/70 bg-background">
      <div className="hidden w-64 shrink-0 md:block">
        <ThreadSidebar
          threads={threads}
          activeThreadId={activeThreadId}
          loading={loadingThreads}
          creating={creating}
          onCreate={() => void handleCreateThread()}
          onSelect={handleSelectThread}
          onRename={(threadId, title) => handleRenameThread(threadId, title)}
          onDelete={(threadId) => handleDeleteThread(threadId)}
        />
      </div>
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-background px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-foreground">
              {activeThread?.title ?? "New chat"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {activeThread ? messageCountLabel : "Create a thread to begin"}
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" className="md:hidden" onClick={() => void handleCreateThread()} disabled={creating}>
            New thread
          </Button>
        </header>
        {error ? (
          <p className="border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        {loadingMessages ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner className="size-5" />
          </div>
        ) : activeThread ? (
          <>
            <ChatMessageList messages={messages} pending={sending} />
            {corpusScope.length > 0 ? (
              <div className="shrink-0 border-t border-border/70 bg-background px-4 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Corpus scope
                  </span>
                  {corpusScope.map((filter) => (
                    <Badge key={filter.key} variant="secondary" className="text-[10px]">
                      {filter.key}: {filter.values.join(", ")}
                    </Badge>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-6 gap-1 px-2 text-[10px]"
                    onClick={() => clearCorpusScope()}
                  >
                    <X className="size-3" />
                    Clear
                  </Button>
                </div>
              </div>
            ) : null}
            <ChatComposer
              disabled={!activeThread}
              sending={sending}
              retrievalSettings={retrievalSettings}
              onRetrievalSettingsChange={(next) =>
                void handleRetrievalSettingsChange(next)
              }
              onSend={(text) => handleSend(text)}
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="max-w-sm text-sm text-muted-foreground">
              Your chat threads live in the core API, scoped to your account.
            </p>
            <Button type="button" onClick={() => void handleCreateThread()} disabled={creating}>
              Start a new chat
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
