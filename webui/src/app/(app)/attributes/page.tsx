"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { ApiError, api, type AttributeEntry, type DocumentItem } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Spinner } from "@/components/ui/spinner";

export default function AttributesPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [attrs, setAttrs] = useState<AttributeEntry[] | null>(null);
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [newKey, setNewKey] = useState("");
  const [newValues, setNewValues] = useState("");
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState<Record<string, string[]>>({});
  const [editInput, setEditInput] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const [a, d] = await Promise.all([
        api.attributes(),
        api.documents({ page_size: 200 }),
      ]);
      setAttrs(a);
      setDocs(d.documents);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load attributes");
    }
  }, []);

  useEffect(() => {
    if (user && user.grade !== "administrator") {
      router.replace("/chat");
      return;
    }
    if (!user) return;
    void load();
  }, [user, router, load]);

  const usedValues = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const d of docs) {
      for (const [key, vals] of Object.entries(d.attributes ?? {})) {
        const set = (map[key] = map[key] ?? new Set<string>());
        for (const v of vals) if (v) set.add(v);
      }
    }
    return map;
  }, [docs]);

  if (user && user.grade !== "administrator") return null;

  function clearMsgs() {
    setError(null);
    setInfo(null);
  }

  function parseValues(raw: string): string[] {
    return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
  }

  async function handleAddAttribute() {
    clearMsgs();
    const key = newKey.trim();
    if (!key) {
      setError("Attribute key is required.");
      return;
    }
    if (attrs?.some((a) => a.key.toLowerCase() === key.toLowerCase())) {
      setError(`Attribute "${key}" already exists.`);
      return;
    }
    const values = parseValues(newValues);
    setBusy(true);
    try {
      await api.createAttribute(key, values);
      setInfo(`Attribute "${key}" added.`);
      setNewKey("");
      setNewValues("");
      await load();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Failed to add attribute.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(attr: AttributeEntry) {
    setEditing((cur) => ({ ...cur, [attr.key]: attr.allowedValues ?? [] }));
    setEditInput((cur) => ({ ...cur, [attr.key]: "" }));
  }

  function cancelEdit(key: string) {
    setEditing((cur) => {
      const next = { ...cur };
      delete next[key];
      return next;
    });
    setEditInput((cur) => {
      const next = { ...cur };
      delete next[key];
      return next;
    });
  }

  function addDraftValue(key: string) {
    const draft = editing[key] ?? [];
    const raw = (editInput[key] ?? "").trim();
    if (!raw) return;
    if (draft.some((v) => v.toLowerCase() === raw.toLowerCase())) {
      setError(`Value "${raw}" already exists for "${key}".`);
      return;
    }
    setEditing((cur) => ({ ...cur, [key]: [...draft, raw] }));
    setEditInput((cur) => ({ ...cur, [key]: "" }));
  }

  function removeDraftValue(key: string, value: string) {
    const inUse = usedValues[key]?.has(value);
    if (inUse) {
      setError(`Cannot remove "${value}" from "${key}": in use by documents.`);
      return;
    }
    setEditing((cur) => ({ ...cur, [key]: (cur[key] ?? []).filter((v) => v !== value) }));
  }

  async function saveEdit(key: string) {
    clearMsgs();
    if (editing[key]?.length === 0) {
      // allow clearing to "free-form" (null) — but only if no values are in use.
      // For safety, only allow when the key has no used values at all.
      if ((usedValues[key]?.size ?? 0) > 0) {
        setError(`Cannot clear all values for "${key}": in use by documents.`);
        return;
      }
    }
    const allowedValues = editing[key] ?? [];
    setBusy(true);
    try {
      await api.updateAttribute(key, allowedValues);
      setInfo(`Attribute "${key}" updated.`);
      cancelEdit(key);
      await load();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Failed to update attribute.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(key: string) {
    clearMsgs();
    const attr = attrs?.find((a) => a.key === key);
    if (attr && (attr.usage ?? 0) > 0) {
      setError(`Cannot delete "${key}": in use by ${attr.usage ?? 0} document(s).`);
      return;
    }
    if (!window.confirm(`Delete attribute "${key}"?`)) return;
    setBusy(true);
    try {
      await api.deleteAttribute(key);
      setInfo(`Attribute "${key}" deleted.`);
      cancelEdit(key);
      await load();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Failed to delete attribute.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-4">
      <h1 className="fs-4 fw-bold">Attributes</h1>
      <p className="text-secondary">
        Manage the attribute dictionary and allowed values (administrator only).
      </p>

      {info ? <div className="alert alert-success py-2">{info}</div> : null}
      {error ? <div className="alert alert-danger py-2">{error}</div> : null}

      <div className="card mb-3">
        <div className="card-body">
          <div className="fw-semibold mb-2">Add attribute</div>
          <div className="row g-2 align-items-end">
            <div className="col-md-3">
              <label className="form-label small">Key</label>
              <input
                className="form-control form-control-sm"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="e.g. branch"
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small">Allowed values (comma-separated, optional)</label>
              <input
                className="form-control form-control-sm"
                value={newValues}
                onChange={(e) => setNewValues(e.target.value)}
                placeholder="e.g. hq, regional, division"
              />
            </div>
            <div className="col-md-3">
              <button
                type="button"
                className="btn btn-sm btn-primary w-100"
                onClick={handleAddAttribute}
                disabled={busy}
              >
                <Plus style={{ width: "1em", height: "1em" }} className="me-1" />
                Add
              </button>
            </div>
          </div>
        </div>
      </div>

      {attrs === null ? (
        <div className="text-center py-5">
          <Spinner className="size-6" />
        </div>
      ) : attrs.length === 0 ? (
        <div className="text-center py-5 text-secondary">No attributes configured.</div>
      ) : (
        <div className="row g-3">
          {attrs.map((attr) => {
            const isEditing = attr.key in editing;
            const values = isEditing ? editing[attr.key] : (attr.allowedValues ?? []);
            const inUseCount = attr.usage ?? usedValues[attr.key]?.size ?? 0;
            return (
              <div className="col-md-6" key={attr.key}>
                <div className="card h-100">
                  <div className="card-body">
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        <div className="fw-semibold">{attr.key}</div>
                        <div className="small text-secondary">in use by {inUseCount} document(s)</div>
                      </div>
                      <div className="d-flex gap-1">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={() => saveEdit(attr.key)}
                              disabled={busy}
                              aria-label={`Save ${attr.key}`}
                            >
                              <Save style={{ width: "1em", height: "1em" }} className="me-1" />
                              Save
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => cancelEdit(attr.key)}
                              aria-label={`Cancel ${attr.key}`}
                            >
                              <X style={{ width: "1em", height: "1em" }} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => startEdit(attr)}
                              aria-label={`Edit ${attr.key}`}
                            >
                              <Pencil style={{ width: "1em", height: "1em" }} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => handleDelete(attr.key)}
                              disabled={busy || inUseCount > 0}
                              title={inUseCount > 0 ? "In use — cannot delete" : undefined}
                              aria-label={`Delete ${attr.key}`}
                            >
                              <Trash2 style={{ width: "1em", height: "1em" }} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="d-flex flex-wrap gap-1 mt-2">
                      {values.length === 0 ? (
                        <span className="small text-secondary">No allowed values (free-form).</span>
                      ) : (
                        values.map((v) => {
                          const inUse = usedValues[attr.key]?.has(v);
                          return (
                            <span
                              key={v}
                              className="badge text-bg-secondary d-inline-flex align-items-center gap-1"
                            >
                              {v}
                              {isEditing && (
                                <button
                                  type="button"
                                  className="btn-close btn-close-sm text-reset"
                                  style={{ fontSize: "0.6rem" }}
                                  disabled={inUse}
                                  title={inUse ? "In use — cannot remove" : undefined}
                                  aria-label={`Remove ${v} from ${attr.key}`}
                                  onClick={() => removeDraftValue(attr.key, v)}
                                />
                              )}
                            </span>
                          );
                        })
                      )}
                    </div>

                    {isEditing ? (
                      <div className="input-group input-group-sm mt-2">
                        <input
                          className="form-control"
                          value={editInput[attr.key] ?? ""}
                          onChange={(e) =>
                            setEditInput((cur) => ({ ...cur, [attr.key]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addDraftValue(attr.key);
                            }
                          }}
                          placeholder="Add a value"
                        />
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={() => addDraftValue(attr.key)}
                          aria-label={`Add value to ${attr.key}`}
                        >
                          Add
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
