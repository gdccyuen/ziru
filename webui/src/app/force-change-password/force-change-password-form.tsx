"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api";

export function ForceChangePasswordForm() {
  const router = useRouter();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await api.changePassword(oldPassword, newPassword);
      router.replace("/");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Password could not be changed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Set a new password</CardTitle>
        <CardDescription>
          Your account requires a password change before you can continue.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="force-old-password">Current password</Label>
            <Input
              id="force-old-password"
              type="password"
              autoComplete="current-password"
              required
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="force-new-password">New password</Label>
            <Input
              id="force-new-password"
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="force-confirm-password">Confirm new password</Label>
            <Input
              id="force-confirm-password"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Saving…" : "Change password and continue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
