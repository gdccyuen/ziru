"""AI model configuration."""

from pydantic import BaseModel, Field


class AIConfig(BaseModel):
    """AI model configuration."""

    # Single active OpenAI-compatible provider.
    PROVIDER_URL: str = Field(
        default="",
        description="OpenAI-compatible provider base URL",
    )
    PROVIDER_KEY: str = Field(
        default="",
        description="OpenAI-compatible provider API key",
    )

    # Per-role model selection. Every role is explicit: when a role model is
    # empty the caller must supply one, or the feature is disabled until it is
    # configured. No provider-specific model names are assumed.
    NORMAL_MODEL: str = Field(
        default="",
        description="Default text model for summaries and general text LLM calls",
    )
    HIERARCHY_LLM_MODEL: str = Field(
        default="",
        description="Heading and outline recognition model; falls back to NORMAL_MODEL when empty",
    )

    # ── Deterministic numbering-first heading hierarchy (proposal: parse-quality) ──
    NUMBERING_FIRST_HIERARCHY: bool = Field(
        default=False,
        description=(
            "When true, derive heading levels from the heading numbering prefix "
            "(1 -> 1, 1.1 -> 2, 1.1.1 -> 3, '.' suffix ignored, (a)/(i) nested), "
            "instead of trusting MinerU hash levels / regex dot counts. Numbered "
            "documents get a deterministic, well-nested outline. Kept false by "
            "default until regression-tested across md/docx/pptx."
        ),
    )
    OUTLINE_SANITY_THRESHOLD: float = Field(
        default=0.85,
        description=(
            "Normalized Outline Quality score at or above which a Document's "
            "Heading Hierarchy is considered sound. The Outline Quality verdict "
            "derived on read applies this threshold (ADR-0004)."
        ),
    )
    IMAGE_MODEL: str = Field(
        default="qwen3.6-flash",
        description=(
            "Default VLM for page tagging, OCR, atlas, and chart/table bbox "
            "probes. Alternate: qwen3-vl-32b-instruct (open-weights, "
            "self-hostable via vLLM/SGLang)."
        ),
    )

    IMAGE_MODEL_MAX: str = Field(
        default="qwen3.6-flash",
        description=(
            "Higher-capability VLM for OCR and image classification. "
            "Same alternates as IMAGE_MODEL (e.g. qwen3-vl-32b-instruct)."
        ),
    )
    RETRIEVAL_PLANNER_MODEL: str = Field(
        default="",
        description="Reasoning-capable model used by the workflow query planner.",
    )
    RETRIEVAL_PLANNER_THINKING_BUDGET: int = Field(
        default=4000,
        description="Token budget for the query planner thinking call.",
    )
    RETRIEVAL_DECOMPOSITION_MAX_STEPS: int = Field(
        default=5,
        description="Maximum number of planned workflow steps.",
    )
    RETRIEVAL_WALLET_TOTAL_BUDGET: int = Field(
        default=200000,
        description="Total workflow token wallet for decomposed retrieval.",
    )
    RETRIEVAL_WALLET_PER_RETRIEVE_STEP_BUDGET: int = Field(
        default=40000,
        description="Default token budget issued to each retrieve step.",
    )
    RETRIEVAL_WORKFLOW_PARALLEL_MAX: int = Field(
        default=3,
        description="Maximum concurrent workflow steps in the same DAG batch.",
    )

    # Runtime LLM controls.
    LLM_MOCK_ENABLED: bool = Field(
        default=False,
        description="Short-circuit all OpenAI-compatible LLM calls and return canned mock responses.",
    )
    OPENAI_CLIENT_TIMEOUT: int = Field(
        default=300, description="OpenAI-compatible client timeout in seconds"
    )
    SUMMARY_LLM_MAX_CONCURRENT: int = Field(
        default=8,
        description="Max concurrent gevent greenlets for parallel post-heading summary LLM calls -- image/table/text.",
    )
    DOCX_IMAGE_SUMMARY_MAX_CONCURRENT: int = Field(
        default=4,
        description="Max concurrent local DOCX image summary VLM calls per parse job.",
    )
    PAGE_MEMORY_VLM_MAX_INFLIGHT: int = Field(
        default=16,
        description="Global Redis-backed in-flight limit for page-memory VLM calls.",
    )
    PAGE_MEMORY_VLM_LEASE_TTL_SECONDS: int = Field(
        default=600,
        description="Safety TTL for page-memory VLM in-flight leases.",
    )
    PAGE_MEMORY_VLM_WAIT_TIMEOUT_SECONDS: int = Field(
        default=120,
        description="Max wait before page-memory VLM capacity pressure becomes retryable.",
    )
    PAGE_MEMORY_SCOPE_CONCURRENCY: int = Field(
        default=5,
        description="Local per-job hierarchy scope concurrency for page-memory.",
    )
    PAGE_MEMORY_TAG_CONCURRENCY: int = Field(
        default=4,
        description="Local per-job page tagging concurrency for page-memory.",
    )
    PAGE_MEMORY_TITLE_DETECTION_CONCURRENCY: int = Field(
        default=3,
        description="Local per-job title detection concurrency for page-memory.",
    )
    PAGE_MEMORY_NODE_ASSEMBLY_CONCURRENCY: int = Field(
        default=3,
        description="Local per-job node OCR and summary concurrency for page-memory.",
    )

    SPLIT_CHAR: str = Field(default="/", description="Path separator")
    ALL_DF_COLS: str = Field(
        default="content,path,type,length,keywords,summary,know_id,tokens,connectto,addtime,page_nums,entities,asset_title",
        description=(
            "All dataframe columns. `entities` (JSON-encoded typed entities, §4.4) "
            "and `asset_title` (asset caption/label, §4.5) are additive trailing "
            "columns; legacy `keywords` is retained transitionally."
        ),
    )
    ENTITY_TYPES: str = Field(
        default="person,location,organization",
        description=(
            "Comma-separated seed list of entity types the summarizer may emit "
            "(§4.4). Extend this to broaden extraction (e.g. product, date, money) "
            "without code changes. Order is not significant; matching is "
            "case-insensitive. An empty value disables type guidance and lets the "
            "model choose, but the seed list keeps cross-document links consistent."
        ),
    )
