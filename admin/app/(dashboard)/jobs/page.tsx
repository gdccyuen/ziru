"use client";

import { ListTodo } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ApiError, api, type JobItem, type JobStatus } from "@/lib/api";
import { formatDateTime, truncate } from "@/lib/format";

const STATUSES: Array<JobStatus | "all"> = [
  "all",
  "pending",
  "waiting-file",
  "running",
  "converting",
  "done",
  "failed",
];

const STATUS_VARIANT: Record<JobStatus, "default" | "secondary" | "destructive" | "outline"> = {
  done: "default",
  failed: "destructive",
  running: "secondary",
  converting: "secondary",
  pending: "outline",
  "waiting-file": "outline",
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<JobStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  const load = async (nextPage: number, nextStatus: JobStatus | "all") => {
    setLoading(true);
    try {
      const response = await api.jobs({
        page: nextPage,
        page_size: pageSize,
        job_status: nextStatus === "all" ? undefined : nextStatus,
      });
      setJobs(response.jobs);
      setTotal(response.total);
      setPage(nextPage);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  };

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    void loadRef.current(1, "all");
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          The core jobs API lists jobs owned by the signed-in user (admin monitoring is
          server-scoped).
        </p>
        <Select
          value={status}
          onValueChange={(next) => {
            const nextStatus = next as JobStatus | "all";
            setStatus(nextStatus);
            void load(1, nextStatus);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((item) => (
              <SelectItem key={item} value={item}>
                {item === "all" ? "All statuses" : item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Card>
        <CardHeader>
          <CardTitle>Jobs</CardTitle>
          <CardDescription>
            {total} job(s) — page {page} of {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <LoadingSpinner />
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <ListTodo className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No jobs found.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.job_id}>
                    <TableCell className="font-mono text-xs">{truncate(job.job_id)}</TableCell>
                    <TableCell className="text-sm">
                      {job.file_name ?? job.source_type ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[job.status]}>{job.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(job.created_at)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {job.duration_seconds === null ? "—" : `${job.duration_seconds.toFixed(1)}s`}
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
              onClick={() => void load(page - 1, status)}
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
              onClick={() => void load(page + 1, status)}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
