/**
 * Core API client for the WebUI (P6).
 *
 * Every request goes through the Next.js rewrite proxy (/api/* -> core
 * API) and carries the shared ziru_session cookie (same-origin).
 */

export type Grade = "administrator" | "librarian" | "user";

export type ProfileEntry = {
  key: string;
  values: string[];
};

export type User = {
  id: string;
  email: string;
  grade: Grade;
  profile: ProfileEntry[];
  must_change_password: boolean;
  disabled: boolean;
  created_at: string | null;
};

export type ApiKey = {
  id: string;
  name: string;
  api_key?: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
};

export type AttributeEntry = {
  key: string;
  allowedValues: string[] | null;
  usage?: number;
};

export type AttributeFilter = {
  key: string;
  values: string[];
};

export type RetrievalParams = {
  rerank?: boolean;
  top_k?: number;
  internal_recall_k?: number;
  use_agentic?: boolean;
};

export type Pagination = {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

export type DocumentItem = {
  document_id: string;
  status: string;
  current_job_result_id: string | null;
  source_file_name: string | null;
  document_metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
  archived_at: string | null;
  creator_email?: string | null;
  attributes?: Record<string, string[]>;
};

export type DocumentsResponse = {
  documents: DocumentItem[];
  pagination: Pagination;
};

export type DocumentChunkLeaf = {
  chunk_id: string;
  snippet: string | null;
  section_path: string | null;
};

export type DocumentSectionNode = {
  id: string;
  section_path: string;
  title: string;
  level: number;
  parent: string | null;
  leaf: boolean;
  chunk_count: number;
  has_content: boolean;
  content_snippet: string | null;
  chunks: DocumentChunkLeaf[];
  sort_order: number;
};

export type DocumentSectionsResponse = {
  document_id: string;
  source_file_name: string | null;
  job_result_id: string | null;
  sections: DocumentSectionNode[];
};

export type DocumentChunkDetail = {
  document_id: string;
  chunk_id: string;
  section_path: string | null;
  content: string | null;
  chunk_type: string;
  metadata: Record<string, unknown> | null;
};

export type RetrievalResult = {
  chunk_id?: string;
  chunk_type?: string;
  content?: string;
  content_source?: string;
  score?: number | null;
  asset_url?: string | null;
  source_chunk_path?: string | null;
  file_path?: string | null;
  metadata?: Record<string, unknown> | null;
  source?: {
    document_id?: string | null;
    source_file_name?: string | null;
    section_path?: string | null;
  } | null;
};

export type SearchResponse = {
  query: string;
  router_used: string;
  evidence_text: string;
  answer_text: string;
  referenced_chunks: unknown[];
  results: RetrievalResult[];
  stop_reason: string | null;
  failure_reason: string | null;
  decision_trace: unknown[] | null;
};

export type RetrievalTraceQuery = {
  query: string;
  namespace: string;
  result_count: number;
  referenced_chunk_count: number;
  top_scores: number[];
};

export type RetrievalTrace = {
  duration_seconds: number;
  llm_call_count: number;
  input_tokens: number;
  output_tokens: number;
  queries: RetrievalTraceQuery[];
};

export const DEFAULT_THREAD_TITLE = "New chat";

export type ChatThread = {
  id: string;
  title: string;
  filters: AttributeFilter[];
  retrieval_params: RetrievalParams | null;
  created_at: string | null;
  updated_at: string | null;
  archived_at: string | null;
};

export type ChatMessage = {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  citations: RetrievalResult[];
  trace: RetrievalTrace | null;
  created_at: string | null;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function extractDetail(body: unknown): string | undefined {
  if (typeof body === "string") return body;
  if (body === null || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  const error = record.error as Record<string, unknown> | undefined;
  if (error && typeof error.message === "string") return error.message;
  const detail = record.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as Record<string, unknown> | undefined;
    const msg = first?.msg;
    if (typeof msg === "string") return msg;
  }
  return undefined;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (
    init.body !== undefined &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`/api${path}`, {
    ...init,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const errorBlock =
      body !== null && typeof body === "object"
        ? (body as { error?: { message?: string; code?: string } }).error
        : undefined;
    const message =
      errorBlock?.message ??
      extractDetail(body) ??
      `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, errorBlock?.code);
  }
  return body as T;
}

export function originalFileUrl(documentId: string): string {
  return `/api/v2/documents/${encodeURIComponent(documentId)}/file/original`;
}

export type UsersResponse = {
  users: User[];
  total?: number;
};

export type JobItem = {
  job_id: string;
  document_id: string | null;
  status: string;
  source_type: string;
  data_id: string | null;
  created_at: string;
  progress: Record<string, unknown> | null;
  error: unknown;
  result: Record<string, unknown> | null;
  result_url: string | null;
  result_url_expires_at: string | null;
  file_name: string | null;
  file_extension: string | null;
  model: string | null;
  ocr_enabled: boolean | null;
  duration_seconds: number | null;
  estimated_duration_s: number | null;
};

export type JobsResponse = {
  jobs: JobItem[];
  total: number;
  page?: number;
  page_size?: number;
  total_pages?: number;
};

export type WebhookLog = {
  id: string;
  job_id: string | null;
  webhook_url: string | null;
  attempt_number: number | null;
  request_payload: Record<string, unknown> | null;
  signature: string | null;
  idempotency_key: string | null;
  response_status_code: number | null;
  response_body: string | null;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
};

export type WebhookLogsResponse = {
  logs: WebhookLog[];
  total: number;
  page: number;
  page_size: number;
};

export type WebhookSecret = {
  id: string;
  endpoint: string | null;
  secret_masked: string;
  status: string;
  created_at: string;
  secret?: string;
};

export type WebhookSecretsResponse = {
  secrets: WebhookSecret[];
  total: number;
};

export const api = {
  me: () => apiRequest<User>("/v1/auth/me"),
  login: (email: string, password: string) =>
    apiRequest<User>("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () =>
    apiRequest<{ message: string }>("/v1/auth/logout", { method: "POST" }),
  changePassword: (old_password: string, new_password: string) =>
    apiRequest<{ message: string }>("/v1/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ old_password, new_password }),
    }),
  attributes: () => apiRequest<AttributeEntry[]>("/v2/attributes"),
  createAttribute: (key: string, allowedValues: string[]) =>
    apiRequest<AttributeEntry>("/v2/attributes", {
      method: "POST",
      body: JSON.stringify({ key, allowedValues }),
    }),
  updateAttribute: (key: string, allowedValues: string[]) =>
    apiRequest<AttributeEntry>(`/v2/attributes/${encodeURIComponent(key)}`, {
      method: "PATCH",
      body: JSON.stringify({ allowedValues }),
    }),
  deleteAttribute: (key: string) =>
    apiRequest<{ deleted: string }>(`/v2/attributes/${encodeURIComponent(key)}`, {
      method: "DELETE",
    }),
  users: (params: { page?: number; page_size?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.page !== undefined) search.set("page", String(params.page));
    if (params.page_size !== undefined)
      search.set("page_size", String(params.page_size));
    const qs = search.toString();
    return apiRequest<UsersResponse>("/v2/users" + (qs ? "?" + qs : ""));
  },
  jobs: (params: {
    page?: number;
    page_size?: number;
    job_status?: string;
  } = {}) => {
    const search = new URLSearchParams();
    if (params.page !== undefined) search.set("page", String(params.page));
    if (params.page_size !== undefined)
      search.set("page_size", String(params.page_size));
    if (params.job_status !== undefined)
      search.set("job_status", params.job_status);
    const qs = search.toString();
    return apiRequest<JobsResponse>("/v2/jobs" + (qs ? "?" + qs : ""));
  },
  uploadDocument: (formData: FormData) =>
    apiRequest<{ job_id: string }>("/v2/documents", {
      method: "POST",
      body: formData,
    }),
  webhookLogs: (params: { page?: number; page_size?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.page !== undefined) search.set("page", String(params.page));
    if (params.page_size !== undefined) search.set("page_size", String(params.page_size));
    const qs = search.toString();
    return apiRequest<WebhookLogsResponse>("/v1/webhooks/logs" + (qs ? "?" + qs : ""));
  },
  webhookSecrets: () =>
    apiRequest<WebhookSecretsResponse>("/v1/webhooks/secrets"),
  search: (input: {
    query: string;
    filters: AttributeFilter[];
    top_k?: number;
    internal_recall_k?: number;
    rerank?: boolean;
    use_agentic?: boolean;
  }) =>
    apiRequest<SearchResponse>("/v2/search", {
      method: "POST",
      body: JSON.stringify({
        query: input.query,
        filters: input.filters,
        top_k: input.top_k ?? 8,
        internal_recall_k: input.internal_recall_k ?? 30,
        rerank: input.rerank ?? true,
        use_agentic: input.use_agentic ?? true,
      }),
    }),
  documents: (query: {
    page?: number;
    page_size?: number;
    filters?: string[];
  } = {}) => {
    const search = new URLSearchParams();
    if (query.page !== undefined) search.set("page", String(query.page));
    if (query.page_size !== undefined)
      search.set("page_size", String(query.page_size));
    for (const filter of query.filters ?? []) search.append("filter", filter);
    const queryString = search.toString();
    const documentsPath =
      "/v2/documents" + (queryString ? "?" + queryString : "");
    return apiRequest<DocumentsResponse>(documentsPath);
  },
  documentSections: (documentId: string) =>
    apiRequest<DocumentSectionsResponse>(
      `/v2/documents/${encodeURIComponent(documentId)}/sections`,
    ),
  documentChunk: (documentId: string, chunkId: string) =>
    apiRequest<DocumentChunkDetail>(
      `/v2/documents/${encodeURIComponent(documentId)}/chunks/${encodeURIComponent(chunkId)}`,
    ),
  reparseDocument: (documentId: string) =>
    apiRequest<{ job_id: string }>(
      `/v2/documents/${encodeURIComponent(documentId)}/reparse`,
      { method: "POST" },
    ),
  apiKeys: () =>
    apiRequest<{ api_keys: ApiKey[]; total: number }>("/v2/api-keys"),
  chatThreads: {
    list: () =>
      apiRequest<{ threads: ChatThread[]; total: number }>(
        "/v2/chat/threads",
      ),
    create: (input: {
      title?: string;
      filters?: AttributeFilter[];
      retrieval_params?: RetrievalParams;
    }) =>
      apiRequest<ChatThread>("/v2/chat/threads", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    rename: (threadId: string, title: string) =>
      apiRequest<ChatThread>(
        `/v2/chat/threads/${encodeURIComponent(threadId)}`,
        { method: "PATCH", body: JSON.stringify({ title }) },
      ),
    update: (threadId: string, input: {
      title?: string;
      filters?: AttributeFilter[];
      retrieval_params?: RetrievalParams;
    }) =>
      apiRequest<ChatThread>(
        `/v2/chat/threads/${encodeURIComponent(threadId)}`,
        { method: "PATCH", body: JSON.stringify(input) },
      ),
    archive: (threadId: string) =>
      apiRequest<{ message: string }>(
        `/v2/chat/threads/${encodeURIComponent(threadId)}`,
        { method: "DELETE" },
      ),
    messages: (threadId: string) =>
      apiRequest<{ thread: ChatThread; messages: ChatMessage[] }>(
        `/v2/chat/threads/${encodeURIComponent(threadId)}/messages`,
      ),
    // Streaming (Phase 4) is deferred per docs/CHAT-ANSWER-PRESENTATION.md §6;
    // keep this single-shot contract and evolve a v3 stream from its trace shape.
    postMessage: (
      threadId: string,
      input: { content: string; filters?: AttributeFilter[] },
    ) =>
      apiRequest<{
        user_message: ChatMessage;
        assistant_message: ChatMessage;
        trace: RetrievalTrace;
      }>(`/v2/chat/threads/${encodeURIComponent(threadId)}/messages`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  },
};
