/**
 * Local type definitions for the Ziru API (formerly the Ziru SDK).
 *
 * These shapes replace the removed `@ontos-ai/ziru-sdk` package. They are
 * copied verbatim from the SDK v2.0.0 type declarations
 * (`node_modules/@ontos-ai/ziru-sdk/dist/index.d.ts`), trimmed to the
 * surface the webui consumes. Do not invent fields here — if the API gains a
 * field, add it in the backend contract first.
 */

import type { ReadStream } from "node:fs"

/**
 * Job status
 */
export type JobStatus =
  | "pending"
  | "waiting-file"
  | "running"
  | "converting"
  | "done"
  | "failed"

/**
 * Job creation response
 */
export interface Job {
  /** Unique job identifier */
  jobId: string
  /** Current job status */
  status: JobStatus
  /** Source type (file or url) */
  sourceType: string
  /** Optional custom data identifier */
  dataId?: string
  /** Retrieval namespace for the canonical document */
  namespace?: string
  /** Planned stable document identifier for this job, when returned by the API */
  documentId?: string
  /** Job creation timestamp */
  createdAt: Date
  /** Presigned URL for file upload (if sourceType is 'file') */
  uploadUrl?: string
  /** Headers to include in upload request */
  uploadHeaders?: Record<string, string>
  /** Upload URL expiration time in seconds */
  expiresIn?: number
}

/**
 * Job error details
 */
export interface JobError {
  /** Error code */
  code: string
  /** Human-readable error message */
  message: string
  /** Request ID for debugging */
  requestId: string
  /** Additional error details */
  details?: Record<string, unknown>
}

/**
 * Job status response with full details
 */
export interface JobResult {
  /** Unique job identifier */
  jobId: string
  /** Current job status */
  status: JobStatus
  /** Source type (file or url) */
  sourceType: string
  /** Optional custom data identifier */
  dataId?: string
  /** Retrieval namespace for the canonical document */
  namespace?: string
  /** Stable document identifier for retrieval/document lifecycle APIs */
  documentId?: string
  /** Job creation timestamp */
  createdAt: Date
  /** Processing progress information */
  progress?: Record<string, unknown>
  /** Error details (if job failed) */
  error?: JobError
  /** Result metadata */
  result?: Record<string, unknown>
  /** Presigned URL to download result ZIP */
  resultUrl?: string
  /** Result URL expiration timestamp */
  resultUrlExpiresAt?: Date
  /** Original file name */
  fileName?: string
  /** File extension */
  fileExtension?: string
  /** Model used for parsing */
  model?: string
  /** Whether OCR was enabled */
  ocrEnabled?: boolean
  /** Processing duration in seconds */
  durationSeconds?: number
  /** Credits consumed */
  creditsSpent?: number
  /** Whether the job is in a terminal state (done or failed) */
  readonly isTerminal: boolean
  /** Whether the job completed successfully */
  readonly isDone: boolean
  /** Whether the job failed */
  readonly isFailed: boolean
}

/**
 * Parsing model options
 */
export type ParsingModel = "base" | "advanced"

/**
 * Document type options
 */
export type DocType = "auto" | "pdf" | "docx" | "txt" | "md"

/**
 * Parsing configuration parameters
 */
export interface ParsingParams {
  /** Parsing model to use (default: 'base') */
  model?: ParsingModel
  /** Enable OCR for scanned documents (default: false) */
  ocrEnabled?: boolean
  /** Knowledge base directory */
  kbDir?: string
  /** Document type hint (default: 'auto') */
  docType?: DocType
  /** Enable smart title parsing (default: false) */
  smartTitleParse?: boolean
  /** Generate image summaries (default: false) */
  summaryImage?: boolean
  /** Generate table summaries (default: false) */
  summaryTable?: boolean
  /** Generate text summaries (default: false) */
  summaryTxt?: boolean
  /** Additional fragment description */
  addFragDesc?: string
}

/**
 * Webhook configuration
 */
export interface WebhookConfig {
  /** Webhook URL to notify on job completion */
  url: string
}

/**
 * Client-provided display metadata copied onto the published document.
 */
export type DocumentMetadata = Record<string, unknown>

/**
 * Job creation parameters
 */
export interface CreateJobParams {
  /** Source type: 'file' for upload, 'url' for remote document */
  sourceType: "file" | "url"
  /** Source URL (required if sourceType is 'url') */
  sourceUrl?: string
  /** File name (required if sourceType is 'file') */
  fileName?: string
  /** Optional custom data identifier */
  dataId?: string
  /** Retrieval namespace for the canonical document */
  namespace?: string
  /** Existing document identifier when updating a published document */
  documentId?: string
  /** Display metadata to copy onto the published document */
  documentMetadata?: DocumentMetadata
  /** Parsing configuration */
  parsingParams?: ParsingParams
  /** Webhook configuration */
  webhook?: WebhookConfig
}

/**
 * Upload progress information
 */
export interface UploadProgress {
  /** Bytes uploaded */
  loaded: number
  /** Total bytes (may be undefined for streams) */
  total?: number
  /** Upload percentage (0-100) */
  percent: number
}

/**
 * File upload parameters
 */
export interface UploadParams {
  /** File to upload (path, Buffer, Stream, or Uint8Array) */
  file: string | Buffer | ReadStream | Uint8Array
  /** Upload progress callback */
  onProgress?: (progress: UploadProgress) => void
  /** Abort signal for cancellation */
  signal?: AbortSignal
}

/**
 * Load options for result parsing
 */
export interface LoadOptions {
  /** Whether to verify ZIP checksum (default: true) */
  verifyChecksum?: boolean
}

/**
 * Section exclusion for follow-up retrieval queries.
 */
export interface RetrievalSectionExclusion {
  /** Document containing the section to exclude */
  documentId: string
  /** Human-readable section path to exclude */
  sectionPath: string
}

/**
 * Supported retrieval channel names.
 */
export type RetrievalChannel = "path" | "content" | "term"

/**
 * Path filtering mode for retrieval queries.
 */
export type RetrievalFilterMode = "delete" | "keep"

export type RetrievalChunkType = "text" | "image" | "table" | "page"

/**
 * Retrieval query parameters.
 */
export interface RetrievalQueryParams {
  /** Search query text */
  query: string
  /** Retrieval namespace. Defaults to the server's default namespace when omitted. */
  namespace?: string
  /** Maximum number of results to return */
  topK?: number
  /**
   * Force retrieval mode.
   *
   * - ``true``  — agentic (LLM navigation + answer synthesis)
   * - ``false`` — legacy 3-channel RRF only
   * - ``undefined`` / omitted — server default
   */
  useAgentic?: boolean
  /** Chunk type filter: 1=all, 2=text, 3=image, 4=table, 5=text+image, 6=text+table, 7=page, 8=text+image+table */
  dataType?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  /** Allowed chunk types. Overrides dataType when provided. */
  chunkTypes?: RetrievalChunkType[]
  /** Path keywords for include/exclude filtering */
  signalPaths?: string[]
  /** Signal path filter mode */
  filterMode?: RetrievalFilterMode
  /** Retrieval channels to run. Defaults to all channels when omitted. */
  channels?: RetrievalChannel[]
  /** Per-channel weight overrides for reciprocal-rank fusion */
  channelWeights?: Partial<Record<RetrievalChannel, number>>
  /** Enable LLM reranking after channel fusion */
  rerank?: boolean
  /** Minimum retrieval score threshold after fusion */
  threshold?: number
  /** Override the internal per-channel recall count */
  internalRecallK?: number
  /** Documents to exclude for this request only */
  excludeDocumentIds?: string[]
  /** Document sections to exclude for this request only */
  excludeSections?: RetrievalSectionExclusion[]
}

/**
 * Caller-facing source reference attached to a retrieval result.
 */
export interface RetrievalSource {
  /** Stable document identifier */
  documentId?: string | null
  /** Original source file name */
  sourceFileName?: string | null
  /** Human-readable section path */
  sectionPath?: string | null
}

/**
 * Canonical chunk result returned by retrieval query.
 */
export interface RetrievalResult {
  /** Parser-provided chunk identifier when included by the API */
  chunkId?: string
  /** Knowledge content to use directly in the caller's answer */
  content: string
  /** Chunk type, for example text, image, table, or page */
  chunkType: string
  /** Content source marker. Page chunks normally expose summaries as content. */
  contentSource?: string
  /** Retrieval score returned by the API. Null when no score is available (agentic navigation-only results). */
  score: number | null
  /** Presigned asset URL for media chunks when available */
  assetUrl?: string
  /** Source chunk path when returned by the API */
  sourceChunkPath?: string | null
  /** Generated artifact file path for media chunks */
  filePath?: string | null
  /** Chunk metadata returned by the API */
  metadata?: Record<string, unknown>
  /** Source reference for this result */
  source: RetrievalSource
}

/**
 * Cited evidence chunk returned by agentic retrieval.
 */
export interface RetrievalReferencedChunk {
  /** Parser-provided chunk identifier */
  chunkId: string
  /** Stable document identifier */
  documentId: string
  /** Chunk type, for example text, image, table, or page */
  chunkType: string
  /** Content source marker. Page chunks normally expose summaries as content. */
  contentSource?: string | null
  /** Human-readable section path */
  sectionPath: string
  /** Source chunk path when returned by the API */
  sourceChunkPath?: string | null
  /** Generated artifact file path for media chunks */
  filePath?: string | null
  /** Published job identifier for the referenced chunk */
  jobId?: string | null
  /** Presigned asset URL for media chunks when available */
  assetUrl?: string | null
  /** Chunk metadata returned by the API */
  metadata?: Record<string, unknown>
}

/**
 * Response from POST /v2/retrieval/query.
 *
 * Three PRIMARY output fields for downstream agent consumption:
 * - `evidenceText`: hierarchical evidence tree for LLM context
 * - `decisionTrace`: per-step navigation decisions (includes stop/failure)
 * - `referencedChunks`: structured chunk citations for follow-up queries
 */
export interface RetrievalQueryResponse {
  /** Namespace searched by the API */
  namespace: string
  /** Echoed query text */
  query: string
  /** Retrieval router path used by the API for this query */
  routerUsed: string
  /** LLM-generated natural-language answer, or null when no answer was produced */
  answerText: string | null
  /** Cited evidence chunks with asset URLs when available */
  referencedChunks: RetrievalReferencedChunk[]
  /** Tree-structured evidence text rendered by the agentic navigator */
  evidenceText?: string | null
  /** Reason why the agentic run stopped (e.g. answer_done, not_found) */
  stopReason?: string | null
  /** Semantic failure reason when the agentic evidence is insufficient */
  failureReason?: string | null
  /** Per-step navigation decisions from agentic retrieval, including terminal stop/failure */
  decisionTrace?: Record<string, unknown>[]
  /** Ranked retrieval results */
  results: RetrievalResult[]
}

/**
 * Canonical document state returned by document lifecycle endpoints.
 */
export interface Document {
  /** Stable document identifier */
  documentId: string
  /** Retrieval namespace */
  namespace: string
  /** Current lifecycle status */
  status: string
  /** Current published job result identifier */
  currentJobResultId?: string
  /** Original source file name */
  sourceFileName?: string
  /** Client-provided display metadata copied from the publishing job */
  documentMetadata?: Record<string, unknown>
  /** Document creation timestamp */
  createdAt?: Date
  /** Last update timestamp */
  updatedAt?: Date
  /** Archive timestamp, when archived */
  archivedAt?: Date
}

/**
 * Pagination metadata returned by document list endpoints.
 */
export interface DocumentListPagination {
  /** Current page number */
  page: number
  /** Number of items requested per page */
  pageSize: number
  /** Total matching documents */
  total: number
  /** Total number of pages */
  totalPages: number
}

/**
 * Query parameters for GET /v2/documents.
 */
export interface DocumentListParams {
  /** Retrieval namespace */
  namespace?: string
  /** Page number (default: 1) */
  page?: number
  /** Items per page (default: 50, maximum: 200) */
  pageSize?: number
}

/**
 * Response from GET /v2/documents.
 */
export interface DocumentListResponse {
  /** Namespace listed by the API */
  namespace: string
  /** Documents visible in the namespace */
  documents: Document[]
  /** Pagination metadata */
  pagination: DocumentListPagination
}

/**
 * Document chunk types supported by document chunk endpoints.
 */
export type DocumentChunkType = "text" | "image" | "table" | "page"

/**
 * Pagination metadata returned by chunk list endpoints.
 */
export interface DocumentChunkPagination {
  /** Current page number */
  page: number
  /** Number of items requested per page */
  pageSize: number
  /** Total matching chunks */
  total: number
  /** Total number of pages */
  totalPages: number
}

/**
 * Query parameters for GET /v2/documents/{document_id}/chunks.
 */
export interface DocumentChunkListParams {
  /** Page number (default: 1) */
  page?: number
  /** Items per page (default: 50, maximum: 200) */
  pageSize?: number
  /** Optional chunk type filter */
  chunkType?: DocumentChunkType
  /** Set true to include 7-day asset URLs for media chunks */
  includeAssetUrls?: boolean
}

/**
 * Query parameters for GET /v2/documents/{document_id}/chunks/{document_chunk_id}.
 */
export interface DocumentChunkGetParams {
  /** Set true to include 7-day asset URLs for media chunks */
  includeAssetUrls?: boolean
}

/**
 * One current-revision document chunk.
 */
export interface DocumentChunk {
  /** Stable document chunk row identifier */
  id: string
  /** Parser-provided chunk identifier */
  chunkId: string
  /** Chunk content type */
  chunkType: DocumentChunkType
  /** Content source marker. Page chunks normally expose summaries as content. */
  contentSource?: string | null
  /** Chunk text or generated summary content */
  content?: string | null
  /** Parent section identifier */
  sectionId?: string | null
  /** Parent section path */
  sectionPath?: string | null
  /** Source path from the parser output */
  sourceChunkPath?: string | null
  /** Generated artifact file path for media chunks */
  filePath?: string | null
  /** Sort order within the document revision */
  sortOrder: number
  /** Chunk metadata returned by the API */
  metadata: Record<string, unknown>
  /** 7-day asset URL for media chunks when available */
  assetUrl?: string | null
  /** Chunk creation timestamp */
  createdAt?: Date
}

/**
 * Response from GET /v2/documents/{document_id}/chunks.
 */
export interface DocumentChunkListResponse {
  /** Stable document identifier */
  documentId: string
  /** Retrieval namespace */
  namespace: string
  /** Current published job result identifier */
  jobResultId?: string | null
  /** Current published job identifier */
  jobId?: string | null
  /** Current-revision chunks */
  chunks: DocumentChunk[]
  /** Pagination metadata */
  pagination: DocumentChunkPagination
}

/**
 * Response from GET /v2/documents/{document_id}/chunks/{document_chunk_id}.
 */
export interface DocumentChunkResponse {
  /** Stable document identifier */
  documentId: string
  /** Retrieval namespace */
  namespace: string
  /** Current published job result identifier */
  jobResultId?: string | null
  /** Current published job identifier */
  jobId?: string | null
  /** Requested current-revision chunk */
  chunk: DocumentChunk
}

/**
 * Statistics about the parsed document
 */
export interface Statistics {
  /** Total number of chunks */
  totalChunks: number
  /** Number of text chunks */
  textChunks: number
  /** Number of image chunks */
  imageChunks: number
  /** Number of table chunks */
  tableChunks: number
  /** Number of page chunks */
  pageChunks?: number
  /** Total number of pages (if applicable) */
  totalPages?: number
}

/**
 * File index mapping chunk IDs to file paths
 */
export interface FileIndex {
  [chunkId: string]: string
}

/**
 * Processing cost details emitted by manifest v2
 */
export interface ProcessingCost {
  microDollars?: number
  credits?: number
}

/**
 * Processing timing details emitted by manifest v2
 */
export interface ProcessingTiming {
  startedAt?: Date
  completedAt?: Date
  durationMs?: number
}

/**
 * Processing metadata emitted by manifest v2
 */
export interface ProcessingMetadata {
  pageCount?: number
  billingStatus?: string
  cost?: ProcessingCost
  timing?: ProcessingTiming
}

/**
 * Manifest containing metadata about the parse result
 */
export interface Manifest {
  /** Manifest version */
  version: string
  /** Job ID */
  jobId: string
  /** Custom data ID */
  dataId?: string
  /** Original source file name */
  sourceFileName: string
  /** Processing completion date (optional: only present if emitted by the worker) */
  processingDate?: Date
  /** Worker-side processing metadata emitted by manifest v2 */
  processing?: ProcessingMetadata
  /** Statistics */
  statistics: Statistics
  /** Legacy file index from earlier ZIP manifests */
  files?: FileIndex
  /**
   * Document hierarchy emitted by the current worker.
   *
   * The key remains all-caps at runtime because ``keysToCamel()`` only
   * transforms snake_case keys.
   */
  HIERARCHY?: Record<string, unknown>
}

/**
 * Chunk relationship entry (metadata.connect_to per schema v2.1)
 */
export interface ConnectTo {
  /** Target chunk_id */
  target: string
  /** Relationship type */
  relation: "embeds" | "related"
  /** Placeholder ref in content, e.g. '[images/a.png]' (embeds only) */
  ref?: string
  /** Semantic similarity score (related only) */
  score?: number
  /** Shared keywords (related only) */
  keywords?: string[]
}

/**
 * A single image or table resource entry in ``doc_nav.json``.
 */
export interface DocNavResourceItem {
  path: string
  summary?: string
}

/**
 * Image and table resource summaries from ``doc_nav.json``.
 */
export interface DocNavResources {
  images: DocNavResourceItem[]
  tables: DocNavResourceItem[]
}

/**
 * A document section in the ``doc_nav.json`` navigation tree.
 */
export interface DocNavSection {
  title: string
  path: string
  level: number
  summary?: string
  chunkCount: number
  children: DocNavSection[]
}

/**
 * Top-level document navigation structure from ``doc_nav.json``.
 */
export interface DocNav {
  sections: DocNavSection[]
  resources?: DocNavResources
}

/**
 * Known worker metadata fields for a chunk.
 *
 * All fields are optional.  Unknown fields added by future worker
 * versions are accessible through the index signature.
 */
export interface ChunkMetadata {
  length?: number
  pageNums?: number[]
  entities?: Record<string, unknown>[]
  tokens?: string[]
  keywords?: string[]
  summary?: string
  connectTo?: ConnectTo[]
  filePath?: string
  originalName?: string
  tableType?: string
  documentTopSummary?: string
  /** Allow forward-compatible access to unknown fields. */
  [key: string]: unknown
}

/**
 * Base chunk properties
 */
export interface BaseChunk {
  /** Unique chunk identifier */
  chunkId: string
  /** Chunk type */
  type: "text" | "image" | "table" | "page"
  /** Content source marker. Page chunks normally expose summaries as content. */
  contentSource?: string
  /** Main content */
  content: string
  /** Relative path in ZIP */
  path: string
  /** Worker metadata for this chunk */
  metadata: ChunkMetadata
}

/**
 * Minimal chunk representation emitted in chunks_slim.json (legacy).
 */
export interface SlimChunk {
  type: "text" | "image" | "table" | "page"
  path: string
  content: string
}

/**
 * Text chunk
 */
export interface TextChunk extends BaseChunk {
  type: "text"
}

/**
 * Image chunk
 */
export interface ImageChunk extends BaseChunk {
  type: "image"
  /** Relative file path in ZIP */
  filePath: string
  /** Image data buffer */
  data: Buffer
  /** Image format (derived from file extension) */
  readonly format: string
  /** Save image to disk */
  save(directory: string): Promise<string>
}

/**
 * Table chunk
 */
export interface TableChunk extends BaseChunk {
  type: "table"
  /** Relative file path in ZIP */
  filePath: string
  /** HTML representation */
  html: string
  /** Save table HTML to disk */
  save(directory: string): Promise<string>
}

/**
 * Page chunk
 */
export interface PageChunk extends BaseChunk {
  type: "page"
}

/**
 * Union type of all chunk types
 */
export type Chunk = TextChunk | ImageChunk | TableChunk | PageChunk

/**
 * Complete parse result
 */
export interface ParseResult {
  /** Manifest metadata */
  manifest: Manifest
  /** All chunks */
  chunks: Chunk[]
  /** Document navigation tree from doc_nav.json (current worker output) */
  docNav?: DocNav
  /** Full document as Markdown (if available) */
  fullMarkdown?: string
  /** Raw ZIP buffer */
  rawZip: Buffer
  /** @deprecated Current worker no longer emits chunks_slim.json */
  chunksSlim?: SlimChunk[]
  /** @deprecated Current worker no longer emits hierarchy.json */
  hierarchy?: unknown
  /** @deprecated Table-of-contents hierarchy hints (if available) */
  tocHierarchies?: unknown
  /** @deprecated Knowledge-base CSV export (if available) */
  kbCsv?: string
  /** @deprecated Pre-rendered hierarchy HTML view (if available) */
  hierarchyViewHtml?: string
  /** Text chunks only */
  readonly textChunks: TextChunk[]
  /** Image chunks only */
  readonly imageChunks: ImageChunk[]
  /** Table chunks only */
  readonly tableChunks: TableChunk[]
  /** Page chunks only */
  readonly pageChunks: PageChunk[]
  /** Job ID */
  readonly jobId: string
  /** Effective retrieval namespace when loaded from a job result */
  namespace?: string
  /** Canonical document identifier when loaded from a job result */
  documentId?: string
  /** Statistics */
  readonly statistics: Statistics
  /** Find a specific chunk by ID */
  getChunk(chunkId: string): Chunk | undefined
  /** Save all results to a directory */
  save(directory: string): Promise<string>
}

/**
 * Client surface of the Ziru API client created by
 * `makeZiruClient` (`src/integrations/ziru.ts`). Mirrors the subset
 * of the removed SDK `Ziru` class that the webui consumes.
 */
export type ZiruClient = {
  readonly jobs: {
    create(params: CreateJobParams): Promise<Job>
    get(jobId: string): Promise<JobResult>
    upload(jobOrId: string | Job, params: UploadParams): Promise<void>
    load(
      jobResultOrIdOrUrl: JobResult | string,
      options?: LoadOptions,
    ): Promise<ParseResult>
  }
  readonly retrieval: {
    query(params: RetrievalQueryParams): Promise<RetrievalQueryResponse>
  }
  readonly documents: {
    list(params?: DocumentListParams): Promise<DocumentListResponse>
    listChunks(
      documentId: string,
      params?: DocumentChunkListParams,
    ): Promise<DocumentChunkListResponse>
    archive(documentId: string): Promise<Document>
  }
}
