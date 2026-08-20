"use client";

import { useEffect, useState } from "react";
import { ApiError, api, type ApiKey } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
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

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-lg font-bold text-foreground">Account settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Managed by your administrator.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-1">
            <span className="text-xs font-semibold text-muted-foreground">Email</span>
            <span>{user?.email ?? "—"}</span>
          </div>
          <div className="grid gap-1">
            <span className="text-xs font-semibold text-muted-foreground">Grade</span>
            <span className="flex items-center gap-2">
              {user ? <Badge variant="secondary">{gradeLabel(user.grade)}</Badge> : "—"}
            </span>
          </div>
          <div className="grid gap-1">
            <span className="text-xs font-semibold text-muted-foreground">Profile scope</span>
            <span className="text-muted-foreground">
              {user ? profileSummary(user.profile) : "—"}
            </span>
          </div>
          <div className="grid gap-1">
            <span className="text-xs font-semibold text-muted-foreground">Member since</span>
            <span>{user ? formatDateTime(user.created_at) : "—"}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Self-service password change.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline" onClick={() => setPasswordOpen(true)}>
            Change password
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>
            Your keys are read-only here. Creation and revocation are handled
            by your administrator in the console.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingKeys ? (
            <div className="flex justify-center py-4"><Spinner className="size-4" /></div>
          ) : keysError ? (
            <p className="text-sm text-destructive">{keysError}</p>
          ) : apiKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No API keys on this account.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {apiKeys.map((key) => (
                <li key={key.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{key.name}</p>
                    {key.api_key ? (
                      <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{key.api_key}</p>
                    ) : null}
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Created {formatDateTime(key.created_at)} · Expires {formatDateTime(key.expires_at)}
                    </p>
                  </div>
                  <Badge variant={key.is_active ? "secondary" : "outline"} className="text-[10px]">
                    {key.is_active ? "Active" : "Inactive"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ChangePasswordDialog
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
      />
    </div>
  );
}
