"use client";

import { Plus, Tags, Trash2 } from "lucide-react";
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
import { ApiError, type AttributeEntry, api } from "@/lib/api";
import { joinAllowedValues, splitAllowedValues } from "@/lib/format";

type EditorState = {
  key: string;
  allowedValues: string;
};

function AttributeDialog({
  entry,
  open,
  onOpenChange,
  onSaved,
}: {
  entry: AttributeEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isEdit = entry !== null;
  const [state, setState] = useState<EditorState>({ key: "", allowedValues: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setState({
      key: entry?.key ?? "",
      allowedValues: joinAllowedValues(entry?.allowedValues),
    });
    setError(null);
  }, [entry]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const allowedValues = splitAllowedValues(state.allowedValues);
      if (isEdit && entry) {
        await api.updateAttribute(entry.key, { allowedValues });
      } else {
        await api.createAttribute({ key: state.key.trim(), allowedValues });
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save attribute");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit attribute" : "Add attribute"}</DialogTitle>
          <DialogDescription>
            Allowed values restrict which values documents and profiles may use.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="attribute-key">Key</Label>
            <Input
              id="attribute-key"
              required
              disabled={isEdit}
              value={state.key}
              onChange={(event) => setState((prev) => ({ ...prev, key: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="attribute-values">Allowed values (comma separated, optional)</Label>
            <Input
              id="attribute-values"
              value={state.allowedValues}
              placeholder="finance, sales"
              onChange={(event) =>
                setState((prev) => ({ ...prev, allowedValues: event.target.value }))
              }
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Add attribute"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AttributesPage() {
  const [entries, setEntries] = useState<AttributeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ open: boolean; entry: AttributeEntry | null }>({
    open: false,
    entry: null,
  });
  const [deleteTarget, setDeleteTarget] = useState<AttributeEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setEntries(await api.attributes());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load attributes");
    } finally {
      setLoading(false);
    }
  };

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    void loadRef.current();
  }, []);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteAttribute(deleteTarget.key);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete attribute");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Attribute dictionary drives validation for document and profile attributes.
        </p>
        <Button onClick={() => setEditor({ open: true, entry: null })}>
          <Plus className="mr-2 h-4 w-4" />
          Add attribute
        </Button>
      </div>
      <AttributeDialog
        entry={editor.entry}
        open={editor.open}
        onOpenChange={(open) => setEditor((prev) => ({ ...prev, open }))}
        onSaved={() => void load()}
      />
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete attribute?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `Attribute "${deleteTarget.key}" will be removed from the dictionary.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Card>
        <CardHeader>
          <CardTitle>Attribute dictionary</CardTitle>
          <CardDescription>{entries.length} keys defined</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <LoadingSpinner />
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Tags className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No dictionary entries yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Allowed values</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.key}>
                    <TableCell className="font-mono font-medium">{entry.key}</TableCell>
                    <TableCell>
                      {entry.allowedValues && entry.allowedValues.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {entry.allowedValues.map((value) => (
                            <Badge key={value} variant="secondary">
                              {value}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">any value</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditor({ open: true, entry })}
                      >
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(entry)}>
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Delete
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
