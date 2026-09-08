"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  type ApiKey,
  type User,
  type WebhookLog,
  type WebhookSecret,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime } from "@/lib/format";

function gradeBadge(grade: string): string {
  if (grade === "administrator") return "text-bg-primary";
  if (grade === "librarian") return "text-bg-info";
  return "text-bg-secondary";
}

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<User[] | null>(null);
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [secrets, setSecrets] = useState<WebhookSecret[] | null>(null);
  const [logs, setLogs] = useState<WebhookLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null);

  async function handleBackfill() {
    setBackfilling(true);
    setBackfillMessage(null);
    try {
      const res = await api.backfillParseQuality();
      setBackfillMessage(
        `Backfilled ${res.updated} document(s) (scanned ${res.scanned}, skipped ${res.skipped}).`,
      );
    } catch (e) {
      setBackfillMessage(
        e instanceof Error ? e.message : "Failed to backfill parse quality.",
      );
    } finally {
      setBackfilling(false);
    }
  }

  useEffect(() => {
    if (user && user.grade !== "administrator") {
      router.replace("/chat");
      return;
    }
    if (!user) return;
    void (async () => {
      try {
        const [usersRes, keysRes, secretsRes, logsRes] = await Promise.all([
          api.users({ page_size: 100 }),
          api.apiKeys(),
          api.webhookSecrets(),
          api.webhookLogs({ page_size: 50 }),
        ]);
        setUsers(usersRes.users);
        setKeys(keysRes.api_keys);
        setSecrets(secretsRes.secrets);
        setLogs(logsRes.logs);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load admin data");
      }
    })();
  }, [user, router]);

  if (user && user.grade !== "administrator") return null;

  return (
    <section className="mb-4">
      <h1 className="fs-4 fw-bold">Admin</h1>
      <p className="text-secondary">User admin, API keys, and webhooks (administrator only).</p>

      {error ? <div className="alert alert-danger py-2">{error}</div> : null}

      {/* Parse quality maintenance */}
      <Section title="Parse quality">
        <p className="text-secondary small mb-2">
          Compute an honest outline-sanity badge for <em>already-ingested</em>{" "}
          documents from their published section trees (no re-parsing). Re-parsing a
          document later refreshes its badge automatically.
        </p>
        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={backfilling}
            onClick={handleBackfill}
          >
            {backfilling ? "Backfilling…" : "Backfill parse quality"}
          </button>
        </div>
        {backfillMessage ? (
          <p className="mb-0 mt-2 small text-secondary">{backfillMessage}</p>
        ) : null}
      </Section>

      {/* User admin */}
      <Section title="User admin">
        {users === null ? (
          <CenterSpinner />
        ) : (
          <div className="table-responsive">
            <table className="table table-sm table-striped align-middle mb-0">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Grade</th>
                  <th>Profile</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="fw-medium">{u.email}</td>
                    <td>
                      <span className={`badge ${gradeBadge(u.grade)}`}>{u.grade}</span>
                    </td>
                    <td className="text-secondary">
                      {u.profile.length === 0
                        ? "—"
                        : u.profile.map((p) => `${p.key}: ${p.values.join(", ")}`).join(" · ")}
                    </td>
                    <td>
                      {u.disabled ? (
                        <span className="badge text-bg-danger">Disabled</span>
                      ) : (
                        <span className="badge text-bg-success">Active</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* API keys */}
      <Section title="API keys">
        {keys === null ? (
          <CenterSpinner />
        ) : keys.length === 0 ? (
          <p className="text-secondary small mb-0">No API keys.</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm table-striped align-middle mb-0">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Key</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td className="fw-medium">{k.name}</td>
                    <td className="font-monospace small text-secondary">
                      {k.api_key ? k.api_key : "—"}
                    </td>
                    <td>
                      <span className={`badge ${k.is_active ? "text-bg-success" : "text-bg-secondary"}`}>
                        {k.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="text-secondary">{formatDateTime(k.created_at)}</td>
                    <td className="text-secondary">{formatDateTime(k.expires_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Webhooks */}
      <Section title="Webhooks">
        {secrets === null || logs === null ? (
          <CenterSpinner />
        ) : (
          <>
            {secrets.length === 0 ? (
              <p className="text-secondary small">No webhook secrets.</p>
            ) : (
              <div className="table-responsive mb-3">
                <table className="table table-sm table-striped align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Endpoint</th>
                      <th>Status</th>
                      <th>Secret (masked)</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {secrets.map((s) => (
                      <tr key={s.id}>
                        <td className="fw-medium">{s.endpoint ?? "—"}</td>
                        <td>
                          <span className="badge text-bg-secondary">{s.status}</span>
                        </td>
                        <td className="font-monospace small text-secondary">{s.secret_masked}</td>
                        <td className="text-secondary">{formatDateTime(s.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="fw-semibold small text-secondary mb-1">Logs</p>
            {logs.length === 0 ? (
              <p className="text-secondary small mb-0">No webhook deliveries.</p>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm table-striped align-middle mb-0">
                  <thead>
                    <tr>
                      <th>URL</th>
                      <th>Status</th>
                      <th>Attempt</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((l) => (
                      <tr key={l.id}>
                        <td className="fw-medium text-truncate" style={{ maxWidth: "20rem" }}>
                          {l.webhook_url ?? "—"}
                        </td>
                        <td>
                          <span className={`badge ${l.response_status_code != null && l.response_status_code < 400 ? "text-bg-success" : "text-bg-secondary"}`}>
                            {l.response_status_code ?? "—"}
                          </span>
                        </td>
                        <td className="text-secondary">{l.attempt_number ?? "—"}</td>
                        <td className="text-secondary">{formatDateTime(l.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Section>
    </section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card mb-3">
      <div className="card-header fw-semibold">{title}</div>
      <div className="card-body">{children}</div>
    </div>
  );
}

function CenterSpinner() {
  return (
    <div className="text-center py-4">
      <Spinner className="size-5" />
    </div>
  );
}
