from __future__ import annotations

from typing import Any

from loguru import logger


def mineru_logger(step: str, **fields: Any):
    return logger.bind(service="mineru", step=step, **fields)
