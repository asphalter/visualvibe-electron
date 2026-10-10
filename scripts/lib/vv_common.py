#!/usr/bin/env python3
"""
vv_common.py — shared state & helpers for VisualVibe Electron boot scripts.

Every numbered boot script (scripts/boot/0NN_*.py) imports from this module so the
same constants (home dir, AI endpoint/key/language) are computed once and
consistently, instead of being duplicated in every script.

Usage (at the top of each boot script):
    import sys, os
    sys.path.insert(0, "/opt/visualvibe/scripts/lib")
    from vv_common import HOME, api_url, api_key, ai_lang, discover_projects
"""
import os

HOME = "/home/vvelectron"


def _env(name, default=""):
    return os.environ.get(name, default).strip()


# ── AI endpoint / key / language (from environment) ─────────────────────────
api_url = _env("AI_API_URL")
api_key = _env("AI_API_KEY")
ai_lang = _env("AI_LANG")   # ISO code (e.g. "it", "en") — used by Zoo Code


# ── Zoo Code language mapping (1:1 with Zoo Code's language enum) ───────────
# Zoo Code 3.86 supports exactly these language codes (its `language` enum).
ZOO_LANG_CODES = {
    "ca", "de", "en", "es", "fr", "hi", "id", "it", "ja", "ko", "nl",
    "pl", "pt-BR", "ru", "tr", "vi", "zh-CN", "zh-TW",
}

# Convenience aliases accepted for AI_LANG, mapped to canonical Zoo Code codes
# (kept for backward compatibility with the historical README values).
ZOO_LANG_ALIASES = {"pt": "pt-BR", "zh": "zh-CN"}


def zoo_lang(code=None):
    """Map an AI_LANG value 1:1 onto Zoo Code's language enum (fallback 'en').

    Unsupported values (e.g. 'ar', which Zoo Code does not provide) fall back to
    English. The result is always one of ZOO_LANG_CODES.
    """
    c = (ai_lang if code is None else code).strip()
    # Normalize case: base part lowercased, region suffix uppercased, so
    # "pt-br"/"PT-BR"/"zh-cn" canonicalize to "pt-BR"/"zh-CN"/"zh-TW".
    if "-" in c:
        base, region = c.split("-", 1)
        c = base.lower() + "-" + region.upper()
    else:
        c = c.lower()
    c = ZOO_LANG_ALIASES.get(c, c)
    return c if c in ZOO_LANG_CODES else "en"


# ── Project discovery under the workspace root ──────────────────────────────
import json


def _load_ignored_dirs():
    candidates = [
        "/opt/visualvibe/config/ignored-dirs.json",
        os.path.join(os.path.dirname(__file__), "..", "..", "config", "ignored-dirs.json"),
    ]
    for p in candidates:
        if os.path.isfile(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    return set(json.load(f))
            except Exception:
                pass
    return {"tmp", ".git", ".vscode", "node_modules", "__pycache__", "VisualVibe Workdirs"}


_IGNORED_DIRS = _load_ignored_dirs()


def discover_projects(workdirs_path):
    """Return [(name, full_path), ...] for each project folder under workdirs_path."""
    projects = []
    if os.path.isdir(workdirs_path):
        try:
            for entry_name in sorted(os.listdir(workdirs_path)):
                if entry_name.startswith(".") or entry_name in _IGNORED_DIRS:
                    continue
                entry_full = os.path.join(workdirs_path, entry_name)
                if os.path.isdir(entry_full):
                    projects.append((entry_name, entry_full))
        except Exception:
            pass
    return projects


# ── Zoo Code extension discovery (newest version wins) ──────────────────────
def latest_zoo_ext_dir():
    """Return the newest-versioned Zoo Code extension dir under code-server, or None.

    Directory names look like ``zoocodeorganization.zoo-code-3.86.0-universal``.
    Prefer the highest numeric version so an upgraded extension (installed by
    002_zoo-fallback.sh) is patched/seeded instead of a stale staged copy.
    """
    import glob as _glob
    import re as _re
    dirs = _glob.glob(os.path.join(HOME, ".local/share/code-server/extensions/zoocodeorganization.zoo-code-*"))

    def _ver(p):
        m = _re.search(r"zoo-code-(\d+)\.(\d+)\.(\d+)", os.path.basename(p))
        return tuple(int(x) for x in m.groups()) if m else (0, 0, 0)

    return max(dirs, key=_ver) if dirs else None
