"use client";

import { Copy, Plus, Trash2 } from "lucide-react";
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
import {
  ApiError,
  type AttributeEntry,
  api,
  type Grade,
  type ProfileEntry,
  type User,
} from "@/lib/api";
import {
  formatDateTime,
  gradeLabel,
  nextRowId,
  type ProfileRow,
  profileToRows,
  rowsToProfile,
  truncate,
} from "@/lib/format";

const GRADES: Grade[] = ["administrator", "librarian", "user"];

function splitValues(values: string): string[] {
  return values
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function toggleValue(values: string, value: string): string {
  const list = splitValues(values);
  const next = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  return next.join(", ");
}

function ProfileRowEditor({
  rows,
  onChange,
  dictionary,
}: {
  rows: ProfileRow[];
  onChange: (rows: ProfileRow[]) => void;
  dictionary: AttributeEntry[];
}) {
  const updateRow = (index: number, patch: Partial<ProfileRow>) => {
    const next = rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row));
    onChange(next);
  };

  const dictionaryEmpty = dictionary.length === 0;
  const byKey = new Map(dictionary.map((entry) => [entry.key, entry]));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Profile attributes</Label>
        {dictionaryEmpty ? (
          <p className="text-xs text-muted-foreground">
            define attributes first in the Attribute Dictionary
          </p>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No profile attributes configured.</p>
      ) : null}
      {rows.map((row, index) => {
        const entry = row.key.trim() ? byKey.get(row.key.trim()) : undefined;
        const unknownKey = row.key.trim().length > 0 && entry === undefined;
        const allowedValues = entry?.allowedValues ?? null;
        return (
          <div key={row.id} className="space-y-2 rounded-md border p-3">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Attribute</Label>
                <Select
                  value={row.key}
                  onValueChange={(key) => updateRow(index, { key, values: "" })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select an attribute" />
                  </SelectTrigger>
                  <SelectContent>
                    {dictionary.map((entryItem) => (
                      <SelectItem key={entryItem.key} value={entryItem.key}>
                        {entryItem.key}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove attribute row"
                onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {unknownKey ? (
              <p className="text-sm text-destructive">
                Attribute &quot;{row.key.trim()}&quot; is not in the dictionary — add it there first
                or pick an existing attribute.
              </p>
            ) : allowedValues !== null && allowedValues.length > 0 ? (
              <div className="space-y-1">
                <Label className="text-xs">Values</Label>
                <div className="flex flex-wrap gap-1.5">
                  {allowedValues.map((value) => {
                    const selected = splitValues(row.values).includes(value);
                    return (
                      <Button
                        key={value}
                        type="button"
                        variant={selected ? "default" : "outline"}
                        size="sm"
                        onClick={() => updateRow(index, { values: toggleValue(row.values, value) })}
                      >
                        {value}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <Label className="text-xs">
                  Values (comma separated)
                  {entry === undefined ? " — dictionary value list is empty" : ""}
                </Label>
                <Input
                  value={row.values}
                  placeholder="finance, sales"
                  onChange={(event) => updateRow(index, { values: event.target.value })}
                />
              </div>
            )}
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={dictionaryEmpty}
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

function validateProfileRows(
  rows: ProfileRow[],
  dictionary: AttributeEntry[]
): { profile: ProfileEntry[]; error: string | null } {
  const profile = rowsToProfile(rows);
  const byKey = new Map(dictionary.map((entry) => [entry.key, entry]));
  for (const entry of profile) {
    const dictEntry = byKey.get(entry.key);
    if (!dictEntry) {
      return { profile, error: `Attribute "${entry.key}" is not in the dictionary` };
    }
    const allowedValues = dictEntry.allowedValues ?? [];
    if (allowedValues.length > 0) {
      const invalid = entry.values.filter((value) => !allowedValues.includes(value));
      if (invalid.length > 0) {
        return {
          profile,
          error: `Attribute "${entry.key}" has invalid value(s): ${invalid.join(", ")}`,
        };
      }
    }
  }
  return { profile, error: null };
}

function CreateUserDialog({
  open,
  onOpenChange,
  onCreated,
  dictionary,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  dictionary: AttributeEntry[];
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ssoProvider, setSsoProvider] = useState("");
  const [ssoSubject, setSsoSubject] = useState("");
  const [grade, setGrade] = useState<Grade>("user");
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const ssoProvided = ssoProvider.trim().length > 0 && ssoSubject.trim().length > 0;

  const reset = () => {
    setEmail("");
    setPassword("");
    setSsoProvider("");
    setSsoSubject("");
    setGrade("user");
    setRows([]);
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const { profile, error: profileError } = validateProfileRows(rows, dictionary);
    if (profileError) {
      setError(profileError);
      return;
    }
    setSubmitting(true);
    try {
      await api.createUser({
        email: email.trim() || null,
        password: password || null,
        grade,
        ...(profile.length > 0 ? { profile } : {}),
        ...(ssoProvided
          ? { sso: { provider: ssoProvider.trim(), subject: ssoSubject.trim() } }
          : {}),
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
            New accounts start with must-change-password enabled. Email is required unless an SSO
            provider and subject are provided.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="create-email">
              Email{" "}
              {!ssoProvided ? <span className="text-destructive">*</span> : "(optional with SSO)"}
            </Label>
            <Input
              id="create-email"
              type="email"
              required={!ssoProvided}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="create-sso-provider">SSO provider (optional)</Label>
              <Input
                id="create-sso-provider"
                placeholder="oidc"
                value={ssoProvider}
                onChange={(event) => setSsoProvider(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-sso-subject">SSO subject (optional)</Label>
              <Input
                id="create-sso-subject"
                placeholder="sub-1234"
                value={ssoSubject}
                onChange={(event) => setSsoSubject(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-password">
              Initial password{" "}
              {!ssoProvided ? (
                <span className="text-destructive">*</span>
              ) : (
                "(optional for SSO-only)"
              )}
            </Label>
            <Input
              id="create-password"
              type="password"
              required={!ssoProvided}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Grade</Label>
            <GradeSelect value={grade} onChange={setGrade} />
          </div>
          <ProfileRowEditor rows={rows} onChange={setRows} dictionary={dictionary} />
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

function UserIdCell({ id }: { id: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <code className="min-w-0 flex-1 truncate font-mono text-xs" title={id}>
        {id}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-6"
        aria-label="Copy user ID"
        onClick={() => void navigator.clipboard?.writeText(id)}
      >
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );
}

function EditUserDialog({
  user,
  open,
  onOpenChange,
  onUpdated,
  dictionary,
}: {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
  dictionary: AttributeEntry[];
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
    const { profile, error: profileError } = validateProfileRows(rows, dictionary);
    if (profileError) {
      setError(profileError);
      return;
    }
    setSubmitting(true);
    try {
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
          <DialogTitle>Edit user {truncate(user.id, 24)}</DialogTitle>
          <DialogDescription>
            {user.email ? `Email: ${user.email} — ` : "SSO-only account — "}manage grade, profile
            attributes, and account state.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={saveChanges} className="space-y-4">
          <div className="space-y-1 rounded-md border bg-muted/40 p-3">
            <Label className="text-xs">User ID</Label>
            <div className="flex items-center gap-1.5">
              <code className="min-w-0 flex-1 break-all font-mono text-xs">{user.id}</code>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-7"
                aria-label="Copy user ID"
                onClick={() => void navigator.clipboard?.writeText(user.id)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
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
          <ProfileRowEditor rows={rows} onChange={setRows} dictionary={dictionary} />
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
  const [dictionary, setDictionary] = useState<AttributeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [response, attributes] = await Promise.all([api.users(1, 100), api.attributes()]);
      setUsers(response.users);
      setDictionary(attributes);
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
          Manage accounts, grades, profile attributes, and password resets via the core API.
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
        dictionary={dictionary}
      />
      <EditUserDialog
        user={editUser}
        open={editUser !== null}
        onOpenChange={(open) => {
          if (!open) setEditUser(null);
        }}
        onUpdated={() => void load()}
        dictionary={dictionary}
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
            <div className="overflow-x-auto">
              <Table className="min-w-[880px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[280px]">User ID</TableHead>
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
                      <TableCell className="font-medium">
                        <UserIdCell id={user.id} />
                      </TableCell>
                      <TableCell className="text-sm">{user.email ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={user.grade === "administrator" ? "default" : "secondary"}>
                          {gradeLabel(user.grade)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[260px]">
                        {user.profile.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="line-clamp-2 block space-x-2">
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
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
