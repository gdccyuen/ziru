"use client";

import { useEffect, useState, type ReactElement } from "react";
import { FileText, WandSparkles } from "lucide-react";

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
          Array.isArray(data) ? data.filter(isPromptTemplate) : [],
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
      className={`d-flex flex-wrap align-items-center gap-3 small ${className ?? ""}`}
    >
      <div className="dropdown">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          data-bs-toggle="dropdown"
          disabled={disabled}
          aria-label="Prompt templates"
          title="Prompt templates"
        >
          <WandSparkles style={{ width: "1em", height: "1em" }} />
        </button>
        <ul className="dropdown-menu" style={{ minWidth: "16rem" }}>
          {loadingTemplates ? (
            <li>
              <span className="dropdown-item-text">
                <span className="spinner-border spinner-border-sm me-2" role="status" />
                Loading templates
              </span>
            </li>
          ) : templates.length === 0 ? (
            <li>
              <span className="dropdown-item-text text-secondary">
                No templates
              </span>
            </li>
          ) : (
            templates.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => onSelectPrompt?.(template.prompt)}
                >
                  <FileText style={{ width: "1em", height: "1em" }} className="me-2" />
                  {template.title}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="form-check form-switch d-inline-flex align-items-center gap-2 mb-0">
        <input
          className="form-check-input"
          type="checkbox"
          role="switch"
          id="rrf-rerank"
          checked={value.rerank}
          disabled={disabled}
          onChange={(event) => update({ rerank: event.target.checked })}
        />
        <label className="form-check-label small" htmlFor="rrf-rerank">
          Rerank
        </label>
      </div>

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

      <div
        className="form-check form-switch d-inline-flex align-items-center gap-2 mb-0"
        title="3-5 LLM calls per turn"
      >
        <input
          className="form-check-input"
          type="checkbox"
          role="switch"
          id="rrf-agentic"
          checked={value.use_agentic}
          disabled={disabled}
          onChange={(event) => update({ use_agentic: event.target.checked })}
        />
        <label className="form-check-label small" htmlFor="rrf-agentic">
          Agentic
        </label>
      </div>
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
    <div className="d-flex align-items-center gap-2">
      <span className="small">{label}</span>
      <input
        type="range"
        className="form-range"
        style={{ width: "6rem" }}
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="small fw-semibold" style={{ minWidth: "2rem", textAlign: "right" }}>
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
