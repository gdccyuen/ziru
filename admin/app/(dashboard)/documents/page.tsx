"use client";

import { Archive, FileText, Filter, Plus, Search } from "lucide-react";
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
import { ApiError, api, type DocumentItem } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime, truncate } from "@/lib/format";

type FilterRow = { id: string; key: string; value: string };

let filterSequence = 0;

function nextFilterId(): string {
  filterSequence += 1;
  return `filter-row-${filterSequence}`;
}

export default function DocumentsPage() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [filters, setFilters] = useState<FilterRow[]>([{ id: nextFilterId(), key: "", value: "" }]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewTarget, setViewTarget] = useState<DocumentItem | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<DocumentItem | null>(null);
  const [archiving, setArchiving] = useState(false);

  const load = async (nextPage = page) => {
    setLoading(true);
    try {
      const activeFilters = filters
        .map((row) => ({ key: row.key.trim(), value: row.value.trim() }))
        .filter((row) => row.key.length > 0 && row.value.length > 0)
        .map((row) => `${row.key}=${row.value}`);
      const response = await api.documents({
        page: nextPage,
        page_size: pageSize,
        filters: activeFilters,
      });
      setDocuments(response.documents);
      setTotal(response.pagination.total);
      setPage(nextPage);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  };

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    void loadRef.current(1);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await api.archiveDocument(archiveTarget.document_id);
      setArchiveTarget(null);
      await load(page);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to archive document");
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Filter documents</CardTitle>
          <CardDescription>
            Filters apply as key=value pairs; same key ORs, different keys AND.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {filters.map((row, index) => (
            <div key={row.id} className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Key</Label>
                <Input
                  value={row.key}
                  placeholder="division"
                  onChange={(event) =>
                    setFilters((prev) =>
                      prev.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, key: event.target.value } : item
                      )
                    )
                  }
                />
              </div>
              <div className="flex-[2] space-y-1">
                <Label className="text-xs">Value</Label>
                <Input
                  value={row.value}
                  placeholder="finance"
                  onChange={(event) =>
                    setFilters((prev) =>
                      prev.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, value: event.target.value } : item
                      )
                    )
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove filter"
                onClick={() =>
                  setFilters((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                }
              >
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setFilters((prev) => [...prev, { id: nextFilterId(), key: "", value: "" }])
              }
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add filter
            </Button>
            <Button type="button" size="sm" onClick={() => void load(1)}>
              <Search className="mr-1 h-3.5 w-3.5" />
              Apply
            </Button>
          </div>
        </CardContent>
      </Card>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>
            {total} matching document(s) — page {page} of {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <LoadingSpinner />
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <FileText className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No documents match.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attributes</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((document) => (
                  <TableRow key={document.document_id}>
                    <TableCell>
                      <p className="font-medium">{document.source_file_name ?? "—"}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {truncate(document.document_id)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={document.status === "active" ? "default" : "outline"}>
                        {document.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      {document.attributes ? (
                        <span className="space-x-2 text-xs">
                          {Object.entries(document.attributes).map(([key, values]) => (
                            <span key={key} className="whitespace-nowrap">
                              {key}={values.join(",")}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(document.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setViewTarget(document)}>
                        View
                      </Button>
                      {user?.grade === "administrator" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setArchiveTarget(document)}
                        >
                          <Archive className="mr-1 h-3.5 w-3.5" />
                          Archive
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => void load(page - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => void load(page + 1)}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={viewTarget !== null}
        onOpenChange={(open) => {
          if (!open) setViewTarget(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {viewTarget?.source_file_name ?? viewTarget?.document_id ?? "Document"}
            </DialogTitle>
            <DialogDescription>Full attribute map for this document</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {viewTarget?.attributes && Object.keys(viewTarget.attributes).length > 0 ? (
              Object.entries(viewTarget.attributes).map(([key, values]) => (
                <div
                  key={key}
                  className="flex items-start justify-between gap-3 rounded-md border p-2"
                >
                  <span className="font-mono text-sm font-medium">{key}</span>
                  <span className="text-right text-sm text-muted-foreground">
                    {values.join(", ")}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No attributes.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive document?</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget
                ? `"${archiveTarget.source_file_name ?? archiveTarget.document_id}" will be archived and removed from listings.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmArchive()} disabled={archiving}>
              {archiving ? "Archiving…" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
