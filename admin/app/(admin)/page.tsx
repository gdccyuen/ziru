"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type Health, type VersionInfo } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime, gradeLabel, truncate } from "@/lib/format";

type OverviewData = {
  health: Health | null;
  version: VersionInfo | null;
  documentTotal: number | null;
  attributeTotal: number | null;
  jobTotal: number | null;
};

const initialData: OverviewData = {
  health: null,
  version: null,
  documentTotal: null,
  attributeTotal: null,
  jobTotal: null,
};

export default function OverviewPage() {
  const { user } = useAuth();
  const [data, setData] = useState<OverviewData>(initialData);
  const [loading, setLoading] = useState(true);
  const [recentJobs, setRecentJobs] = useState<Awaited<ReturnType<typeof api.jobs>>["jobs"]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [healthResult, versionResult, docsResult, attrsResult, jobsResult] =
        await Promise.allSettled([
          api.health(),
          api.version(),
          api.documents({ page: 1, page_size: 1 }),
          api.attributes(),
          api.jobs({ page: 1, page_size: 5 }),
        ]);
      if (cancelled) return;
      setData({
        health: healthResult.status === "fulfilled" ? healthResult.value : null,
        version: versionResult.status === "fulfilled" ? versionResult.value : null,
        documentTotal: docsResult.status === "fulfilled" ? docsResult.value.pagination.total : null,
        attributeTotal: attrsResult.status === "fulfilled" ? attrsResult.value.length : null,
        jobTotal: jobsResult.status === "fulfilled" ? jobsResult.value.total : null,
      });
      if (jobsResult.status === "fulfilled") {
        setRecentJobs(jobsResult.value.jobs);
      }
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const stats = [
    {
      label: "System status",
      value: data.health?.status ?? "unavailable",
      href: undefined,
    },
    {
      label: "Documents",
      value: data.documentTotal === null ? "—" : String(data.documentTotal),
      href: "/documents",
    },
    {
      label: "Dictionary keys",
      value: data.attributeTotal === null ? "—" : String(data.attributeTotal),
      href: "/attributes",
    },
    {
      label: "Jobs (yours)",
      value: data.jobTotal === null ? "—" : String(data.jobTotal),
      href: "/jobs",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">
          Welcome{user ? ", " : ""}
          {user?.email}
        </h2>
        <p className="text-sm text-muted-foreground">
          Signed in as {user ? gradeLabel(user.grade) : "—"}. This console talks directly to the
          core Ziru API.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const card = (
            <Card
              key={stat.label}
              className={stat.href ? "h-full transition-colors hover:border-primary/60" : undefined}
            >
              <CardHeader>
                <CardDescription>{stat.label}</CardDescription>
                <CardTitle className="text-2xl">{stat.value}</CardTitle>
              </CardHeader>
            </Card>
          );
          return stat.href ? (
            <Link key={stat.label} href={stat.href} className="block h-full">
              {card}
            </Link>
          ) : (
            card
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>API health</CardTitle>
            <CardDescription>Reported by the core API</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              Service: <span className="font-medium">{data.health?.service ?? "—"}</span>
            </div>
            <div>
              Version: <span className="font-medium">{data.version?.version ?? "—"}</span>
            </div>
            <div>
              Environment: <span className="font-medium">{data.version?.environment ?? "—"}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent jobs (yours)</CardTitle>
            <CardDescription>Your latest parsing jobs from the core API</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs found.</p>
            ) : (
              recentJobs.map((job) => (
                <div key={job.job_id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {job.file_name ?? truncate(job.job_id)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(job.created_at)}
                    </p>
                  </div>
                  <Badge variant={job.status === "done" ? "default" : "outline"}>
                    {job.status}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
