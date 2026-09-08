"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { Send } from "lucide-react";
import {
  RetrievalSettingsRow,
  type RetrievalSettings,
} from "@/components/retrieval-settings";

const MAX_ROWS = 5;
const MIN_HEIGHT = 40;
const PLACEHOLDER_RANGE_PATTERN = /\[[^\]\r\n]{1,80}\]/gu;

export type ChatComposerProps = {
  disabled?: boolean;
  placeholder?: string;
  sending?: boolean;
  retrievalSettings?: RetrievalSettings;
  onRetrievalSettingsChange?: (next: RetrievalSettings) => void;
  onSend: (text: string) => void | Promise<void>;
};

export function ChatComposer({
  disabled = false,
  placeholder = "Ask a question about your knowledge…",
  sending = false,
  retrievalSettings,
  onRetrievalSettingsChange,
  onSend,
}: ChatComposerProps): ReactElement {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const capped = Math.min(textarea.scrollHeight, MAX_ROWS * 22 + 20);
    textarea.style.height = `${Math.max(MIN_HEIGHT, capped)}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > MAX_ROWS * 22 + 20 ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    resize();
  }, [resize, value]);

  const canSend = value.trim().length > 0 && !disabled && !sending;

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  async function handleSend() {
    const text = value.trim();
    if (!text || !canSend) return;
    setValue("");
    await onSend(text);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }

  function handleSelectPrompt(prompt: string) {
    setValue(prompt);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus({ preventScroll: true });
      const range = getFirstPlaceholderRange(prompt);
      if (!range) {
        textarea.setSelectionRange(prompt.length, prompt.length);
        return;
      }
      textarea.setSelectionRange(range.start, range.end);
    });
  }

  return (
    <div data-testid="chat-composer" className="border-top bg-body-tertiary p-3">
      <div className="d-flex align-items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || sending}
          placeholder={placeholder}
          aria-label="Chat message"
          rows={1}
          className="form-control flex-grow-1"
          style={{ minHeight: "2.5rem", maxHeight: "130px", resize: "none" }}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canSend}
          onClick={() => void handleSend()}
          aria-label="Send message"
        >
          <Send style={{ width: "1em", height: "1em" }} className="me-1" />
          <span className="d-none d-sm-inline">{sending ? "Sending" : "Send"}</span>
        </button>
      </div>
      {retrievalSettings && onRetrievalSettingsChange ? (
        <RetrievalSettingsRow
          className="mt-2"
          value={retrievalSettings}
          onChange={onRetrievalSettingsChange}
          onSelectPrompt={handleSelectPrompt}
          disabled={disabled || sending}
        />
      ) : null}
      <p className="small text-secondary mb-0 mt-2">
        Enter to send · Shift+Enter for a new line
      </p>
    </div>
  );
}

type TextRange = {
  start: number;
  end: number;
};

function getFirstPlaceholderRange(value: string): TextRange | null {
  const first = value.matchAll(PLACEHOLDER_RANGE_PATTERN).next();
  if (first.done || !first.value) return null;
  const match = first.value;
  const start = match.index ?? 0;
  return { start, end: start + match[0].length };
}
