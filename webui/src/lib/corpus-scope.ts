import type { AttributeFilter } from "@/lib/api";

const STORAGE_KEY = "ziru.corpusScope";
const CHANGE_EVENT = "ziru-corpus-scope-changed";

export type CorpusScope = AttributeFilter[];

type ScopeListener = (scope: CorpusScope) => void;

function isFilterEntry(value: unknown): value is AttributeFilter {
  if (value === null || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.key !== "string" || entry.key.length === 0) return false;
  if (!Array.isArray(entry.values)) return false;
  return entry.values.every((item) => typeof item === "string");
}

function cleanScope(value: unknown): CorpusScope {
  if (!Array.isArray(value)) return [];
  return value.filter(isFilterEntry).map((entry) => ({
    key: entry.key,
    values: entry.values.filter(Boolean),
  }));
}

export function getCorpusScope(): CorpusScope {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? cleanScope(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function setCorpusScope(scope: CorpusScope): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanScope(scope)));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function clearCorpusScope(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeCorpusScope(listener: ScopeListener): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handleChange = () => listener(getCorpusScope());
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) handleChange();
  };
  window.addEventListener(CHANGE_EVENT, handleChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handleChange);
    window.removeEventListener("storage", handleStorage);
  };
}
