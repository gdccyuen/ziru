"""Fake OIDC IdP for SSO contract tests (P2, ticket 03).

Serves discovery / authorize / token / jwks over a local HTTP server so the
real OIDC client code path (httpx + PyJWT) is exercised end to end.
"""

from __future__ import annotations

import json
import threading
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlparse

import jwt
from cryptography.hazmat.primitives.asymmetric.rsa import (
    RSAPrivateKey,
    generate_private_key,
)


@dataclass
class FakeOIDCState:
    signing_key: RSAPrivateKey
    key_id: str
    issuer: str
    client_id: str
    subject: str
    token_claims_overrides: dict[str, Any] = field(default_factory=dict)
    discovery_status_code: int = 200
    request_count: int = 0
    lock: threading.Lock = field(default_factory=threading.Lock)

    def record_request(self) -> None:
        with self.lock:
            self.request_count += 1

    def set_token_claims_overrides(self, overrides: Mapping[str, Any]) -> None:
        with self.lock:
            self.token_claims_overrides = dict(overrides)

    def set_discovery_status(self, status_code: int) -> None:
        with self.lock:
            self.discovery_status_code = status_code

    def jwk(self) -> dict[str, object]:
        jwk = dict(
            jwt.algorithms.RSAAlgorithm.to_jwk(
                self.signing_key.public_key(), as_dict=True
            )
        )
        return {**jwk, "kid": self.key_id, "use": "sig", "alg": "RS256"}

    def build_id_token(self, nonce: str | None = None) -> str:
        now = datetime.now(timezone.utc)
        claims: dict[str, Any] = {
            "iss": self.issuer,
            "sub": self.subject,
            "aud": self.client_id,
            "iat": now,
            "exp": now + timedelta(minutes=5),
        }
        if nonce:
            claims["nonce"] = nonce
        claims.update(self.token_claims_overrides)
        return jwt.encode(
            claims,
            self.signing_key,
            algorithm="RS256",
            headers={"kid": self.key_id},
        )

    def discovery_document(self) -> dict[str, str]:
        return {
            "issuer": self.issuer,
            "authorization_endpoint": f"{self.issuer}/authorize",
            "token_endpoint": f"{self.issuer}/token",
            "jwks_uri": f"{self.issuer}/jwks",
            "response_types_supported": ["code"],
            "subject_types_supported": ["public"],
            "id_token_signing_alg_values_supported": ["RS256"],
        }


@dataclass(frozen=True)
class FakeOIDCServer:
    endpoint: str
    state: FakeOIDCState


def create_fake_oidc_private_key() -> RSAPrivateKey:
    return generate_private_key(public_exponent=65537, key_size=2048)


def _create_handler(state: FakeOIDCState) -> type[BaseHTTPRequestHandler]:
    class FakeOIDCHandler(BaseHTTPRequestHandler):
        def _send_json(self, payload: object, status_code: int = 200) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:
            state.record_request()
            parsed = urlparse(self.path)
            if parsed.path == "/.well-known/openid-configuration":
                with state.lock:
                    discovery_status = state.discovery_status_code
                if discovery_status != 200:
                    self._send_json({"error": "unavailable"}, discovery_status)
                    return
                self._send_json(state.discovery_document())
                return
            if parsed.path == "/jwks":
                self._send_json({"keys": [state.jwk()]})
                return
            if parsed.path == "/authorize":
                query = parse_qs(parsed.query)
                redirect_uri = query.get("redirect_uri", [""])[0]
                state_value = query.get("state", [""])[0]
                location = f"{redirect_uri}?code=fake-auth-code&state={state_value}"
                self.send_response(302)
                self.send_header("Location", location)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            self._send_json({"error": "not found"}, 404)

        def do_POST(self) -> None:
            state.record_request()
            parsed = urlparse(self.path)
            if parsed.path != "/token":
                self._send_json({"error": "not found"}, 404)
                return
            content_length = int(self.headers.get("Content-Length", "0"))
            form = parse_qs(self.rfile.read(content_length).decode("utf-8"))
            nonce = form.get("nonce", [None])[0]
            self._send_json(
                {
                    "access_token": "fake-access-token",
                    "token_type": "Bearer",
                    "expires_in": 3600,
                    "id_token": state.build_id_token(nonce=nonce),
                }
            )

        def log_message(self, format: str, *args: object) -> None:
            return

    return FakeOIDCHandler


@contextmanager
def serve_fake_oidc_idp(
    *,
    subject: str = "oidc-contract-subject",
    client_id: str = "contract-oidc-client",
    token_claims_overrides: Mapping[str, Any] | None = None,
) -> Iterator[FakeOIDCServer]:
    signing_key = create_fake_oidc_private_key()
    state = FakeOIDCState(
        signing_key=signing_key,
        key_id="fake-oidc-key",
        issuer="http://127.0.0.1:0",
        client_id=client_id,
        subject=subject,
        token_claims_overrides=dict(token_claims_overrides or {}),
    )
    handler = _create_handler(state)
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address
    state.issuer = f"http://{host}:{port}"

    try:
        yield FakeOIDCServer(endpoint=f"http://{host}:{port}", state=state)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
