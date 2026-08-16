import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("makeZiruClient", () => {
  const originalBaseURL = process.env.ZIRU_BASE_URL;

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    restoreEnv("ZIRU_BASE_URL", originalBaseURL);
  });

  it("sends requests to the configured API base URL", async () => {
    process.env.ZIRU_BASE_URL = "https://api-staging.ziruto.ai";
    fetchMock.mockResolvedValue(
      jsonResponse({
        job_id: "job_123",
        status: "waiting-file",
        source_type: "file",
        created_at: "2026-01-01T00:00:00.000Z",
      }),
    );

    const { makeZiruClient } = await import("./ziru");

    const client = makeZiruClient("sk_test");
    await client.jobs.create({
      sourceType: "file",
      fileName: "example.pdf",
      namespace: "workspace_123",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api-staging.ziruto.ai/v2/jobs",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk_test",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          source_type: "file",
          file_name: "example.pdf",
          namespace: "workspace_123",
        }),
      }),
    );
  });

  it("preserves resource method receivers when logging calls", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        job_id: "job_123",
        status: "waiting-file",
        source_type: "file",
        created_at: "2026-01-01T00:00:00.000Z",
      }),
    );

    const { makeZiruClient } = await import("./ziru");

    const client = makeZiruClient("sk_test");
    const job = await client.jobs.create({
      sourceType: "file",
      fileName: "example.pdf",
      namespace: "workspace_123",
    });

    expect(job).toMatchObject({
      jobId: "job_123",
      status: "waiting-file",
    });
    expect(job.createdAt).toBeInstanceOf(Date);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
