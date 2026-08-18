"""
Database Models Package
Ensure all models are correctly imported to avoid circular import issues
"""

# Import models in dependency order
# 1. First import base models (no foreign key dependencies)
from .user import User

# 2. Then import models that depend on User
from .api_key import APIKey
from .external_identity_link import ExternalIdentityLink
from .session import Session
from .document import (
    Document,
    DocumentChunk,
    DocumentSection,
    GraphEdge,
    GraphNode,
    RetrievalHitStat,
    RetrievalRun,
    RetrievalStep,
)
from .document_attribute import DocumentAttribute
from .attribute_dictionary import AttributeDictionaryEntry
from .document_page_plan import DocumentPagePlan
from .demo_materialization import DemoMaterialization
from .job import Job
from .job_result import JobChunk, JobResult
from .parse_agent import ParseRun, ParseStep

# 3. Job-related log models
from .job_state_audit_log import JobStateAuditLog
from .job_state_history import JobStateHistory
from .system_limit import SystemLimit

# 4. Webhook models
from .webhook import WebhookEvent, WebhookEventStatus
from .webhook_log import WebhookLog
from .webhook_secret import WebhookSecret

__all__ = [
    "User",
    "APIKey",
    "ExternalIdentityLink",
    "Session",
    "Job",
    "JobResult",
    "JobChunk",
    "Document",
    "DocumentSection",
    "DocumentChunk",
    "DocumentAttribute",
    "AttributeDictionaryEntry",
    "DocumentPagePlan",
    "DemoMaterialization",
    "GraphNode",
    "GraphEdge",
    "RetrievalHitStat",
    "RetrievalRun",
    "RetrievalStep",
    "ParseRun",
    "ParseStep",
    "JobStateAuditLog",
    "JobStateHistory",
    "WebhookEvent",
    "WebhookEventStatus",
    "WebhookLog",
    "WebhookSecret",
    "SystemLimit",
]
