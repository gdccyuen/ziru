export type ChunkType = "text" | "image" | "table" | "page"

export type ParsedChunkConnection = {
  readonly targetParserChunkId: string
  readonly targetChunkId?: string
  readonly relation: "embeds" | "related" | string
  readonly ref?: string
  readonly position?: {
    readonly start: number
    readonly end: number
  }
}

/**
 * Parsed Content panel row. Mirrors the Ziru document-chunk shape.
 */
export type ParsedChunkView = {
  readonly chunkId: string
  /** Parser-provided chunk_id. Connection metadata targets this id. */
  readonly parserChunkId?: string
  /** Ziru document ID. Present when loaded through a WebUI source. */
  readonly documentId?: string
  /** Human-readable section path from Ziru, used to focus citations. */
  readonly sectionPath?: string | null
  readonly type: ChunkType
  readonly contentSource?: string
  readonly content: string
  readonly readableContent?: string
  /** ZIP-relative parsed artifact path, e.g. images/image-1.jpg. */
  readonly filePath?: string
  /** Public Blob URL for parsed media/table artifacts when WebUI stored it. */
  readonly assetUrl?: string
  readonly summary?: string
  readonly keywords?: readonly string[]
  readonly pageNums?: readonly number[]
  readonly entities?: readonly Readonly<Record<string, unknown>>[]
  readonly connections?: readonly ParsedChunkConnection[]
  /** Display-only attribution. */
  readonly sourceTitle: string
}
