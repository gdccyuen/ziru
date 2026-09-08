"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { ApiError, api, type AttributeEntry, type JobItem } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Spinner } from "@/components/ui/spinner";

/** Matches the backend MAX_CONCURRENT_JOBS global cap. */
const MAX_BATCH = 10;

const ACCEPT =
  ".pdf,.docx,.doc,.xlsx,.xls,.pptx,.csv,.jpg,.jpeg,.png,.md,.txt,.json";

function statusBadge(status: string): string {
  if (status === "failed") return "text-bg-danger";
  if (status === "done") return "text-bg-success";
  if (status === "running") return "text-bg-primary";
  return "text-bg-secondary";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export default function JobsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [jobs, setJobs] = useState<JobItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  // Upload dialog
  const [uploadOpen, setUploadOpen] = useState(false);
  const [attributes, setAttributes] = useState<AttributeEntry[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [attrSelected, setAttrSelected] = useState<Record<string, string[]>>({});
  const [attrFreeText, setAttrFreeText] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [overLimit, setOverLimit] = useState(false);

  const loadJobs = useCallback(async () => {
    setError(null);
    try {
      const r = await api.jobs({ page_size: 50 });
      setJobs(r.jobs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load jobs");
    }
  }, []);

  useEffect(() => {
    if (user && user.grade !== "administrator" && user.grade !== "librarian") {
      router.replace("/chat");
      return;
    }
    if (!user) return;
    void (async () => {
      await loadJobs();
      try {
        const entries = await api.attributes();
        setAttributes(entries);
        const initial: Record<string, string[]> = {};
        for (const entry of entries) initial[entry.key] = [];
        setAttrSelected(initial);
      } catch {
        // attributes are optional for the upload dialog
      }
    })();
  }, [user, router, loadJobs]);

  if (user && user.grade !== "administrator" && user.grade !== "librarian") return null;

  function openUpload() {
    setUploadMsg(null);
    setSelectedFiles([]);
    setOverLimit(false);
    setUploadOpen(true);
  }

  function toggleAttr(key: string, value: string) {
    setAttrSelected((cur) => {
      const current = cur[key] ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...cur, [key]: next };
    });
  }

  function buildAttributes(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const a of attributes) {
      if (a.allowedValues) {
        const vals = (attrSelected[a.key] ?? []).slice();
        if (vals.length) out[a.key] = vals;
      } else {
        const vals = [...new Set((attrFreeText[a.key] ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean))];
        if (vals.length) out[a.key] = vals;
      }
    }
    return out;
  }

  async function handleUpload() {
    if (selectedFiles.length === 0 || uploading) return;
    const files = selectedFiles.slice(0, MAX_BATCH);
    const attributesPayload = buildAttributes();
    setUploading(true);
    setUploadMsg(null);
    let ok = 0;
    let fail = 0;
    let capacityHit = false;

    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("attributes", JSON.stringify(attributesPayload));
      try {
        await api.uploadDocument(formData);
        ok += 1;
      } catch (err) {
        if (err instanceof ApiError && err.status === 429) {
          capacityHit = true;
          break;
        }
        fail += 1;
      }
    }

    setUploading(false);
    setUploadOpen(false);
    setSelectedFiles([]);
    await loadJobs();
    const parts: string[] = [];
    if (ok) parts.push(`${ok} uploaded`);
    if (fail) parts.push(`${fail} failed`);
    if (capacityHit) parts.push("stopped (concurrent job limit reached)");
    setUploadMsg(parts.length ? `${parts.join(", ")}.` : "Nothing uploaded.");
  }

  const selectedCount = selectedFiles.length;

  return (
    <section className="mb-4">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <div>
          <h1 className="fs-4 fw-bold">Jobs</h1>
          <p className="text-secondary mb-0">
            Processing jobs for intake and re-parsing (administrator + librarian).
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={openUpload}
          disabled={uploading}
        >
          {uploading ? (
            <span className="spinner-border spinner-border-sm me-2" role="status" />
          ) : (
            <Upload style={{ width: "1em", height: "1em" }} className="me-2" />
          )}
          Upload files
        </button>
      </div>

      {uploadMsg ? <div className="alert alert-info py-2">{uploadMsg}</div> : null}
      {error ? <div className="alert alert-danger py-2">{error}</div> : null}

      {jobs === null ? (
        <div className="text-center py-5">
          <Spinner className="size-6" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-5 text-secondary">No jobs yet.</div>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm table-striped align-middle">
            <thead>
              <tr>
                <th>File</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.job_id}>
                  <td className="fw-medium">
                    {j.file_name ?? j.document_id ?? j.job_id}
                  </td>
                  <td>
                    <span className={`badge ${statusBadge(j.status)}`}>{j.status}</span>
                  </td>
                  <td className="text-secondary">
                    {j.duration_seconds != null
                      ? `${Math.round(j.duration_seconds)}s`
                      : "—"}
                  </td>
                  <td className="text-secondary">{formatDate(j.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {uploadOpen ? (
        <div className="modal fade show d-block" role="dialog" aria-modal="true" aria-label="Upload files">
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header d-flex justify-content-between align-items-center">
                <h5 className="modal-title fs-6">Upload files</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setUploadOpen(false)}
                  aria-label="Close"
                />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload style={{ width: "1em", height: "1em" }} className="me-2" />
                    Choose files
                  </button>
                  <span className="small text-secondary ms-2">
                    up to {MAX_BATCH} files per submission
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ACCEPT}
                    className="d-none"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      e.target.value = "";
                      setOverLimit(files.length > MAX_BATCH);
                      setSelectedFiles(files.slice(0, MAX_BATCH));
                    }}
                  />
                  {selectedCount > 0 ? (
                    <ul className="list-group mt-2">
                      {selectedFiles.map((f, i) => (
                        <li key={f.name + i} className="list-group-item small py-1">
                          {f.name}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="small text-secondary mt-2">No files selected.</div>
                  )}
                  {overLimit ? (
                    <div className="small text-warning mt-2">
                      Only {MAX_BATCH} files can be submitted at once — extra files were ignored.
                    </div>
                  ) : null}
                </div>

                <hr />

                <div className="fw-semibold mb-2">Attributes (optional)</div>
                {attributes.length === 0 ? (
                  <div className="small text-secondary">No attributes configured.</div>
                ) : (
                  <div className="d-flex flex-column gap-2">
                    {attributes.map((attr) => (
                      <div key={attr.key}>
                        <span className="small fw-semibold me-2">{attr.key}</span>
                        {attr.allowedValues ? (
                          <span className="d-flex flex-wrap gap-1 align-items-center">
                            {attr.allowedValues.map((v) => {
                              const active = (attrSelected[attr.key] ?? []).includes(v);
                              return (
                                <button
                                  key={v}
                                  type="button"
                                  className={`btn btn-sm ${active ? "btn-primary" : "btn-outline-secondary"}`}
                                  onClick={() => toggleAttr(attr.key, v)}
                                >
                                  {v}
                                </button>
                              );
                            })}
                          </span>
                        ) : (
                          <input
                            className="form-control form-control-sm d-inline-block"
                            style={{ maxWidth: "16rem" }}
                            placeholder="values (comma-separated)"
                            value={attrFreeText[attr.key] ?? ""}
                            onChange={(e) =>
                              setAttrFreeText((cur) => ({ ...cur, [attr.key]: e.target.value }))
                            }
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setUploadOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleUpload}
                  disabled={selectedCount === 0 || uploading}
                >
                  {uploading ? (
                    <span className="spinner-border spinner-border-sm me-2" role="status" />
                  ) : null}
                  Upload {selectedCount || ""} file{selectedCount === 1 ? "" : "s"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
