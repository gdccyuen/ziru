"use client";

import { useEffect, useState, type ReactElement } from "react";
import { FileText, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type RetrievalSettings = {
  rerank: boolean;
  top_k: number;
  internal_recall_k: number;
  use_agentic: boolean;
};

export const RETRIEVAL_DEFAULTS: RetrievalSettings = {
  rerank: true,
  top_k: 8,
  internal_recall_k: 30,
  use_agentic: true,
};

type PromptTemplate = {
  id: string;
  title: string;
  prompt: string;
};

export type RetrievalSettingsProps = {
  value: RetrievalSettings;
  onChange: (next: RetrievalSettings) => void;
  onSelectPrompt?: (prompt: string) => void;
  disabled?: boolean;
  className?: string;
};

const PROMPT_TEMPLATES_URL = "/data/chat-prompt-templates.json";

export function RetrievalSettingsRow({
  value,
  onChange,
  onSelectPrompt,
  disabled = false,
  className,
}: RetrievalSettingsProps): ReactElement {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(PROMPT_TEMPLATES_URL)
      .then((response) => (response.ok ? response.json() : []))
      .then((data: unknown) => {
        if (cancelled) return;
        setTemplates(
          Array.isArray(data)
            ? data.filter(isPromptTemplate)
            : [],
        );
      })
      .catch(() => {
        if (cancelled) return;
        setTemplates([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingTemplates(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function update(changes: Partial<RetrievalSettings>) {
    onChange({ ...value, ...changes });
  }

  return (
    <div
      data-testid="retrieval-settings"
      className={
        "flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-medium text-muted-foreground" +
        (className ? " " + className : "")
      }
    >
      <DropdownMenu>
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <DropdownMenuTrigger asChild>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  aria-label="Prompt templates"
                  className="h-7 w-7 rounded-md p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <WandSparkles className="size-3.5" />
                </Button>
              </TooltipTrigger>
            </DropdownMenuTrigger>
            <TooltipContent side="top">Prompt templates</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenuContent align="start" side="top" className="w-72">
          {loadingTemplates ? (
            <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground">
              <Spinner className="size-3.5" />
              Loading templates
            </div>
          ) : (
            templates.map((template) => (
              <DropdownMenuItem
                key={template.id}
                onSelect={() => onSelectPrompt?.(template.prompt)}
              >
                <FileText className="size-4" />
                {template.title}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <label className="flex cursor-pointer items-center gap-2">
        Rerank
        <Switch
          size="sm"
          checked={value.rerank}
          disabled={disabled}
          onCheckedChange={(checked) => update({ rerank: Boolean(checked) })}
          aria-label="Rerank retrieval results"
        />
      </label>

      <SliderControl
        ariaLabel="Top K results"
        disabled={disabled}
        label="Top K"
        max={50}
        min={1}
        step={1}
        value={value.top_k}
        onChange={(next) => update({ top_k: next })}
      />

      <SliderControl
        ariaLabel="Recall K"
        disabled={disabled}
        label="Recall K"
        max={200}
        min={10}
        step={5}
        value={value.internal_recall_k}
        onChange={(next) => update({ internal_recall_k: next })}
      />

      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <label className="flex cursor-pointer items-center gap-2">
            Agentic
            <TooltipTrigger asChild>
              <Switch
                size="sm"
                checked={value.use_agentic}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  update({ use_agentic: Boolean(checked) })
                }
                aria-label="Use agentic retrieval"
              />
            </TooltipTrigger>
          </label>
          <TooltipContent side="top">3-5 LLM calls per turn</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

function SliderControl({
  ariaLabel,
  disabled,
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  ariaLabel: string;
  disabled: boolean;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}): ReactElement {
  return (
    <div className="flex items-center gap-2">
      <span>{label}</span>
      <Slider
        aria-label={ariaLabel}
        className="w-24"
        disabled={disabled}
        max={max}
        min={min}
        step={step}
        value={value}
        onValueChange={(next) =>
          onChange(typeof next === "number" ? next : (next[0] ?? value))
        }
      />
      <span className="w-7 text-right font-mono text-[11px] font-semibold text-foreground">
        {value}
      </span>
    </div>
  );
}

function isPromptTemplate(value: unknown): value is PromptTemplate {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.prompt === "string"
  );
}
