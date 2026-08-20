"use client";

import { useState } from "react";
import { ApiError, api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ChangePasswordDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
};

export function ChangePasswordDialog({
  open,
  onOpenChange,
  onChanged,
}: ChangePasswordDialogProps) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await api.changePassword(oldPassword, newPassword);
      setMessage("Password changed.");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onChanged?.();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Password could not be changed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            Your password must meet the core password policy.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="old-password">Current password</Label>
            <Input
              id="old-password"
              type="password"
              autoComplete="current-password"
              required
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>
          {error ? (
            <p className="text-sm font-medium text-destructive">{error}</p>
          ) : null}
          {message ? (
            <p className="text-sm font-medium text-emerald-600">{message}</p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Change password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
