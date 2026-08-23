"use client";

import { useEffect, useState } from "react";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type Health, type VersionInfo } from "@/lib/api";

type SettingsData = {
  version: VersionInfo | null;
  health: Health | null;
};

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData>({ version: null, health: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [versionResult, healthResult] = await Promise.allSettled([api.version(), api.health()]);
      if (cancelled) return;
      setData({
        version: versionResult.status === "fulfilled" ? versionResult.value : null,
        health: healthResult.status === "fulfilled" ? healthResult.value : null,
      });
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

  const rows: Array<[string, string]> = [
    ["Service", data.version?.service ?? data.health?.service ?? "—"],
    ["Version", data.version?.version ?? "—"],
    ["Environment", data.version?.environment ?? "—"],
    ["Commit", data.version?.commit || "—"],
    ["Build time", data.version?.build_time || "—"],
    ["Health", data.health?.status ?? "—"],
    ["API base URL", process.env.NEXT_PUBLIC_API_URL ?? "not configured"],
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Read-only view of the environment reported by the core API. System limits are configured
        server-side (e.g. MAX_CONCURRENT_JOBS) and are not editable here.
      </p>
      <Card>
        <CardHeader>
          <CardTitle>System information</CardTitle>
          <CardDescription>Reported by the core API at runtime</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 py-2">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="text-sm font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
