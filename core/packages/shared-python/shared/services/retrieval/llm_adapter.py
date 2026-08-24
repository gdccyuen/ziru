"""Async LLM adapter for agent-driven retrieval navigation.

Wraps the existing sync OpenAICompatibleClientSync via asyncio.to_thread()
to provide an async callable suitable for the agent navigation pipeline.
"""
from __future__ import annotations

import asyncio
import os
from contextvars import ContextVar
from typing import Any, Callable, Coroutine, Union, Sequence, cast

from loguru import logger

from shared.core.config import settings
from shared.services.ai.llm_overrides import get_current_llm_overrides

# LLMFn accepts either a plain string or a list of ChatCompletionMessageParam
LLMFnInput = Union[str, Sequence[dict[str, Any]]]
LLMFn = Callable[[LLMFnInput], Coroutine[Any, Any, str]]
LLMUsage = dict[str, int]
current_llm_usage: ContextVar[LLMUsage | None] = ContextVar(
    'current_llm_usage',
    default=None,
)

_RETRIEVAL_LLM_TEMPERATURE = 0.1
_RETRIEVAL_LLM_MAX_TOKENS = 2048


def _has_llm_credentials() -> bool:
    """Check whether the active OpenAI-compatible provider is configured."""
    if get_current_llm_overrides() is not None:
        return True
    if getattr(settings, 'LLM_MOCK_ENABLED', False):
        return True
    return bool(getattr(settings, 'PROVIDER_KEY', ''))


def _resolve_default_model() -> str:
    """Return the explicit default text model configured for the provider."""
    overrides = get_current_llm_overrides()
    if overrides is not None:
        provider = overrides.text_effective()
        if provider is not None:
            return provider.model
    return getattr(settings, 'NORMAL_MODEL', '')


def _resolve_planner_model(*, thinking: bool) -> str:
    del thinking  # reserved for future reasoning-mode model selection
    overrides = get_current_llm_overrides()
    if overrides is not None:
        provider = overrides.text_effective()
        if provider is not None:
            return provider.model
    configured = getattr(settings, 'RETRIEVAL_PLANNER_MODEL', '') or ''
    if configured:
        return configured
    return getattr(settings, 'NORMAL_MODEL', '')


def _resolve_vlm_model(model: str | None = None) -> str:
    overrides = get_current_llm_overrides()
    if overrides is not None:
        provider = overrides.vision_effective()
        if provider is not None:
            return provider.model
    return model or getattr(settings, 'IMAGE_MODEL', '')


def _build_client_for_channel(*, channel: str, model: str):
    """Build an OpenAI-compatible client, honoring active BYOK overrides."""
    from shared.services.ai.openai_compatible_client_sync import get_openai_client
    from shared.services.ai.llm_overrides import resolve_text, resolve_vision

    resolve = resolve_vision if channel == 'vision' else resolve_text
    effective_model, api_key, api_url = resolve(model)
    return get_openai_client(
        model=effective_model,
        api_key=api_key,
        api_url=api_url,
    ), effective_model


def create_retrieval_llm_fn(
    *,
    model: str | None = None,
    temperature: float = _RETRIEVAL_LLM_TEMPERATURE,
    max_tokens: int = _RETRIEVAL_LLM_MAX_TOKENS,
    thinking: bool | None = None,
    reasoning_effort: str = 'low',
) -> LLMFn | None:
    """Create an async LLM callable for retrieval agent navigation.

    Returns None when no LLM provider is configured, signalling the caller
    to fall back to lexical graph routing.

    When *thinking* is True, the active model is asked to reason internally but
    only `message.content` (the final answer) is returned, not any
    provider-specific reasoning payload.
    """
    if not _has_llm_credentials():
        logger.debug('retrieval: no LLM credentials configured, agent navigation disabled')
        return None

    # Allow env-var override for easy experimentation
    if thinking is None:
        thinking = os.environ.get('RETRIEVAL_LLM_THINKING', '').lower() in ('1', 'true', 'yes')

    effective_model = model or _resolve_default_model()
    if not effective_model:
        logger.debug('retrieval: NORMAL_MODEL is not configured, agent navigation disabled')
        return None
    effective_temperature = 0.0 if thinking else temperature
    effective_max_tokens = max(max_tokens, 8192) if thinking else max_tokens

    if thinking:
        logger.info(
            'retrieval: LLM thinking mode ENABLED, model={}, reasoning_effort={}',
            effective_model,
            reasoning_effort,
        )

    async def llm_fn(prompt: LLMFnInput) -> str:
        client, resolved_model = _build_client_for_channel(
            channel='text',
            model=effective_model,
        )
        current_llm_usage.set(None)

        kwargs: dict[str, Any] = {}
        if thinking:
            kwargs['extra_body'] = {
                'thinking': {'type': 'enabled'},
                'reasoning_effort': reasoning_effort,
            }

        result, usage = await asyncio.to_thread(
            client.chat_completion_with_usage,
            cast(Any, prompt),
            model=resolved_model,
            temperature=effective_temperature,
            max_tokens=effective_max_tokens,
            **kwargs,
        )
        current_llm_usage.set(usage)
        return result

    return llm_fn


def create_retrieval_planner_fn(
    *,
    thinking: bool = True,
    model: str | None = None,
    max_tokens: int = 8192,
) -> LLMFn | None:
    """Create a reasoning-capable LLM callable for query planning."""
    if not _has_llm_credentials():
        logger.debug('retrieval: no LLM credentials configured, workflow planner disabled')
        return None

    effective_model = model or _resolve_planner_model(thinking=thinking)
    if not effective_model:
        logger.debug('retrieval: RETRIEVAL_PLANNER_MODEL/NORMAL_MODEL is not configured, planner disabled')
        return None

    async def llm_fn(prompt: LLMFnInput) -> str:
        client, resolved_model = _build_client_for_channel(
            channel='text',
            model=effective_model,
        )
        current_llm_usage.set(None)
        result, usage = await asyncio.to_thread(
            client.chat_completion_with_usage,
            cast(Any, prompt),
            model=resolved_model,
            temperature=0.0,
            max_tokens=max_tokens,
        )
        current_llm_usage.set(usage)
        return result

    return llm_fn


def create_retrieval_vlm_fn(
    *,
    model: str | None = None,
    temperature: float = _RETRIEVAL_LLM_TEMPERATURE,
    max_tokens: int = 4096,
) -> LLMFn | None:
    """Create an async VLM callable for image-aware answer generation.

    Uses IMAGE_MODEL for multimodal input. Returns None when no provider or
    image model is configured.
    """
    effective_model = _resolve_vlm_model(model)

    if not _has_llm_credentials():
        logger.debug('retrieval: no LLM credentials for VLM, image-aware answering disabled')
        return None
    if not effective_model:
        logger.debug('retrieval: IMAGE_MODEL is not configured, image-aware answering disabled')
        return None

    async def vlm_fn(prompt: LLMFnInput) -> str:
        client, resolved_model = _build_client_for_channel(
            channel='vision',
            model=effective_model,
        )
        current_llm_usage.set(None)
        result, usage = await asyncio.to_thread(
            client.chat_completion_with_usage,
            cast(Any, prompt),
            model=resolved_model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        current_llm_usage.set(usage)
        return result

    return vlm_fn
