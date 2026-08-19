"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, api, type Grade, type ProfileEntry, type User } from "@/lib/api";
import {
  formatDateTime,
  gradeLabel,
  nextRowId,
  type ProfileRow,
  profileToRows,
  rowsToProfile,
} from "@/lib/format";

const GRADES: Grade[] = ["administrator", "librarian", "user"];

function ProfileRowEditor({
  rows,
  onChange,
}: {
  rows: ProfileRow[];
  onChange: (rows: ProfileRow[]) => void;
}) {
  const updateRow = (index: number, field: keyof ProfileRow, value: string) => {
    const next = rows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, [field]: value } : row
    );
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <Label>Profile</Label>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No profile attributes configured.</p>
      ) : null}
      {rows.map((row, index) => (
        <div key={row.id} className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Key</Label>
            <Input
              value={row.key}
              placeholder="e.g. division"
              onChange={(event) => updateRow(index, "key", event.target.value)}
            />
          </div>
          <div className="flex-[2] space-y-1">
            <Label className="text-xs">Values (comma separated)</Label>
            <Input
              value={row.values}
              placeholder="finance, sales"
              onChange={(event) => updateRow(index, "values", event.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove profile row"
            onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...rows, { id: nextRowId(), key: "", values: "" }])}
      >
        <Plus className="mr-2 h-3.5 w-3.5" />
        Add attribute
      </Button>
    </div>
  );
}

function GradeSelect({ value, onChange }: { value: Grade; onChange: (value: Grade) => void }) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as Grade)}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {GRADES.map((grade) => (
          <SelectItem key={grade} value={grade}>
            {gradeLabel(grade)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [grade, setGrade] = useState<Grade>("user");
  const [rows, setRows] = useState<ProfileRow[]>([{ id: nextRowId(), key: "", values: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setEmail("");
    setPassword("");
    setGrade("user");
    setRows([{ id: nextRowId(), key: "", values: "" }]);
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const profile = rowsToProfile(rows);
      await api.createUser({
        email: email.trim(),
        password,
        grade,
        ...(profile.length > 0 ? { profile } : {}),
      });
      reset();
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>
            New accounts start with must-change-password enabled.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="create-email">Email</Label>
            <Input
              id="create-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-password">Initial password</Label>
            <Input
              id="create-password"
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Grade</Label>
            <GradeSelect value={grade} onChange={setGrade} />
          </div>
          <ProfileRowEditor rows={rows} onChange={setRows} />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({
  user,
  open,
  onOpenChange,
  onUpdated,
}: {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}) {
  const [grade, setGrade] = useState<Grade>("user");
  const [disabled, setDisabled] = useState(false);
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetNotice, setResetNotice] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setGrade(user.grade);
      setDisabled(user.disabled);
      setRows(profileToRows(user.profile));
      setError(null);
      setResetNotice(null);
    }
  }, [user]);

  if (!user) return null;

  const saveChanges = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const profile = rowsToProfile(rows);
      await api.updateUser(user.id, {
        grade,
        disabled,
        profile,
      });
      onOpenChange(false);
      onUpdated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update user");
    } finally {
      setSubmitting(false);
    }
  };

  const resetPassword = async () => {
    setError(null);
    setResetNotice(null);
    try {
      const updated = await api.updateUser(user.id, { reset_password: true });
      setResetNotice(
        updated.temporary_password
          ? `Temporary password: ${updated.temporary_password} (must change at next sign-in)`
          : "Password reset requested"
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reset password");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {user.email}</DialogTitle>
          <DialogDescription>Manage grade, profile, and account state.</DialogDescription>
        </DialogHeader>
        <form onSubmit={saveChanges} className="space-y-4">
          <div className="space-y-2">
            <Label>Grade</Label>
            <GradeSelect value={grade} onChange={setGrade} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Disabled</p>
              <p className="text-xs text-muted-foreground">
                Disabling revokes sessions and rejects API keys immediately.
              </p>
            </div>
            <Switch checked={disabled} onCheckedChange={setDisabled} />
          </div>
          <ProfileRowEditor rows={rows} onChange={setRows} />
          {resetNotice ? (
            <p className="rounded-md border bg-muted p-3 text-sm">{resetNotice}</p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => void resetPassword()}>
              Reset password
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await api.users(1, 100);
      setUsers(response.users);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    void loadRef.current();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Manage accounts, grades, profiles, and password resets via the core API.
        </p>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create user
            </Button>
          </DialogTrigger>
        </Dialog>
      </div>
      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void load()}
      />
      <EditUserDialog
        user={editUser}
        open={editUser !== null}
        onOpenChange={(open) => {
          if (!open) setEditUser(null);
        }}
        onUpdated={() => void load()}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>{users.length} accounts loaded</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <LoadingSpinner />
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Profile</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={user.grade === "administrator" ? "default" : "secondary"}>
                        {gradeLabel(user.grade)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      {user.profile.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="space-x-2">
                          {user.profile.map((entry: ProfileEntry) => (
                            <span key={entry.key} className="whitespace-nowrap text-sm">
                              {entry.key}={entry.values.join(",")}
                            </span>
                          ))}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="space-x-1">
                      {user.disabled ? <Badge variant="destructive">disabled</Badge> : null}
                      {user.must_change_password ? (
                        <Badge variant="outline">must change password</Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(user.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setEditUser(user)}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
