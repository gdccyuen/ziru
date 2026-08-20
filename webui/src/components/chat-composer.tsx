"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const MAX_ROWS = 5;
const MIN_HEIGHT = 40;

export type ChatComposerProps = {
  disabled?: boolean;
  placeholder?: string;
  sending?: boolean;
  onSend: (text: string) => void | Promise<void>;
};

export function ChatComposer({
  disabled = false,
  placeholder = "Ask a question about your knowledge…",
  sending = false,
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

  return (
    <div data-testid="chat-composer" className="shrink-0 border-t border-border/70 bg-background p-3">
      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || sending}
          placeholder={placeholder}
          aria-label="Chat message"
          className="min-h-10 max-h-[130px] flex-1 resize-none border-border/70 bg-muted/40 px-3 py-2 text-sm leading-5 shadow-none focus-visible:ring-1"
          rows={1}
        />
        <Button
          type="button"
          variant="default"
          size="sm"
          className="h-10 shrink-0 gap-1.5 rounded-md px-4"
          disabled={!canSend}
          onClick={() => void handleSend()}
          aria-label="Send message"
        >
          <Send className="size-4" />
          <span className="hidden sm:inline">{sending ? "Sending" : "Send"}</span>
        </Button>
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        Enter to send · Shift+Enter for a new line
      </p>
    </div>
  );
}
