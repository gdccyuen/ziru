import { readFile, mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { inflateRawSync } from "node:zlib"

import { logger } from "@/lib/logger"
import type {
  Chunk,
  ChunkMetadata,
  CreateJobParams,
  DocNav,
  Document,
  DocumentChunkListParams,
  DocumentChunkListResponse,
  DocumentListParams,
  DocumentListResponse,
  ImageChunk,
  Job,
  JobResult,
  ZiruClient,
  LoadOptions,
  Manifest,
  ParseResult,
  RetrievalQueryParams,
  RetrievalQueryResponse,
  SlimChunk,
  TableChunk,
  UploadParams,
} from "./ziru-sdk-types"
import type { ReadStream } from "node:fs"

const DEFAULT_BASE_URL = "https://api.ziruto.ai"
const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_UPLOAD_TIMEOUT_MS = 600_000
const DEFAULT_MAX_RETRIES = 5
const RETRYABLE_STATUS_CODES = new Set([409, 429, 502, 503, 504])
const INITIAL_RETRY_DELAY_MS = 500
const MAX_RETRY_DELAY_MS = 30_000
const TERMINAL_JOB_STATUSES = new Set(["done", "failed"])

/**
 * Options accepted by the local Ziru API client. Mirrors the constructor
 * options of the removed SDK `Ziru` class (only the fields the webui
 * passes are required to behave).
 */
export type ZiruClientOptions = {
  apiKey?: string
  authTokenProvider?: () => string | Promise<string>
  baseURL?: string
  timeout?: number
  uploadTimeout?: number
  maxRetries?: number
  defaultHeaders?: Record<string, string>
}

/**
 * Create a Ziru API client with the given API key.
 * Use for per-request clients created from Dashboard-issued JWTs.
 */
export function makeZiruClient(apiKey: string): ZiruClient {
  const options: ZiruClientOptions = {
    apiKey,
    baseURL: process.env.ZIRU_BASE_URL,
  }
  const client = new ZiruClientImpl(options)
  return wrapZiruClient(client)
}

export type ZiruNamespace = {
  readonly namespace: string
  readonly documentCount: number
}

/**
 * List all namespaces from the Ziru API.
 * The SDK does not expose this endpoint, so we call it directly.
 */
export async function listZiruNamespaces(
  apiKey: string,
): Promise<readonly ZiruNamespace[]> {
  const baseURL = process.env.ZIRU_BASE_URL ?? "https://api.ziru.com"
  const response = await fetch(`${baseURL}/v1/documents/namespaces`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!response.ok) {
    logger.warn("ziru: listNamespaces failed", {
      status: response.status,
    })
    return []
  }
  const data = (await response.json()) as unknown
  const items = Array.isArray(data)
    ? data
    : (data as { namespaces?: unknown[] })?.namespaces
  if (!Array.isArray(items)) return []
  return items
    .filter(
      (item): item is { namespace: string; document_count?: number; documentCount?: number } =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { namespace?: unknown }).namespace === "string",
    )
    .map((item) => ({
      namespace: item.namespace,
      documentCount: item.documentCount ?? item.document_count ?? 0,
    }))
}

/**
 * Probe whether an API key is valid by listing namespaces. 200 → valid;
 * 401/403 (or any failure) → invalid. Used when a user adds a key.
 */
export async function validateZiruApiKey(
  apiKey: string,
): Promise<boolean> {
  const baseURL = process.env.ZIRU_BASE_URL ?? "https://api.ziru.com"
  try {
    const response = await fetch(`${baseURL}/v1/documents/namespaces`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    return response.ok
  } catch {
    return false
  }
}

function wrapZiruClient(client: ZiruClient): ZiruClient {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof value === "function") {
        return createLoggingMethod(String(prop), value, [], target)
      }
      if (value !== null && typeof value === "object") {
        return createLoggingNamespace(String(prop), value)
      }
      return value
    },
  }) as ZiruClient
}

function createLoggingNamespace(
  namespace: string,
  obj: object,
): object {
  return new Proxy(obj, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof value === "function") {
        return createLoggingMethod(prop, value, [namespace], target)
      }
      return value
    },
  })
}

function createLoggingMethod(
  name: string | symbol,
  fn: (...args: unknown[]) => unknown,
  path: string[],
  thisArg: object,
): (...args: unknown[]) => unknown {
  const fullPath = [...path, String(name)].join(".")

  return (...args: unknown[]) => {
    const start = Date.now()
    logger.info(`ziru: ${fullPath}`, { args: safeArgs(args) })

    const result = Reflect.apply(fn, thisArg, args) as unknown
    if (!isPromise(result)) return result

    return result.then(
      (value: unknown) => {
        logger.info(`ziru: ${fullPath} ok`, {
          durationMs: Date.now() - start,
        })
        return value
      },
      (error: unknown) => {
        logger.error(`ziru: ${fullPath} failed`, {
          durationMs: Date.now() - start,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      },
    )
  }
}

function isPromise(value: unknown): value is Promise<unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as Promise<unknown>).then === "function"
  )
}

function safeArgs(args: unknown[]): unknown {
  try {
    return JSON.parse(JSON.stringify(args))
  } catch {
    return args.map((a) => (typeof a === "string" ? a : "[non-serializable]"))
  }
}

// ---------------------------------------------------------------------------
// Client implementation
// ---------------------------------------------------------------------------

class ZiruClientImpl implements ZiruClient {
  readonly jobs: JobsResource
  readonly documents: DocumentsResource
  readonly retrieval: RetrievalResource

  constructor(options: ZiruClientOptions = {}) {
    const http = new HttpClientCore(options)
    this.jobs = new JobsResource(http)
    this.documents = new DocumentsResource(http)
    this.retrieval = new RetrievalResource(http)
  }
}

class HttpClientCore {
  private readonly baseURL: string
  private readonly apiKey?: string
  private readonly authTokenProvider?: () => string | Promise<string>
  private readonly timeoutMs: number
  private readonly uploadTimeoutMs: number
  private readonly maxRetries: number
  private readonly defaultHeaders: Record<string, string>

  constructor(options: ZiruClientOptions) {
    this.baseURL = (
      options.baseURL ??
      process.env.ZIRU_BASE_URL ??
      DEFAULT_BASE_URL
    ).replace(/\/+$/, "")
    this.apiKey = options.apiKey
    this.authTokenProvider = options.authTokenProvider
    this.timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS
    this.uploadTimeoutMs = options.uploadTimeout ?? DEFAULT_UPLOAD_TIMEOUT_MS
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
    this.defaultHeaders = options.defaultHeaders ?? {}
  }

  get<T = unknown>(
    path: string,
    config?: { params?: Record<string, unknown> },
  ): Promise<T> {
    return this.request<T>("GET", path, { params: config?.params })
  }

  post<T = unknown>(path: string, data?: unknown): Promise<T> {
    return this.request<T>("POST", path, { body: data })
  }

  /**
   * Download a URL as a raw buffer (used for presigned result ZIP URLs).
   */
  download(url: string): Promise<Buffer> {
    return this.requestBuffer("GET", url, {})
  }

  /**
   * PUT a file body to a presigned upload URL. No retries (matches the SDK).
   */
  async upload(
    url: string,
    body: Buffer,
    headers: Record<string, string>,
  ): Promise<void> {
    const response = await fetch(url, {
      method: "PUT",
      headers,
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(this.uploadTimeoutMs),
    })
    if (!response.ok) {
      throw await buildResponseError(response)
    }
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    input: { params?: Record<string, unknown>; body?: unknown },
  ): Promise<T> {
    const buffer = await this.requestBuffer(method, path, input)
    if (buffer.length === 0) return undefined as T
    const parsed = JSON.parse(buffer.toString("utf8")) as unknown
    return parseDates(keysToCamel(parsed)) as T
  }

  private requestBuffer(
    method: "GET" | "POST",
    url: string,
    input: { params?: Record<string, unknown>; body?: unknown },
  ): Promise<Buffer> {
    return withRetry(
      () => this.rawRequestBuffer(method, url, input),
      this.maxRetries,
      `${method} ${url}`,
    )
  }

  private async rawRequestBuffer(
    method: "GET" | "POST",
    url: string,
    input: { params?: Record<string, unknown>; body?: unknown },
  ): Promise<Buffer> {
    const fullUrl = buildUrl(this.baseURL, url, input.params)
    const headers: Record<string, string> = {
      "User-Agent": "ziru-webui/0.1.0",
      ...this.defaultHeaders,
    }
    let body: string | undefined
    if (input.body !== undefined) {
      headers["Content-Type"] = "application/json"
      body = JSON.stringify(keysToSnake(input.body))
    }
    const authToken =
      this.apiKey ?? (await this.authTokenProvider?.())
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`

    const response = await fetch(fullUrl, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (!response.ok) {
      throw await buildResponseError(response)
    }
    return Buffer.from(await response.arrayBuffer())
  }
}

class JobsResource {
  private readonly http: HttpClientCore
  private readonly pendingUploadJobs = new Map<string, Job>()

  constructor(http: HttpClientCore) {
    this.http = http
  }

  /**
   * Create a new parsing job
   */
  async create(params: CreateJobParams): Promise<Job> {
    const job = await this.http.post<Job>(endpoint("/jobs"), params)
    if (job.uploadUrl) {
      this.pendingUploadJobs.set(job.jobId, job)
    }
    return job
  }

  /**
   * Get job status
   */
  async get(jobId: string): Promise<JobResult> {
    const jobResult = await this.http.get<JobResult>(
      endpoint(`/jobs/${jobId}`),
    )
    return enrichJobResult(jobResult)
  }

  /**
   * Upload file for a job
   */
  async upload(
    jobOrId: string | Job,
    params: UploadParams,
  ): Promise<void> {
    const response = this.resolveUploadJob(jobOrId)
    if (!response.uploadUrl) {
      throw new ZiruNotFoundError(
        "Upload URL not available for this job. Pass the Job object returned from create() or a direct upload URL string.",
      )
    }
    const file = await readUploadFile(params.file)
    await this.http.upload(response.uploadUrl, file, {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(file.byteLength),
      ...response.uploadHeaders,
    })
    this.pendingUploadJobs.delete(response.jobId)
  }

  /**
   * Load parse result from completed job
   */
  async load(
    jobResultOrIdOrUrl: JobResult | string,
    options?: LoadOptions,
  ): Promise<ParseResult> {
    void options // verifyChecksum is a no-op in the current API
    const jobResult = await this.resolveLoadJobResult(jobResultOrIdOrUrl)
    if (!jobResult.isDone) {
      throw new Error(
        `Job ${jobResult.jobId} is not done yet (status: ${jobResult.status})`,
      )
    }
    if (!jobResult.resultUrl) {
      throw new ZiruNotFoundError("Result URL not available")
    }
    const zipBuffer = await this.http.download(jobResult.resultUrl)
    const result = parseResultBuffer(zipBuffer)
    return enrichParseResult(result, jobResult)
  }

  private isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(value)
  }

  private resolveUploadJob(jobOrId: string | Job): Job {
    if (typeof jobOrId !== "string") {
      if (jobOrId.uploadUrl) {
        this.pendingUploadJobs.set(jobOrId.jobId, jobOrId)
      }
      return jobOrId
    }
    if (this.isHttpUrl(jobOrId)) {
      return {
        jobId: "direct-upload-url",
        status: "waiting-file",
        sourceType: "file",
        createdAt: new Date(0),
        uploadUrl: jobOrId,
      }
    }
    const cachedJob = this.pendingUploadJobs.get(jobOrId)
    if (cachedJob) {
      return cachedJob
    }
    throw new ZiruInvalidStateError(
      `Upload URL not available for job ${jobOrId}. Pass the Job object returned from create() or a direct upload URL string.`,
    )
  }

  private async resolveLoadJobResult(
    jobResultOrIdOrUrl: JobResult | string,
  ): Promise<JobResult> {
    if (typeof jobResultOrIdOrUrl !== "string") {
      enrichJobResult(jobResultOrIdOrUrl)
      return jobResultOrIdOrUrl
    }
    if (this.isHttpUrl(jobResultOrIdOrUrl)) {
      return {
        jobId: "direct-result-url",
        status: "done",
        sourceType: "file",
        createdAt: new Date(0),
        resultUrl: jobResultOrIdOrUrl,
        resultUrlExpiresAt: new Date(0),
        isTerminal: true,
        isDone: true,
        isFailed: false,
      }
    }
    return this.get(jobResultOrIdOrUrl)
  }
}

class RetrievalResource {
  private readonly http: HttpClientCore

  constructor(http: HttpClientCore) {
    this.http = http
  }

  /**
   * Query published documents.
   */
  query(params: RetrievalQueryParams): Promise<RetrievalQueryResponse> {
    return this.http.post<RetrievalQueryResponse>(
      endpoint("/retrieval/query"),
      params,
    )
  }
}

class DocumentsResource {
  private readonly http: HttpClientCore

  constructor(http: HttpClientCore) {
    this.http = http
  }

  /**
   * List canonical documents in a namespace.
   */
  async list(params?: DocumentListParams): Promise<DocumentListResponse> {
    const response = await this.http.get<DocumentListResponse>(
      endpoint("/documents"),
      { params: buildDocumentListParams(params) },
    )
    return normalizeDocumentListResponse(response)
  }

  /**
   * List current-revision chunks for one canonical document.
   */
  listChunks(
    documentId: string,
    params?: DocumentChunkListParams,
  ): Promise<DocumentChunkListResponse> {
    return this.http.get<DocumentChunkListResponse>(
      endpoint(`/documents/${documentId}/chunks`),
      { params: buildChunkListParams(params) },
    )
  }

  /**
   * Archive one canonical document by ID.
   */
  archive(documentId: string): Promise<Document> {
    return this.http.post<Document>(
      endpoint(`/documents/${documentId}/archive`),
    )
  }
}

function endpoint(path: string): string {
  return `/v2${path.startsWith("/") ? path : `/${path}`}`
}

function buildDocumentListParams(
  params: DocumentListParams | undefined,
): Record<string, unknown> | undefined {
  if (!params) return undefined
  const queryParams: Record<string, unknown> = {}
  if (params.namespace !== undefined) queryParams.namespace = params.namespace
  if (params.page !== undefined) queryParams.page = params.page
  if (params.pageSize !== undefined) queryParams.page_size = params.pageSize
  return Object.keys(queryParams).length > 0 ? queryParams : undefined
}

function buildChunkListParams(
  params: DocumentChunkListParams | undefined,
): Record<string, unknown> | undefined {
  if (!params) return undefined
  const queryParams: Record<string, unknown> = {}
  if (params.page !== undefined) queryParams.page = params.page
  if (params.pageSize !== undefined) queryParams.page_size = params.pageSize
  if (params.chunkType !== undefined) {
    queryParams.chunk_type = params.chunkType
  }
  if (params.includeAssetUrls !== undefined) {
    queryParams.include_asset_urls = params.includeAssetUrls
  }
  return Object.keys(queryParams).length > 0 ? queryParams : undefined
}

function normalizeDocumentListResponse(
  response: DocumentListResponse,
): DocumentListResponse {
  if (response.pagination) return response
  const total = response.documents.length
  return {
    ...response,
    pagination: {
      page: 1,
      pageSize: total,
      total,
      totalPages: total > 0 ? 1 : 0,
    },
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers (retries, error mapping, key transforms)
// ---------------------------------------------------------------------------

function buildUrl(
  baseURL: string,
  path: string,
  params?: Record<string, unknown>,
): string {
  const url = new URL(`${baseURL}${path}`)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, String(item))
      } else {
        url.searchParams.set(key, String(value))
      }
    }
  }
  return url.toString()
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  label: string,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (!shouldRetry(error, attempt, maxRetries)) throw error
      const delay = getRetryDelayMs(error, attempt)
      console.warn(`Retry attempt ${attempt + 1} for ${label}:`, error)
      await sleep(delay)
    }
  }
  throw lastError
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function shouldRetry(
  error: unknown,
  attempt: number,
  maxRetries: number,
): boolean {
  if (attempt >= maxRetries) return false
  return isRetryableError(error)
}

function isRetryableError(error: unknown): boolean {
  if (isAbortError(error)) return false
  if (error instanceof Error && isNetworkError(error)) return true
  if (error instanceof ZiruApiError) {
    if (RETRYABLE_STATUS_CODES.has(error.statusCode)) {
      if (error.statusCode === 429) {
        return error.retryAfter !== undefined
      }
      if (error.statusCode === 409) {
        return error.code === "ABORTED"
      }
      return true
    }
  }
  return false
}

function isNetworkError(error: Error): boolean {
  return (
    error.message.includes("ECONNRESET") ||
    error.message.includes("ETIMEDOUT") ||
    error.message.includes("ENOTFOUND") ||
    error.message.includes("ECONNREFUSED") ||
    (error.name === "TypeError" && error.message.includes("fetch failed"))
  )
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === "AbortError"
  )
}

function getRetryDelayMs(error: unknown, attempt: number): number {
  const retryAfterMs = getRetryAfterMs(error)
  if (retryAfterMs !== undefined) return retryAfterMs
  const baseDelay = INITIAL_RETRY_DELAY_MS * 2 ** attempt
  return Math.min(jitter(baseDelay), MAX_RETRY_DELAY_MS)
}

function getRetryAfterMs(error: unknown): number | undefined {
  if (
    error instanceof ZiruApiError &&
    typeof error.retryAfter === "number" &&
    Number.isFinite(error.retryAfter) &&
    error.retryAfter >= 0
  ) {
    return error.retryAfter * 1000
  }
  const bodyRetryAfter = getBodyRetryAfter(error)
  if (bodyRetryAfter !== undefined) return bodyRetryAfter
  return undefined
}

function getBodyRetryAfter(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined
  const body = error.body
  if (!isRecord(body)) return undefined
  const raw = body.retry_after ?? body.retryAfter
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return raw * 1000
  }
  if (typeof raw === "string") {
    const parsed = Number.parseFloat(raw)
    if (Number.isFinite(parsed) && parsed >= 0) return parsed * 1000
  }
  return undefined
}

function jitter(value: number, percent = 0.2): number {
  const randomFactor = 1 + (Math.random() * 2 - 1) * percent
  return Math.round(value * randomFactor)
}

async function buildResponseError(
  response: Response,
): Promise<ZiruApiError> {
  const status = response.status
  const rawBody = await readResponseBody(response)
  const errorData = normalizeErrorData(rawBody)
  const errorObject = getErrorObject(errorData)
  const message = getErrorMessage(errorObject, status)
  const code = getErrorCode(errorObject)
  const requestId =
    response.headers.get("x-request-id") ??
    (typeof errorObject?.request_id === "string"
      ? errorObject.request_id
      : undefined)
  const details =
    errorObject?.details &&
    typeof errorObject.details === "object" &&
    errorObject.details.constructor === Object
      ? (errorObject.details as Record<string, unknown>)
      : undefined
  let retryAfter: number | undefined
  if (status === 429) {
    const retryAfterMs = getResponseRetryAfterMs(response)
    retryAfter =
      retryAfterMs !== undefined ? Math.ceil(retryAfterMs / 1000) : undefined
  }
  return new ZiruApiError(
    message,
    status,
    code,
    requestId,
    details,
    rawBody,
    retryAfter,
  )
}

function getResponseRetryAfterMs(response: Response): number | undefined {
  const header = response.headers.get("retry-after")
  if (!header || typeof header !== "string") return undefined
  const seconds = Number.parseFloat(header)
  if (!Number.isNaN(seconds)) return seconds * 1000
  return undefined
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return undefined
  const contentType = response.headers.get("content-type") ?? ""
  if (contentType.includes("json")) {
    try {
      return JSON.parse(text) as unknown
    } catch {
      return text
    }
  }
  return text
}

function normalizeErrorData(
  data: unknown,
): Record<string, unknown> | undefined {
  if (
    data &&
    typeof data === "object" &&
    (data as object).constructor === Object
  ) {
    return data as Record<string, unknown>
  }
  const decoded = decodeErrorPayload(data)
  if (!decoded) return undefined
  try {
    const parsed = JSON.parse(decoded) as unknown
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as object).constructor === Object
    ) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // not JSON — fall through to XML / text handling
  }
  const xmlCode = decoded.match(/<Code>([^<]+)<\/Code>/i)?.[1]
  const xmlMessage = decoded.match(/<Message>([^<]+)<\/Message>/i)?.[1]
  if (xmlCode || xmlMessage) {
    return {
      code: xmlCode,
      message: [xmlCode, xmlMessage].filter(Boolean).join(": "),
    }
  }
  return { message: decoded.slice(0, 300) }
}

function decodeErrorPayload(data: unknown): string | undefined {
  if (typeof data === "string") return data.trim()
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8").trim()
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
      .toString("utf8")
      .trim()
  }
  if (Buffer.isBuffer(data)) {
    return data.toString("utf8").trim()
  }
  return undefined
}

function getErrorObject(
  errorData: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!errorData) return undefined
  const nestedError = errorData.error
  if (
    nestedError &&
    typeof nestedError === "object" &&
    (nestedError as object).constructor === Object
  ) {
    return nestedError as Record<string, unknown>
  }
  return errorData
}

function getErrorMessage(
  errorData: Record<string, unknown> | undefined,
  status: number,
): string {
  if (!errorData) return `HTTP ${status} error`
  return typeof errorData.message === "string"
    ? errorData.message
    : typeof errorData.error === "string"
      ? errorData.error
      : `HTTP ${status} error`
}

function getErrorCode(
  errorData: Record<string, unknown> | undefined,
): string | undefined {
  if (!errorData) return undefined
  return typeof errorData.code === "string" ? errorData.code : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

// ---------------------------------------------------------------------------
// Key transforms (mirror the SDK's axios interceptors)
// ---------------------------------------------------------------------------

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

function keysToCamel(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map((item) => keysToCamel(item))
  if (
    typeof value === "object" &&
    (value as object).constructor === Object
  ) {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      result[snakeToCamel(key)] = keysToCamel(item)
    }
    return result
  }
  return value
}

function keysToSnake(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map((item) => keysToSnake(item))
  if (
    typeof value === "object" &&
    (value as object).constructor === Object
  ) {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      result[camelToSnake(key)] = keysToSnake(item)
    }
    return result
  }
  return value
}

function parseDates(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map((item) => parseDates(item))
  if (
    typeof value === "object" &&
    (value as object).constructor === Object
  ) {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      if (
        (key.endsWith("At") || key.endsWith("Date")) &&
        typeof item === "string" &&
        /^\d{4}-\d{2}-\d{2}T/.test(item)
      ) {
        result[key] = new Date(item)
      } else {
        result[key] = parseDates(item)
      }
    }
    return result
  }
  return value
}

function enrichJobResult(jobResult: JobResult): JobResult {
  const computedProperties: PropertyDescriptorMap = {}
  if (!Object.getOwnPropertyDescriptor(jobResult, "isTerminal")) {
    computedProperties.isTerminal = {
      get(this: JobResult) {
        return TERMINAL_JOB_STATUSES.has(this.status)
      },
      enumerable: true,
      configurable: true,
    }
  }
  if (!Object.getOwnPropertyDescriptor(jobResult, "isDone")) {
    computedProperties.isDone = {
      get(this: JobResult) {
        return this.status === "done"
      },
      enumerable: true,
      configurable: true,
    }
  }
  if (!Object.getOwnPropertyDescriptor(jobResult, "isFailed")) {
    computedProperties.isFailed = {
      get(this: JobResult) {
        return this.status === "failed"
      },
      enumerable: true,
      configurable: true,
    }
  }
  if (Object.keys(computedProperties).length > 0) {
    Object.defineProperties(jobResult, computedProperties)
  }
  return jobResult
}

// ---------------------------------------------------------------------------
// Result ZIP parsing (jobs.load)
// ---------------------------------------------------------------------------

function parseResultBuffer(zipBuffer: Buffer): ParseResult {
  const zip = new ZipReader(zipBuffer)

  const manifestFile = zip.file("manifest.json")
  if (!manifestFile) {
    throw new ZiruError("manifest.json not found in ZIP")
  }
  let manifest = JSON.parse(manifestFile.text()) as Manifest
  manifest = keysToCamel(manifest) as Manifest
  manifest = parseDates(manifest) as Manifest

  const chunksFile = zip.file("chunks.json")
  if (!chunksFile) {
    throw new ZiruError("chunks.json not found in ZIP")
  }
  let chunksData = JSON.parse(chunksFile.text()) as unknown
  chunksData = keysToCamel(chunksData)
  const rawChunks = extractChunks(chunksData)
  const chunks: Chunk[] = []
  for (const chunkData of rawChunks) {
    chunks.push(processChunk(zip, chunkData))
  }

  let fullMarkdown: string | undefined
  const fullMdFile = zip.file("full.md")
  if (fullMdFile) fullMarkdown = fullMdFile.text()

  let docNav: DocNav | undefined
  const docNavFile = zip.file("doc_nav.json")
  if (docNavFile) {
    docNav = keysToCamel(JSON.parse(docNavFile.text())) as DocNav
  }

  let hierarchy: unknown
  const hierarchyFile = zip.file("hierarchy.json")
  if (hierarchyFile) hierarchy = JSON.parse(hierarchyFile.text())

  let chunksSlim: SlimChunk[] | undefined
  const chunksSlimFile = zip.file("chunks_slim.json")
  if (chunksSlimFile) {
    chunksSlim = extractSlimChunks(
      keysToCamel(JSON.parse(chunksSlimFile.text())) as unknown,
    )
  }

  let tocHierarchies: unknown
  const tocHierarchiesFile = zip.file("toc_hierarchies.json")
  if (tocHierarchiesFile) {
    tocHierarchies = keysToCamel(JSON.parse(tocHierarchiesFile.text()))
  }

  let kbCsv: string | undefined
  const kbCsvFile = zip.file("kb.csv")
  if (kbCsvFile) kbCsv = kbCsvFile.text()

  let hierarchyViewHtml: string | undefined
  const hierarchyViewFile = zip.file("hierarchy_view.html")
  if (hierarchyViewFile) hierarchyViewHtml = hierarchyViewFile.text()

  return createParseResult({
    manifest,
    chunks,
    docNav,
    fullMarkdown,
    rawZip: zipBuffer,
    // Legacy
    chunksSlim,
    hierarchy,
    tocHierarchies,
    kbCsv,
    hierarchyViewHtml,
  })
}

function createParseResult(parts: {
  manifest: Manifest
  chunks: Chunk[]
  docNav?: DocNav
  fullMarkdown?: string
  rawZip: Buffer
  chunksSlim?: SlimChunk[]
  hierarchy?: unknown
  tocHierarchies?: unknown
  kbCsv?: string
  hierarchyViewHtml?: string
}): ParseResult {
  const {
    manifest,
    chunks,
    docNav,
    fullMarkdown,
    rawZip,
    chunksSlim,
    hierarchy,
    tocHierarchies,
    kbCsv,
    hierarchyViewHtml,
  } = parts
  return {
    manifest,
    chunks,
    docNav,
    fullMarkdown,
    rawZip,
    chunksSlim,
    hierarchy,
    tocHierarchies,
    kbCsv,
    hierarchyViewHtml,
    get textChunks() {
      return chunks.filter((c) => c.type === "text")
    },
    get imageChunks() {
      return chunks.filter((c) => c.type === "image")
    },
    get tableChunks() {
      return chunks.filter((c) => c.type === "table")
    },
    get pageChunks() {
      return chunks.filter((c) => c.type === "page")
    },
    get jobId() {
      return manifest.jobId
    },
    get statistics() {
      return manifest.statistics
    },
    getChunk(chunkId) {
      return chunks.find((c) => c.chunkId === chunkId)
    },
    async save(directory) {
      await mkdir(directory, { recursive: true })
      await writeFile(
        `${directory}/manifest.json`,
        JSON.stringify(manifest, null, 2),
      )
      if (docNav) {
        await writeFile(
          `${directory}/doc_nav.json`,
          JSON.stringify(docNav, null, 2),
        )
      }
      await writeFile(
        `${directory}/chunks.json`,
        JSON.stringify(chunks, null, 2),
      )
      if (chunksSlim) {
        await writeFile(
          `${directory}/chunks_slim.json`,
          JSON.stringify({ chunks: chunksSlim }, null, 2),
        )
      }
      if (fullMarkdown) {
        await writeFile(`${directory}/full.md`, fullMarkdown)
      }
      if (hierarchy) {
        await writeFile(
          `${directory}/hierarchy.json`,
          JSON.stringify(hierarchy, null, 2),
        )
      }
      if (tocHierarchies) {
        await writeFile(
          `${directory}/toc_hierarchies.json`,
          JSON.stringify(tocHierarchies, null, 2),
        )
      }
      if (kbCsv) {
        await writeFile(`${directory}/kb.csv`, kbCsv)
      }
      if (hierarchyViewHtml) {
        await writeFile(`${directory}/hierarchy_view.html`, hierarchyViewHtml)
      }
      for (const imageChunk of this.imageChunks) {
        await imageChunk.save(directory)
      }
      for (const tableChunk of this.tableChunks) {
        await tableChunk.save(directory)
      }
      await writeFile(`${directory}/result.zip`, rawZip)
      return directory
    },
  }
}

function extractChunks(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[]
  if (
    isRecord(payload) &&
    Array.isArray(payload.chunks)
  ) {
    return payload.chunks as Record<string, unknown>[]
  }
  return []
}

function extractSlimChunks(payload: unknown): SlimChunk[] {
  if (Array.isArray(payload)) return payload as SlimChunk[]
  if (
    isRecord(payload) &&
    Array.isArray(payload.chunks)
  ) {
    return payload.chunks as SlimChunk[]
  }
  return []
}

function processChunk(
  zip: ZipReader,
  chunkData: Record<string, unknown>,
): Chunk {
  if (chunkData.type === "text") {
    return buildTextChunk(chunkData)
  }
  if (chunkData.type === "page") {
    return buildPageChunk(chunkData)
  }
  if (chunkData.type === "image") {
    const filePath = getChunkFilePath(chunkData)
    if (!filePath) {
      throw new ZiruError(
        `Image chunk missing file path: ${String(chunkData.chunkId ?? "unknown")}`,
      )
    }
    const sanitized = sanitizePath(filePath)
    const imageFile = zip.file(sanitized)
    if (!imageFile) {
      throw new ZiruError(`Image file not found: ${filePath}`)
    }
    const imageBuffer = imageFile.data()
    return buildImageChunk(chunkData, filePath, imageBuffer)
  }
  if (chunkData.type === "table") {
    const filePath = getChunkFilePath(chunkData)
    if (!filePath) {
      throw new ZiruError(
        `Table chunk missing file path: ${String(chunkData.chunkId ?? "unknown")}`,
      )
    }
    const sanitized = sanitizePath(filePath)
    const htmlFile = zip.file(sanitized)
    if (!htmlFile) {
      throw new ZiruError(`Table file not found: ${filePath}`)
    }
    const html = htmlFile.text()
    return buildTableChunk(chunkData, filePath, html)
  }
  return buildTextChunk(chunkData)
}

function buildTextChunk(chunkData: Record<string, unknown>): Chunk {
  return {
    chunkId: String(chunkData.chunkId ?? ""),
    type: "text",
    contentSource: String(chunkData.contentSource ?? "content"),
    content: String(chunkData.content ?? ""),
    path: String(chunkData.path ?? ""),
    metadata: (chunkData.metadata ?? {}) as ChunkMetadata,
  }
}

function buildPageChunk(chunkData: Record<string, unknown>): Chunk {
  return {
    chunkId: String(chunkData.chunkId ?? ""),
    type: "page",
    contentSource: String(chunkData.contentSource ?? "summary"),
    content: String(chunkData.content ?? ""),
    path: String(chunkData.path ?? ""),
    metadata: (chunkData.metadata ?? {}) as ChunkMetadata,
  }
}

function buildImageChunk(
  chunkData: Record<string, unknown>,
  filePath: string,
  imageBuffer: Buffer,
): ImageChunk {
  return {
    chunkId: String(chunkData.chunkId ?? ""),
    type: "image",
    contentSource:
      typeof chunkData.contentSource === "string"
        ? chunkData.contentSource
        : undefined,
    content: String(chunkData.content ?? ""),
    path: String(chunkData.path ?? ""),
    filePath,
    data: imageBuffer,
    metadata: (chunkData.metadata ?? {}) as ChunkMetadata,
    get format() {
      return getFileExtension(this.filePath)
    },
    async save(directory) {
      return writeBinaryAsset(directory, this.filePath, this.data)
    },
  }
}

function buildTableChunk(
  chunkData: Record<string, unknown>,
  filePath: string,
  html: string,
): TableChunk {
  return {
    chunkId: String(chunkData.chunkId ?? ""),
    type: "table",
    contentSource:
      typeof chunkData.contentSource === "string"
        ? chunkData.contentSource
        : undefined,
    content: String(chunkData.content ?? ""),
    path: String(chunkData.path ?? ""),
    filePath,
    html,
    metadata: (chunkData.metadata ?? {}) as ChunkMetadata,
    async save(directory) {
      return writeTextAsset(directory, this.filePath, this.html)
    },
  }
}

function getChunkFilePath(
  chunkData: Record<string, unknown>,
): string | undefined {
  const metadata = chunkData.metadata as Record<string, unknown> | undefined
  const candidate =
    chunkData.filePath ?? metadata?.filePath ?? chunkData.path
  return typeof candidate === "string" ? candidate : undefined
}

function sanitizePath(value: string): string {
  let sanitized = value.replace(/^\/+/, "")
  sanitized = sanitized.replace(/\.\.(\/|\\)/g, "")
  sanitized = sanitized.replace(/\\/g, "/")
  return sanitized
}

function getFileExtension(filename: string): string {
  const match = filename.match(/\.([^.]+)$/)
  return match ? match[1]!.toLowerCase() : ""
}

function enrichParseResult(
  parseResult: ParseResult,
  scope: JobResult,
): ParseResult {
  if (scope.namespace !== undefined) parseResult.namespace = scope.namespace
  if (scope.documentId !== undefined) parseResult.documentId = scope.documentId
  return parseResult
}

async function writeBinaryAsset(
  directory: string,
  filePath: string,
  data: Buffer,
): Promise<string> {
  const outputPath = `${directory}/${filePath}`
  const outputDir = dirname(outputPath)
  await mkdir(outputDir, { recursive: true })
  await writeFile(outputPath, data)
  return outputPath
}

async function writeTextAsset(
  directory: string,
  filePath: string,
  text: string,
): Promise<string> {
  const outputPath = `${directory}/${filePath}`
  const outputDir = dirname(outputPath)
  await mkdir(outputDir, { recursive: true })
  await writeFile(outputPath, text)
  return outputPath
}

// ---------------------------------------------------------------------------
// Minimal ZIP reader (central-directory based; store + deflate entries)
// ---------------------------------------------------------------------------

type ZipEntry = {
  readonly name: string
  readonly method: number
  readonly compressedSize: number
  readonly localHeaderOffset: number
}

type ZipFileHandle = {
  text(): string
  data(): Buffer
}

class ZipReader {
  private readonly entries = new Map<string, ZipEntry>()
  private readonly buffer: Buffer

  constructor(buffer: Buffer) {
    this.buffer = buffer
    const eocd = findEndOfCentralDirectory(buffer)
    if (!eocd) {
      throw new ZiruError("Invalid ZIP: end of central directory not found")
    }
    const totalEntries = buffer.readUInt16LE(eocd + 10)
    const centralDirectoryOffset = buffer.readUInt32LE(eocd + 16)
    let offset = centralDirectoryOffset
    for (let index = 0; index < totalEntries; index++) {
      if (buffer.readUInt32LE(offset) !== 0x02014b50) {
        throw new ZiruError("Invalid ZIP: central directory entry signature")
      }
      const method = buffer.readUInt16LE(offset + 10)
      const compressedSize = buffer.readUInt32LE(offset + 20)
      const nameLength = buffer.readUInt16LE(offset + 28)
      const extraLength = buffer.readUInt16LE(offset + 30)
      const commentLength = buffer.readUInt16LE(offset + 32)
      const localHeaderOffset = buffer.readUInt32LE(offset + 42)
      const flags = buffer.readUInt16LE(offset + 8)
      const rawName = buffer.subarray(offset + 46, offset + 46 + nameLength)
      const name = decodeZipName(rawName, flags)
      this.entries.set(name, {
        name,
        method,
        compressedSize,
        localHeaderOffset,
      })
      offset += 46 + nameLength + extraLength + commentLength
    }
  }

  file(name: string): ZipFileHandle | undefined {
    const entry = this.entries.get(name)
    if (!entry) return undefined
    return {
      text: () => this.readEntry(entry).toString("utf8"),
      data: () => this.readEntry(entry),
    }
  }

  private readEntry(entry: ZipEntry): Buffer {
    const buffer = this.buffer
    const localHeaderOffset = entry.localHeaderOffset
    if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new ZiruError("Invalid ZIP: local file header signature")
    }
    const nameLength = buffer.readUInt16LE(localHeaderOffset + 26)
    const extraLength = buffer.readUInt16LE(localHeaderOffset + 28)
    const dataStart = localHeaderOffset + 30 + nameLength + extraLength
    const compressed = buffer.subarray(
      dataStart,
      dataStart + entry.compressedSize,
    )
    if (entry.method === 0) {
      // stored
      return Buffer.from(compressed)
    }
    if (entry.method === 8) {
      // deflate
      return inflateRawSync(compressed)
    }
    throw new ZiruError(
      `Unsupported ZIP compression method: ${entry.method}`,
    )
  }
}

function findEndOfCentralDirectory(
  buffer: Buffer,
): number | null {
  const minEocdSize = 22
  const maxCommentLength = 0xffff
  const searchStart = Math.max(0, buffer.length - minEocdSize - maxCommentLength)
  for (let index = buffer.length - minEocdSize; index >= searchStart; index--) {
    if (
      buffer[index] === 0x50 &&
      buffer[index + 1] === 0x4b &&
      buffer[index + 2] === 0x05 &&
      buffer[index + 3] === 0x06
    ) {
      return index
    }
  }
  return null
}

function decodeZipName(rawName: Buffer, flags: number): string {
  // General purpose bit 11 marks UTF-8 names; otherwise fall back to latin1
  // (cp437-compatible for the ASCII subset).
  return rawName.toString(flags & 0x800 ? "utf8" : "latin1")
}

// ---------------------------------------------------------------------------
// Errors (mirror the SDK's error classes)
// ---------------------------------------------------------------------------

class ZiruError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ZiruError"
  }
}

class ZiruApiError extends ZiruError {
  readonly statusCode: number
  readonly code?: string
  readonly requestId?: string
  readonly details?: Record<string, unknown>
  readonly body?: unknown
  readonly retryAfter?: number

  constructor(
    message: string,
    statusCode: number,
    code?: string,
    requestId?: string,
    details?: Record<string, unknown>,
    body?: unknown,
    retryAfter?: number,
  ) {
    super(message)
    this.name = "APIError"
    this.statusCode = statusCode
    this.code = code
    this.requestId = requestId
    this.details = details
    this.body = body
    this.retryAfter = retryAfter
  }
}

class ZiruNotFoundError extends ZiruError {
  readonly statusCode = 404
  readonly code?: string
  readonly requestId?: string
  readonly details?: Record<string, unknown>
  readonly body?: unknown

  constructor(
    message: string,
    code?: string,
    requestId?: string,
    details?: Record<string, unknown>,
    body?: unknown,
  ) {
    super(message)
    this.name = "NotFoundError"
    this.code = code
    this.requestId = requestId
    this.details = details
    this.body = body
  }
}

class ZiruInvalidStateError extends ZiruError {
  constructor(message: string) {
    super(message)
    this.name = "InvalidStateError"
  }
}

class ZiruValidationError extends ZiruError {
  constructor(message: string) {
    super(message)
    this.name = "ValidationError"
  }
}

async function readUploadFile(
  file: string | Buffer | ReadStream | Uint8Array,
): Promise<Buffer> {
  if (typeof file === "string") {
    return readFile(file)
  }
  if (Buffer.isBuffer(file)) return file
  if (file instanceof Uint8Array) return Buffer.from(file)
  if (isReadStream(file)) {
    const chunks: Buffer[] = []
    for await (const chunk of file) {
      chunks.push(
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array),
      )
    }
    return Buffer.concat(chunks)
  }
  throw new ZiruValidationError("Unsupported file type")
}

function isReadStream(value: unknown): value is ReadStream {
  return (
    typeof value === "object" &&
    value !== null &&
    "pipe" in value &&
    "read" in value &&
    typeof (value as { pipe: unknown }).pipe === "function"
  )
}
