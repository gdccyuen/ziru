# 03 — External Identity Provider (AD/SSO) Research

Type: research
Status: resolved
Resolved: 2026-08-18 (charting session, research subagent)
Blocked by: —

## Question

For a self-hosted FastAPI + Next.js stack (no internet required at runtime), what are the standard, mature ways to support SSO with an external identity provider such as Active Directory?

- LDAP bind vs OIDC/OAuth2 (AD FS / Entra / Keycloak) vs SAML — trade-offs for on-prem deployments.
- Mature Python/Node libraries and their maintenance status; primary-source documentation for each.
- Recommended integration point given the single identity store in core: link an external identity to a local user (auto-provision?), keeping local grades and profiles authoritative.
- A concrete recommendation.

Deliverable: findings as a Markdown file on the throwaway branch `research/external-identity-provider` at `.scratch/decouple-account-knowledge/research/external-identity-provider.md`, each claim cited to its source. The recommendation is confirmed with the PM when ticket 02 is worked.

## Answer

Research complete (subagent, background). Findings committed on branch `research/external-identity-provider` (commit `f12e5be`), file `.scratch/decouple-account-knowledge/research/external-identity-provider.md` (157 lines, sources cited).

**Decision for ticket 02:**
- Primary SSO protocol: **OIDC authorization-code flow + PKCE**, with the core FastAPI API as the OIDC relying party (Authlib or openid-client behind a provider-agnostic seam). Works fully offline with on-prem IdPs (AD FS, Keycloak both speak OIDC natively).
- Fallback for plain AD DS shops with no federation service: **LDAP bind** (python-ldap or ldap3) on the same seam as a non-redirect login method.
- Avoid **SAML** unless the enterprise IdP mandates it.
- SSO handshake lives in **core** (single identity store, Q9): `external_identity_links(provider, provider_subject)` maps IdP identities to local users; configurable auto-provision (default grade `user`); local grades/profiles remain authoritative — SSO proves who you are, never what you may do.
- WebUI keeps only thin proxy/redirect routes to core's `/auth/sso/*`; core's existing JWT/JWKS verification extends to ID-token validation.
- Caveat: library versions (python-ldap 3.x, Authlib 1.6.x, openid-client v6) cited to PyPI/GitHub release pages — re-verify at implementation.

Open item for ticket 02: the PM confirms the primary/fallback choice and the auto-provision default when 02 is worked.
