"""
MinerU service configuration
"""

from pydantic import BaseModel, Field


class MineruConfig(BaseModel):
    """MinerU PDF parsing service configuration"""

    MINERU_URL: str = Field(
        default="http://127.0.0.1:8000",
        description="Base URL of the local MinerU service, without endpoint path.",
    )
    MINERU_LOCAL_LANG_LIST: str = Field(
        default="ch",
        description=(
            "Language code passed to local MinerU's /file_parse lang_list "
            "parameter. Local MinerU does not accept 'auto'; the default 'ch' "
            "covers Chinese, English, Japanese, Traditional Chinese, and Latin."
        ),
    )
    MINERU_LOCAL_BACKEND: str = Field(
        default="pipeline",
        description=(
            "Backend passed to local MinerU's /file_parse backend parameter. "
            "Use 'pipeline' for CPU-only parsing or 'vlm-engine' for GPU VLM."
        ),
    )
    MINERU_LOCAL_TIMEOUT: int = Field(
        default=3600,
        description=(
            "Per-shard timeout in seconds for local MinerU's synchronous "
            "/file_parse call. Includes queue wait when "
            "MINERU_SHARD_CONCURRENCY > 1, because local MinerU is "
            "single-concurrency by default."
        ),
    )
