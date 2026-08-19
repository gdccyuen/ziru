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
  temporary_password?: string;
};

export type ApiKey = {
  id: string;
  name: string;
  api_key: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  user_id?: string;
  user_email?: string;
};

export type AttributeEntry = {
  key: string;
  allowedValues: string[] | null;
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
  document_metadata: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
  archived_at: string | null;
  attributes?: Record<string, string[]>;
};

export type DocumentsResponse = {
  documents: DocumentItem[];
  pagination: Pagination;
};

export type JobStatus = "pending" | "waiting-file" | "running" | "converting" | "done" | "failed";

export type JobItem = {
  job_id: string;
  namespace: string | null;
  document_id: string | null;
  status: JobStatus;
  source_type: string;
  data_id: string | null;
  created_at: string;
  progress: Record<string, unknown> | null;
  error: unknown;
  result_url: string | null;
  result_url_expires_at: string;
  file_name: string | null;
  duration_seconds: number | null;
};

export type JobsResponse = {
  jobs: JobItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
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

export type Health = {
  status: string;
  service: string;
  version: string;
};

export type VersionInfo = {
  version: string;
  commit: string;
  build_time: string;
  environment: string;
  service: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

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
  const detail = record.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as Record<string, unknown> | undefined;
    const msg = first?.msg;
    if (typeof msg === "string") return msg;
  }
  return undefined;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
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
      errorBlock?.message ?? extractDetail(body) ?? `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, errorBlock?.code);
  }
  return body as T;
}

export type CreateUserInput = {
  email: string;
  password: string;
  grade: Grade;
  profile?: ProfileEntry[];
};

export type UpdateUserInput = {
  grade?: Grade;
  profile?: ProfileEntry[];
  disabled?: boolean;
  reset_password?: boolean;
};

export type CreateApiKeyInput = {
  user_id: string;
  name: string;
  expires_at?: string | null;
};

export type DocumentsQuery = {
  page?: number;
  page_size?: number;
  filters?: string[];
};

export type JobsQuery = {
  page?: number;
  page_size?: number;
  job_status?: string;
};

export type WebhookLogsQuery = {
  page?: number;
  page_size?: number;
  job_id?: string;
};

function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export const api = {
  me: () => apiRequest<User>("/v1/auth/me"),
  login: (email: string, password: string) =>
    apiRequest<User>("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => apiRequest<{ message: string }>("/v1/auth/logout", { method: "POST" }),
  changePassword: (old_password: string, new_password: string) =>
    apiRequest<{ message: string }>("/v1/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ old_password, new_password }),
    }),
  health: () => apiRequest<Health>("/health"),
  version: () => apiRequest<VersionInfo>("/v1/version"),
  users: (page = 1, page_size = 100) =>
    apiRequest<{ users: User[]; total: number; page: number; page_size: number }>(
      `/v2/users${toQuery({ page, page_size })}`
    ),
  createUser: (input: CreateUserInput) =>
    apiRequest<User>("/v2/users", { method: "POST", body: JSON.stringify(input) }),
  updateUser: (userId: string, input: UpdateUserInput) =>
    apiRequest<User>(`/v2/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  apiKeys: () => apiRequest<{ api_keys: ApiKey[]; total: number }>("/v2/api-keys"),
  createApiKey: (input: CreateApiKeyInput) =>
    apiRequest<{ api_key: string; name: string; user_id: string; expires_at: string | null }>(
      "/v2/api-keys",
      { method: "POST", body: JSON.stringify(input) }
    ),
  revokeApiKey: (keyId: string) =>
    apiRequest<{ message: string }>(`/v2/api-keys/${encodeURIComponent(keyId)}`, {
      method: "DELETE",
    }),
  attributes: () => apiRequest<AttributeEntry[]>("/v2/attributes"),
  createAttribute: (input: { key: string; allowedValues?: string[] | null }) =>
    apiRequest<AttributeEntry>("/v2/attributes", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateAttribute: (key: string, input: { allowedValues?: string[] | null }) =>
    apiRequest<AttributeEntry>(`/v2/attributes/${encodeURIComponent(key)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteAttribute: (key: string) =>
    apiRequest<{ deleted: string }>(`/v2/attributes/${encodeURIComponent(key)}`, {
      method: "DELETE",
    }),
  documents: (query: DocumentsQuery = {}) => {
    const search = new URLSearchParams();
    if (query.page !== undefined) search.set("page", String(query.page));
    if (query.page_size !== undefined) search.set("page_size", String(query.page_size));
    for (const filter of query.filters ?? []) search.append("filter", filter);
    const queryString = search.toString();
    return apiRequest<DocumentsResponse>(`/v2/documents${queryString ? `?${queryString}` : ""}`);
  },
  archiveDocument: (documentId: string) =>
    apiRequest<DocumentItem>(`/v2/documents/${encodeURIComponent(documentId)}`, {
      method: "DELETE",
    }),
  jobs: (query: JobsQuery = {}) =>
    apiRequest<JobsResponse>(
      `/v1/jobs${toQuery({ page: query.page, page_size: query.page_size, job_status: query.job_status })}`
    ),
  webhookLogs: (query: WebhookLogsQuery = {}) =>
    apiRequest<WebhookLogsResponse>(
      `/v1/webhooks/logs${toQuery({ page: query.page, page_size: query.page_size, job_id: query.job_id })}`
    ),
  webhookSecrets: () => apiRequest<WebhookSecretsResponse>("/v1/webhooks/secrets"),
  createWebhookSecret: (endpoint: string | null) =>
    apiRequest<WebhookSecret>("/v1/webhooks/secrets", {
      method: "POST",
      body: JSON.stringify({ endpoint }),
    }),
  revokeWebhookSecret: (secretId: string) =>
    apiRequest<{ status: string; id: string }>(
      `/v1/webhooks/secrets/${encodeURIComponent(secretId)}`,
      { method: "DELETE" }
    ),
};
