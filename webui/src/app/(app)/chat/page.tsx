"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { ApiError, api, DEFAULT_THREAD_TITLE, type AttributeFilter, type ChatMessage, type ChatThread } from "@/lib/api";
import { ChatComposer } from "@/components/chat-composer";
import { ChatMessageList } from "@/components/chat-message-list";
import {
  RETRIEVAL_DEFAULTS,
  type RetrievalSettings,
} from "@/components/retrieval-settings";
import { ThreadSidebar } from "@/components/thread-sidebar";
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

function optimisticUserMessage(threadId: string, content: string): ChatMessage {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return {
    id: `optimistic-${id}`,
    thread_id: threadId,
    role: "user",
    content,
    citations: [],
    trace: null,
    created_at: new Date().toISOString(),
  };
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
  const [sendNotice, setSendNotice] = useState<string | null>(null);
  const [retrievalSettings, setRetrievalSettings] = useState<RetrievalSettings>(
    RETRIEVAL_DEFAULTS,
  );
  const [corpusScope, setCorpusScopeState] = useState<CorpusScope>(() =>
    getCorpusScope(),
  );
  const initializedRef = useRef(false);
  const activeThreadIdRef = useRef<string | null>(null);
  const refetchTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

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

  const refreshMessages = useCallback(async (threadId: string) => {
    try {
      const response = await api.chatThreads.messages(threadId);
      setMessages(response.messages);
      setRetrievalSettings(settingsFromThread(response.thread));
    } catch {
      // Transient refetch failure: keep whatever is already on screen.
    }
  }, []);

  const clearScheduledRefetches = useCallback(() => {
    for (const timer of refetchTimersRef.current) clearTimeout(timer);
    refetchTimersRef.current = [];
  }, []);

  const scheduleRefetch = useCallback(
    (threadId: string) => {
      for (const delay of [8000, 30000]) {
        const timer = setTimeout(() => {
          if (activeThreadIdRef.current === threadId) {
            void refreshMessages(threadId);
          }
        }, delay);
        refetchTimersRef.current.push(timer);
      }
    },
    [refreshMessages],
  );

  useEffect(() => subscribeCorpusScope((scope) => setCorpusScopeState(scope)), []);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => () => clearScheduledRefetches(), [clearScheduledRefetches]);

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
    setSendNotice(null);
    clearScheduledRefetches();
    void loadMessages(threadId);
  }

  async function handleCreateThread() {
    if (creating) return;
    setCreating(true);
    setError(null);
    setSendNotice(null);
    clearScheduledRefetches();
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
    setSendNotice(null);
    clearScheduledRefetches();
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
    setSendNotice(null);
    clearScheduledRefetches();

    const optimistic = optimisticUserMessage(activeThreadId, text);
    setMessages((current) => [...current, optimistic]);

    try {
      await ensureThreadScope(activeThreadId);
    } catch (err) {
      setMessages((current) => current.filter((item) => item.id !== optimistic.id));
      setError(
        err instanceof ApiError ? err.message : "Could not update thread scope.",
      );
      setSending(false);
      return;
    }

    try {
      const result = await api.chatThreads.postMessage(activeThreadId, {
        content: text,
      });
      setMessages((current) => [
        ...current.filter((item) => item.id !== optimistic.id),
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
    } catch {
      setSendNotice(
        "Your question was sent; the answer may still be generating - refresh to see it.",
      );
      scheduleRefetch(activeThreadId);
    } finally {
      setSending(false);
    }
  }

  const activeThread =
    threads.find((thread) => thread.id === activeThreadId) ?? null;
  const messageCountLabel =
    messages.length === 1 ? "1 message" : messages.length + " messages";

  const threadDisplayTitles = useMemo(() => {
    const labels: Record<string, string> = {};
    if (!activeThread) return labels;
    const firstUserMessage = messages.find((message) => message.role === "user");
    if (!firstUserMessage) return labels;

    const firstContent = firstUserMessage.content.trim();
    if (!firstContent) return labels;

    const isAutoTitle =
      activeThread.title === DEFAULT_THREAD_TITLE ||
      activeThread.title === firstContent.slice(0, 60);
    if (isAutoTitle) {
      labels[activeThread.id] = firstContent;
    }
    return labels;
  }, [activeThread, messages]);

  const activeThreadDisplayTitle =
    threadDisplayTitles[activeThreadId ?? ""] ??
    activeThread?.title ??
    DEFAULT_THREAD_TITLE;

  return (
    <div
      className="d-flex border rounded-3 overflow-hidden bg-body-tertiary"
      style={{ height: "calc(100vh - 7rem)", minHeight: "480px" }}
    >
      <div className="d-none d-md-block border-end" style={{ width: "15rem", flexShrink: 0 }}>
        <ThreadSidebar
          threads={threads}
          threadTitles={threadDisplayTitles}
          activeThreadId={activeThreadId}
          loading={loadingThreads}
          creating={creating}
          onCreate={() => void handleCreateThread()}
          onSelect={handleSelectThread}
          onRename={(threadId, title) => handleRenameThread(threadId, title)}
          onDelete={(threadId) => handleDeleteThread(threadId)}
        />
      </div>
      <section className="d-flex flex-column flex-grow-1 min-w-0">
        <header className="d-flex align-items-center justify-content-between gap-3 border-bottom bg-body-tertiary px-3 py-2">
          <div className="min-w-0">
            <h2 className="fs-6 fw-bold text-truncate mb-0">
              {activeThreadDisplayTitle}
            </h2>
            <p className="small text-secondary mb-0">
              {activeThread ? messageCountLabel : "Create a thread to begin"}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary d-md-none"
            onClick={() => void handleCreateThread()}
            disabled={creating}
          >
            New thread
          </button>
        </header>
        {error ? (
          <div className="alert alert-danger border-0 rounded-0 border-bottom py-2 mb-0">
            {error}
          </div>
        ) : null}
        {loadingMessages ? (
          <div className="flex-grow-1 d-flex align-items-center justify-center">
            <span className="spinner-border spinner-border-sm" role="status" />
          </div>
        ) : activeThread ? (
          <>
            <ChatMessageList messages={messages} pending={sending} />
            {corpusScope.length > 0 ? (
              <div className="border-top bg-body-tertiary px-3 py-2">
                <div className="d-flex flex-wrap align-items-center gap-1">
                  <span className="small fw-semibold text-uppercase text-secondary">
                    Corpus scope
                  </span>
                  {corpusScope.map((filter) => (
                    <span key={filter.key} className="badge text-bg-secondary">
                      {filter.key}: {filter.values.join(", ")}
                    </span>
                  ))}
                  <button
                    type="button"
                    className="btn btn-sm btn-link ms-auto py-0"
                    onClick={() => clearCorpusScope()}
                  >
                    <X style={{ width: "1em", height: "1em" }} className="me-1" />
                    Clear
                  </button>
                </div>
              </div>
            ) : null}
            {sendNotice ? (
              <p className="small text-secondary border-top bg-body-tertiary px-3 py-2 mb-0">
                {sendNotice}
              </p>
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
          <div className="flex-grow-1 d-flex flex-column align-items-center justify-content-center gap-2 px-4 text-center">
            <p className="small text-secondary mb-0">
              Your chat threads live in the core API, scoped to your account.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleCreateThread()}
              disabled={creating}
            >
              Start a new chat
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
