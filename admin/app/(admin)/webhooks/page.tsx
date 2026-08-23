"use client";

import { Copy, Plus, Trash2, Webhook } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, api, type WebhookLog, type WebhookSecret } from "@/lib/api";
import { formatDateTime, truncate } from "@/lib/format";

function LogsPanel() {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await api.webhookLogs({ page: 1, page_size: 20 });
      setLogs(response.logs);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load webhook logs");
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
    <div className="space-y-3">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Card>
        <CardHeader>
          <CardTitle>Delivery logs</CardTitle>
          <CardDescription>Webhook delivery attempts for your jobs</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <LoadingSpinner />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No delivery logs yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs">
                      {log.job_id ? truncate(log.job_id) : "—"}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-sm">
                      {log.webhook_url ?? "—"}
                    </TableCell>
                    <TableCell>
                      {log.response_status_code ? (
                        <Badge
                          variant={log.response_status_code >= 400 ? "destructive" : "default"}
                        >
                          {log.response_status_code}
                        </Badge>
                      ) : log.error_message ? (
                        <Badge variant="destructive">error</Badge>
                      ) : (
                        <Badge variant="outline">sent</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.duration_ms === null ? "—" : `${log.duration_ms}ms`}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(log.created_at)}
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

function SecretsPanel() {
  const [secrets, setSecrets] = useState<WebhookSecret[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [endpoint, setEndpoint] = useState("");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<WebhookSecret | null>(null);
  const [revoking, setRevoking] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await api.webhookSecrets();
      setSecrets(response.secrets);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load webhook secrets");
    } finally {
      setLoading(false);
    }
  };

  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    void loadRef.current();
  }, []);

  const createSecret = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      const created = await api.createWebhookSecret(endpoint.trim() || null);
      setCreatedSecret(created.secret ?? created.secret_masked);
      setEndpoint("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create webhook secret");
    }
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await api.revokeWebhookSecret(revokeTarget.id);
      setRevokeTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to revoke webhook secret");
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Signing secrets for webhook deliveries (scoped to your account).
        </p>
        <Dialog
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open);
            if (!open) setCreatedSecret(null);
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New secret
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create webhook secret</DialogTitle>
              <DialogDescription>
                Optional endpoint URL; omit for a default account secret.
              </DialogDescription>
            </DialogHeader>
            {createdSecret ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Copy this secret now — it is shown only once.
                </p>
                <div className="flex items-center gap-2 rounded-md border bg-muted p-3">
                  <code className="min-w-0 flex-1 break-all text-sm">{createdSecret}</code>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Copy secret"
                    onClick={() => void navigator.clipboard?.writeText(createdSecret)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <Button type="button" className="w-full" onClick={() => setCreateOpen(false)}>
                  Done
                </Button>
              </div>
            ) : (
              <form onSubmit={createSecret} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="secret-endpoint">Endpoint URL (optional)</Label>
                  <Input
                    id="secret-endpoint"
                    type="url"
                    value={endpoint}
                    onChange={(event) => setEndpoint(event.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button type="submit">Create secret</Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Card>
        <CardHeader>
          <CardTitle>Secrets</CardTitle>
          <CardDescription>{secrets.length} secret(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <LoadingSpinner />
            </div>
          ) : secrets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No webhook secrets yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Secret</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {secrets.map((secret) => (
                  <TableRow key={secret.id}>
                    <TableCell className="max-w-[220px] truncate text-sm">
                      {secret.endpoint ?? "default"}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs">{secret.secret_masked}</code>
                    </TableCell>
                    <TableCell>
                      <Badge variant={secret.status === "active" ? "default" : "outline"}>
                        {secret.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(secret.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setRevokeTarget(secret)}>
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke secret?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget
                ? `Secret "${revokeTarget.secret_masked}" will stop signing deliveries immediately.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmRevoke()} disabled={revoking}>
              {revoking ? "Revoking…" : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function WebhooksPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Webhook className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Webhook delivery logs and signing secrets from the core API.
        </p>
      </div>
      <Tabs defaultValue="logs">
        <TabsList>
          <TabsTrigger value="logs">Delivery logs</TabsTrigger>
          <TabsTrigger value="secrets">Signing secrets</TabsTrigger>
        </TabsList>
        <TabsContent value="logs">
          <LogsPanel />
        </TabsContent>
        <TabsContent value="secrets">
          <SecretsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
