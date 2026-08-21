"use client";

import {
  Archive,
  Copy,
  ExternalLink,
  FileText,
  Filter,
  Plus,
  Search,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, type AttributeEntry, api, type DocumentItem } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime, truncate } from "@/lib/format";

type FilterRow = { id: string; key: string; value: string };
type UploadRow = { id: string; key: string; values: string };

let filterSequence = 0;
let uploadSequence = 0;

function nextFilterId(): string {
  filterSequence += 1;
  return `filter-row-${filterSequence}`;
}

function nextUploadId(): string {
  uploadSequence += 1;
  return `upload-row-${uploadSequence}`;
}

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

function AttributeValuesEditor({
  keyName,
  values,
  onChange,
  dictionary,
}: {
  keyName: string;
  values: string;
  onChange: (values: string) => void;
  dictionary: AttributeEntry[];
}) {
  const entry = keyName ? dictionary.find((item) => item.key === keyName) : undefined;
  const allowedValues = entry?.allowedValues ?? null;
  if (allowedValues !== null && allowedValues.length > 0) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {allowedValues.map((value) => {
          const selected = splitValues(values).includes(value);
          return (
            <Button
              key={value}
              type="button"
              variant={selected ? "default" : "outline"}
              size="sm"
              onClick={() => onChange(toggleValue(values, value))}
            >
              {value}
            </Button>
          );
        })}
      </div>
    );
  }
  return (
    <Input
      value={values}
      placeholder={entry === undefined ? "select an attribute key first" : "any value allowed"}
      disabled={entry === undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function AttributeKeySelect({
  value,
  onChange,
  dictionary,
  placeholder = "Select an attribute",
}: {
  value: string;
  onChange: (value: string) => void;
  dictionary: AttributeEntry[];
  placeholder?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {dictionary.map((entry) => (
          <SelectItem key={entry.key} value={entry.key}>
            {entry.key}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function UploadDocumentDialog({
  open,
  onOpenChange,
  onUploaded,
  dictionary,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: (jobId: string) => void;
  dictionary: AttributeEntry[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  const reset = () => {
    setFile(null);
    setRows([]);
    setError(null);
    setJobId(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!file) {
      setError("Choose a file to upload");
      return;
    }
    const attributes: Record<string, string[]> = {};
    for (const row of rows) {
      const key = row.key.trim();
      const values = splitValues(row.values);
      if (key && values.length > 0) attributes[key] = values;
    }
    setSubmitting(true);
    try {
      const result = await api.uploadDocument(file, attributes);
      setJobId(result.job_id);
      onUploaded(result.job_id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to upload document");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>
            Attach a file and optional dictionary attributes. A parse job is started immediately.
          </DialogDescription>
        </DialogHeader>
        {jobId ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Upload accepted. Parse job:</p>
            <code className="block break-all rounded-md border bg-muted p-3 text-sm">{jobId}</code>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" asChild>
                <Link href="/jobs">View job on Jobs page</Link>
              </Button>
              <Button
                type="button"
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="upload-file">File</Label>
              <Input
                id="upload-file"
                type="file"
                required
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-2">
              <Label>Attributes</Label>
              {dictionary.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No attributes defined yet — define attributes first in the Attribute Dictionary
                  (optional; you can upload without attributes).
                </p>
              ) : null}
              {rows.length > 0 ? (
                <div className="space-y-3">
                  {rows.map((row, index) => {
                    const entry = row.key.trim()
                      ? dictionary.find((item) => item.key === row.key.trim())
                      : undefined;
                    return (
                      <div key={row.id} className="space-y-2 rounded-md border p-3">
                        <div className="flex items-end gap-2">
                          <div className="flex-1 space-y-1">
                            <Label className="text-xs">Attribute</Label>
                            <AttributeKeySelect
                              value={row.key}
                              onChange={(key) =>
                                setRows((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, key, values: "" } : item
                                  )
                                )
                              }
                              dictionary={dictionary}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Remove attribute row"
                            onClick={() =>
                              setRows((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                            }
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">
                            Values{entry === undefined ? "" : " (multi-select)"}
                          </Label>
                          <AttributeValuesEditor
                            keyName={row.key}
                            values={row.values}
                            onChange={(values) =>
                              setRows((prev) =>
                                prev.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, values } : item
                                )
                              )
                            }
                            dictionary={dictionary}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={dictionary.length === 0}
                onClick={() =>
                  setRows((prev) => [...prev, { id: nextUploadId(), key: "", values: "" }])
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add attribute
              </Button>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Uploading…" : "Upload"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function DocumentsPage() {
  const { user } = useAuth();
  const canUpload = user?.grade === "administrator" || user?.grade === "librarian";
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [dictionary, setDictionary] = useState<AttributeEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [filters, setFilters] = useState<FilterRow[]>([{ id: nextFilterId(), key: "", value: "" }]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewTarget, setViewTarget] = useState<DocumentItem | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<DocumentItem | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  const activeFilterStrings = (rows: FilterRow[]): string[] =>
    rows
      .map((row) => ({ key: row.key.trim(), value: row.value.trim() }))
      .filter((row) => row.key.length > 0 && row.value.length > 0)
      .flatMap((row) => splitValues(row.value).map((value) => `${row.key}=${value}`));

  const load = async (nextPage = page, rowsOverride?: FilterRow[]) => {
    setLoading(true);
    try {
      const activeFilters = activeFilterStrings(rowsOverride ?? filters);
      const [response, attributes] = await Promise.all([
        api.documents({
          page: nextPage,
          page_size: pageSize,
          filters: activeFilters,
        }),
        api.attributes().catch(() => [] as AttributeEntry[]),
      ]);
      setDocuments(response.documents);
      setTotal(response.pagination.total);
      setDictionary(attributes);
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
  const activeFilters = activeFilterStrings(filters);

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

  const resetFilters = () => {
    setFilters([{ id: nextFilterId(), key: "", value: "" }]);
    void load(1, [{ id: nextFilterId(), key: "", value: "" }]);
  };

  const removeActiveFilter = (key: string, value: string) => {
    const next = filters
      .map((row) => {
        if (row.key.trim() !== key) return row;
        const values = splitValues(row.value).filter((item) => item !== value);
        return { ...row, value: values.join(", ") };
      })
      .filter((row) => row.key.trim().length > 0 || row.value.trim().length > 0);
    if (next.length === 0) next.push({ id: nextFilterId(), key: "", value: "" });
    setFilters(next);
    void load(1, next);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Filter documents</CardTitle>
          <CardDescription>
            Filters apply as attribute key=value pairs; same key ORs, different keys AND.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {filters.map((row, index) => (
            <div key={row.id} className="flex items-end gap-2">
              <div className="w-52 space-y-1">
                <Label className="text-xs">Key</Label>
                <AttributeKeySelect
                  value={row.key}
                  onChange={(key) =>
                    setFilters((prev) =>
                      prev.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, key, value: "" } : item
                      )
                    )
                  }
                  dictionary={dictionary}
                  placeholder="Select a key"
                />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <Label className="text-xs">Value</Label>
                <AttributeValuesEditor
                  keyName={row.key}
                  values={row.value}
                  onChange={(value) =>
                    setFilters((prev) =>
                      prev.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, value } : item
                      )
                    )
                  }
                  dictionary={dictionary}
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
          <div className="flex flex-wrap items-center gap-2">
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
            <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
              Reset
            </Button>
          </div>
          {activeFilters.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
              <span className="text-xs text-muted-foreground">Active filters:</span>
              {activeFilters.map((filter) => {
                const [key, value] = filter.split("=");
                return (
                  <Badge key={filter} variant="secondary">
                    {key}={value}
                    <button
                      type="button"
                      aria-label={`Remove filter ${key}=${value}`}
                      className="ml-1 rounded-full hover:text-foreground"
                      onClick={() => removeActiveFilter(key, value)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          ) : null}
        </CardContent>
      </Card>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Documents</CardTitle>
              <CardDescription>
                {total} matching document(s) — page {page} of {totalPages}
              </CardDescription>
            </div>
            {canUpload ? (
              <div className="flex items-center gap-2">
                {uploadNotice ? (
                  <p className="text-sm text-muted-foreground">{uploadNotice}</p>
                ) : null}
                <Button onClick={() => setUploadOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload document
                </Button>
              </div>
            ) : null}
          </div>
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
            <div className="overflow-x-auto">
              <Table className="min-w-[980px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[300px]">Document</TableHead>
                    <TableHead className="w-[110px]">Status</TableHead>
                    <TableHead className="w-[340px]">Attributes</TableHead>
                    <TableHead className="w-[160px]">Created</TableHead>
                    <TableHead className="w-[160px]">Updated</TableHead>
                    <TableHead className="w-[140px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((document) => (
                    <TableRow key={document.document_id}>
                      <TableCell>
                        <p
                          className="max-w-[280px] truncate font-medium"
                          title={document.source_file_name ?? undefined}
                        >
                          {document.source_file_name ?? "—"}
                        </p>
                        <code
                          className="block max-w-[280px] truncate font-mono text-xs text-muted-foreground"
                          title={document.document_id}
                        >
                          {document.document_id}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant={document.status === "active" ? "default" : "outline"}>
                          {document.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {document.attributes && Object.keys(document.attributes).length > 0 ? (
                          <p
                            className="max-w-[320px] truncate text-xs"
                            title={Object.entries(document.attributes)
                              .map(([key, values]) => `${key}=${values.join(",")}`)
                              .join(" ")}
                          >
                            {Object.entries(document.attributes)
                              .map(([key, values]) => `${key}=${values.join(",")}`)
                              .join("  ")}
                          </p>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDateTime(document.created_at)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDateTime(document.updated_at)}
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
            </div>
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

      <UploadDocumentDialog
        open={uploadOpen}
        onOpenChange={(open) => {
          setUploadOpen(open);
          if (!open) setUploadNotice(null);
        }}
        onUploaded={(jobId) => {
          setUploadNotice(`Upload accepted — job ${jobId} (see Jobs page)`);
          void load(1);
        }}
        dictionary={dictionary}
      />

      <Dialog
        open={viewTarget !== null}
        onOpenChange={(open) => {
          if (!open) setViewTarget(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {viewTarget?.source_file_name ?? truncate(viewTarget?.document_id ?? "Document", 40)}
            </DialogTitle>
            <DialogDescription>Full attribute map for this document</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {viewTarget?.attributes && Object.keys(viewTarget.attributes).length > 0 ? (
              Object.entries(viewTarget.attributes)
                .sort(
                  ([keyA], [keyB]) =>
                    (keyA === "originalFile" ? 1 : 0) - (keyB === "originalFile" ? 1 : 0)
                )
                .map(([key, values]) => (
                  <div
                    key={key}
                    className="flex items-start justify-between gap-3 rounded-md border p-2"
                  >
                    <span className="font-mono text-sm font-medium">{key}</span>
                    {key === "originalFile" && values.length > 0 ? (
                      <a
                        href={
                          "/api/v2/documents/" +
                          encodeURIComponent(viewTarget.document_id) +
                          "/file/original"
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        view original
                      </a>
                    ) : key === "fileHash" && values.length > 0 ? (
                      <span className="flex items-center gap-1.5 text-right">
                        <code className="font-mono text-xs text-muted-foreground">
                          {truncate(values[0], 24)}
                        </code>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          aria-label="Copy file hash"
                          onClick={() => void navigator.clipboard?.writeText(values[0])}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </span>
                    ) : (
                      <span className="text-right text-sm text-muted-foreground">
                        {values.join(", ")}
                      </span>
                    )}
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
