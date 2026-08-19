"""OIDC SSO flow (P2, ticket 03; Q26/Q28).

Admin pre-link only: the callback looks up external_identity_links for
provider="oidc" and the IdP ``sub`` claim. No auto-provision and no email
matching; unlinked identities are rejected with 403.
"""

from __future__ import annotations

import json
import secrets
import threading
from typing import Any
from urllib.parse import urlencode

import jwt
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.config import redis_pool_manager, settings
from shared.core.exceptions.domain_exceptions import AuthException
from shared.models.database.external_identity_link import ExternalIdentityLink
from shared.models.database.user import User
from shared.services.http.client_pool import get_async_client

_OIDC_PROVIDER = "oidc"
_STATE_TTL_SECONDS = 600
_STATE_KEY_PREFIX = "sso:oidc:state:"


class SSOOIDCService:
    """Discovery + authorize + code exchange + id_token verification."""

    def __init__(self) -> None:
        self._discovery_cache: dict[str, dict[str, Any]] = {}
        self._discovery_lock = threading.Lock()

    def is_configured(self) -> bool:
        return bool(settings.SSO_OIDC_ISSUER and settings.SSO_OIDC_CLIENT_ID)

    @property
    def _issuer(self) -> str:
        return settings.SSO_OIDC_ISSUER.rstrip("/")

    async def get_discovery(self) -> dict[str, Any]:
        issuer = self._issuer
        with self._discovery_lock:
            cached = self._discovery_cache.get(issuer)
        if cached is not None:
            return cached

        discovery_url = f"{issuer}/.well-known/openid-configuration"
        client = get_async_client()
        response = await client.get(discovery_url)
        if response.status_code != 200:
            raise AuthException(
                user_message="SSO provider discovery failed",
                internal_message=f"OIDC discovery returned {response.status_code}",
            )
        document = response.json()
        with self._discovery_lock:
            self._discovery_cache[issuer] = document
        return document

    async def start(self) -> tuple[str, str]:
        """Create a state, persist it, and return (state, authorize_url)."""
        discovery = await self.get_discovery()
        state = secrets.token_urlsafe(24)
        await self._store_state(state)
        authorize_endpoint = str(discovery["authorization_endpoint"])
        params = {
            "response_type": "code",
            "client_id": settings.SSO_OIDC_CLIENT_ID,
            "redirect_uri": settings.SSO_OIDC_REDIRECT_URI,
            "scope": settings.SSO_OIDC_SCOPE,
            "state": state,
        }
        separator = "&" if "?" in authorize_endpoint else "?"
        return state, f"{authorize_endpoint}{separator}{urlencode(params)}"

    async def complete(
        self,
        db: AsyncSession,
        *,
        state: str,
        code: str,
    ) -> User | None:
        """Finish the callback: verify state, exchange code, look up the link.

        Returns the linked User or None when the identity is not pre-linked.
        """
        await self._consume_state(state)
        discovery = await self.get_discovery()
        token_document = await self._exchange_code(
            token_endpoint=str(discovery["token_endpoint"]),
            code=code,
        )
        id_token = token_document.get("id_token")
        if not isinstance(id_token, str):
            raise AuthException(user_message="SSO response is missing an id_token")
        jwks = await self._fetch_jwks(str(discovery["jwks_uri"]))
        claims = self._verify_id_token(id_token, jwks)
        subject = claims.get("sub")
        if not isinstance(subject, str) or not subject:
            raise AuthException(user_message="SSO response is missing the subject")

        result = await db.execute(
            select(User)
            .join(
                ExternalIdentityLink,
                ExternalIdentityLink.user_id == User.id,
            )
            .where(
                ExternalIdentityLink.provider == _OIDC_PROVIDER,
                ExternalIdentityLink.provider_subject == subject,
            )
            .limit(1),
        )
        user = result.scalar_one_or_none()
        if user is None or user.disabled:
            return None
        return user

    async def _store_state(self, state: str) -> None:
        redis_service = redis_pool_manager.get_redis_service()
        await redis_service.set(
            f"{_STATE_KEY_PREFIX}{state}",
            json.dumps({"provider": _OIDC_PROVIDER}),
            ttl=_STATE_TTL_SECONDS,
        )

    async def _consume_state(self, state: str) -> None:
        redis_service = redis_pool_manager.get_redis_service()
        raw = await redis_service.get(f"{_STATE_KEY_PREFIX}{state}")
        if raw is None:
            raise AuthException(user_message="Invalid or expired SSO state")
        await redis_service.delete(f"{_STATE_KEY_PREFIX}{state}")

    async def _exchange_code(
        self,
        *,
        token_endpoint: str,
        code: str,
    ) -> dict[str, Any]:
        client = get_async_client()
        response = await client.post(
            token_endpoint,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.SSO_OIDC_REDIRECT_URI,
                "client_id": settings.SSO_OIDC_CLIENT_ID,
                "client_secret": settings.SSO_OIDC_CLIENT_SECRET,
            },
        )
        if response.status_code != 200:
            raise AuthException(
                user_message="SSO token exchange failed",
                internal_message=f"OIDC token endpoint returned {response.status_code}",
            )
        return response.json()

    async def _fetch_jwks(self, jwks_uri: str) -> dict[str, Any]:
        client = get_async_client()
        response = await client.get(jwks_uri)
        if response.status_code != 200:
            raise AuthException(
                user_message="SSO verification keys unavailable",
                internal_message=f"OIDC JWKS returned {response.status_code}",
            )
        document = response.json()
        if not isinstance(document.get("keys"), list):
            raise AuthException(user_message="SSO verification keys unavailable")
        return document

    def _verify_id_token(
        self,
        id_token: str,
        jwks: dict[str, Any],
    ) -> dict[str, Any]:
        """Verify iss/aud/exp and return the id_token claims."""
        try:
            header = jwt.get_unverified_header(id_token)
            key_id = header.get("kid")
            verification_key = None
            for jwk in jwks.get("keys", []):
                if jwk.get("kid") == key_id:
                    verification_key = jwt.algorithms.RSAAlgorithm.from_jwk(jwk)
                    break
            if verification_key is None:
                raise AuthException(user_message="SSO verification key not found")
            claims = jwt.decode(
                id_token,
                verification_key,
                algorithms=["RS256"],
                audience=settings.SSO_OIDC_CLIENT_ID,
                issuer=self._issuer,
            )
        except AuthException:
            raise
        except Exception as exc:
            logger.warning("OIDC id_token verification failed: {}", exc)
            raise AuthException(user_message="SSO identity token verification failed")
        return claims


_sso_oidc_service = SSOOIDCService()


def get_sso_oidc_service() -> SSOOIDCService:
    """Return the process-wide OIDC SSO service."""
    return _sso_oidc_service
