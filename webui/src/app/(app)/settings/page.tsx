"use client";

import { useEffect, useState } from "react";
import { ApiError, api, type ApiKey } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { formatDateTime, gradeLabel, profileSummary } from "@/lib/format";

export default function SettingsPage() {
  const { user } = useAuth();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const response = await api.apiKeys();
        setApiKeys(response.api_keys);
      } catch (err) {
        setKeysError(
          err instanceof ApiError ? err.message : "Failed to load API keys.",
        );
      } finally {
        setLoadingKeys(false);
      }
    })();
  }, []);

  const field = (label: string, value: React.ReactNode) => (
    <div className="mb-2">
      <span className="d-block small fw-semibold text-secondary">{label}</span>
      <span className="d-block">{value}</span>
    </div>
  );

  return (
    <div className="mx-auto mb-4" style={{ maxWidth: "48rem" }}>
      <h1 className="fs-4 fw-bold mb-3">Account settings</h1>

      <div className="card mb-3">
        <div className="card-body">
          <h2 className="card-title fs-5">Profile</h2>
          <p className="card-subtitle text-secondary small">Managed by your administrator.</p>
          {field("Email", user?.email ?? "—")}
          {field(
            "Grade",
            user ? (
              <span className="badge text-bg-secondary">{gradeLabel(user.grade)}</span>
            ) : (
              "—"
            ),
          )}
          {field("Profile scope", user ? profileSummary(user.profile) : "—")}
          {field("Member since", user ? formatDateTime(user.created_at) : "—")}
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-body">
          <h2 className="card-title fs-5">Password</h2>
          <p className="card-subtitle text-secondary small">Self-service password change.</p>
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => setPasswordOpen(true)}
          >
            Change password
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <h2 className="card-title fs-5">API keys</h2>
          <p className="card-subtitle text-secondary small">
            Your keys are read-only here. Creation and revocation are handled by your
            administrator in the console.
          </p>
          {loadingKeys ? (
            <div className="text-center py-3">
              <span className="spinner-border spinner-border-sm" role="status" />
            </div>
          ) : keysError ? (
            <p className="small text-danger">{keysError}</p>
          ) : apiKeys.length === 0 ? (
            <p className="small text-secondary">No API keys on this account.</p>
          ) : (
            <ul className="list-group list-group-flush">
              {apiKeys.map((key) => (
                <li key={key.id} className="list-group-item d-flex align-items-center justify-content-between gap-3">
                  <div className="min-w-0">
                    <p className="mb-0 fw-semibold text-truncate">{key.name}</p>
                    {key.api_key ? (
                      <p className="mb-0 small text-secondary text-truncate font-monospace">
                        {key.api_key}
                      </p>
                    ) : null}
                    <p className="mb-0 small text-secondary">
                      Created {formatDateTime(key.created_at)} · Expires{" "}
                      {formatDateTime(key.expires_at)}
                    </p>
                  </div>
                  <span className={`badge ${key.is_active ? "text-bg-secondary" : "text-bg-light border"}`}>
                    {key.is_active ? "Active" : "Inactive"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </div>
  );
}
