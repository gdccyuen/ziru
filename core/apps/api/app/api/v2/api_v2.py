"""API v2 route registry."""

from app.api.v1.routes import documents as v1_documents
from app.api.v2.routes import (
    api_keys,
    attributes,
    documents,
    jobs,
    retrieval,
    search,
    users,
)
from fastapi import APIRouter

api_router = APIRouter()

api_router.include_router(jobs.router, prefix="/jobs", tags=["Jobs"])
api_router.include_router(retrieval.router, prefix="/retrieval", tags=["Retrieval"])
api_router.include_router(documents.router, prefix="/documents", tags=["Documents"])
api_router.include_router(v1_documents.router, prefix="/documents", tags=["Documents"])
api_router.include_router(search.router, prefix="/search", tags=["Search"])
api_router.include_router(attributes.router, prefix="/attributes", tags=["Attributes"])
api_router.include_router(users.router, prefix="/users", tags=["Users Admin"])
api_router.include_router(api_keys.router, prefix="/api-keys", tags=["API Keys Admin"])

__all__ = ["api_router"]
