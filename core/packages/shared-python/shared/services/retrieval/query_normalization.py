"""Query-side spelling normalization (engine untouched)."""
from __future__ import annotations
import re
_VARIANTS: dict[str, tuple[str, ...]] = {
    "wi-fi": ("wifi", "wlan"),
    "e-mail": ("email",),
    "wi-fi 6": ("wifi6", "wifi 6"),
    "wi-fi 7": ("wifi7", "wifi 7"),
}
_WORD = re.compile(r"[a-z0-9]+")

def normalize_query(query: str) -> tuple[str, dict[str, str]]:
    """Rewrite known whole-word variants; return (normalized, rewrites)."""
    if not query:
        return query, {}
    tokens = _WORD.findall(query.lower())
    variant_to_canonical: dict[str, str] = {}
    for canonical, variants in _VARIANTS.items():
        for v in variants:
            variant_to_canonical[v] = canonical
    rewrites: dict[str, str] = {}
    out_tokens: list[str] = []
    for tok in tokens:
        canonical = variant_to_canonical.get(tok)
        if canonical is not None:
            if tok != canonical:
                rewrites[tok] = canonical
            out_tokens.append(canonical)
        else:
            out_tokens.append(tok)
    return " ".join(out_tokens), rewrites

__all__ = ["normalize_query"]