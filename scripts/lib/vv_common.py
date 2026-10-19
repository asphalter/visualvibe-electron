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
import re
import sys

def _env(name, default=""):
    return os.environ.get(name, default).strip()


# ── Centralized paths & environment constants ─────────────────────────────────
VV_USER = _env("VV_USER", "vvelectron")
VV_HOME = _env("VV_HOME", f"/home/{VV_USER}")
HOME = VV_HOME  # Backward compatibility
VV_BASE = _env("VV_BASE", "/opt/visualvibe")
VV_WORKDIRS = _env("VV_WORKDIRS", os.path.join(VV_HOME, "VisualVibe Workdirs"))
KASMVNC_WWW_DIR = _env("KASMVNC_WWW_DIR", "/usr/share/kasmvnc/www")
VSCODIUM_DATA = _env("VSCODIUM_DATA", os.path.join(VV_HOME, ".vscode-oss"))
VSCODIUM_EXTENSIONS = _env("VSCODIUM_EXTENSIONS", os.path.join(VSCODIUM_DATA, "extensions"))
VSCODIUM_CONFIG = _env("VSCODIUM_CONFIG", os.path.join(VV_HOME, ".config/VSCodium"))
VSCODIUM_USER_DIR = _env("VSCODIUM_USER_DIR", os.path.join(VSCODIUM_CONFIG, "User"))
VV_CONFIG = _env("VV_CONFIG", os.path.join(VV_BASE, "config"))
VV_MEDIA = _env("VV_MEDIA", os.path.join(VV_BASE, "media"))
VV_EXTENSIONS = _env("VV_EXTENSIONS", os.path.join(VV_BASE, "extensions"))
VV_SCRIPTS = _env("VV_SCRIPTS", os.path.join(VV_BASE, "scripts"))
VV_BOOT_DIR = _env("VV_BOOT_DIR", os.path.join(VV_SCRIPTS, "boot"))
VV_BUILD_DIR = _env("VV_BUILD_DIR", os.path.join(VV_SCRIPTS, "build"))
VV_LIB_DIR = _env("VV_LIB_DIR", os.path.join(VV_SCRIPTS, "lib"))


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
        os.path.join(VV_CONFIG, "ignored-dirs.json"),
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
    """Return the newest-versioned Zoo Code extension dir under VSCodium, or None.

    Directory names look like ``zoocodeorganization.zoo-code-3.88.0-universal``.
    Prefer the highest numeric version so an upgraded extension (installed by
    002_zoo-fallback.sh) is seeded instead of a stale staged copy.
    """
    import glob as _glob
    import re as _re
    dirs = _glob.glob(os.path.join(VSCODIUM_EXTENSIONS, "zoocodeorganization.zoo-code-*"))

    def _ver(p):
        m = _re.search(r"zoo-code-(\d+)\.(\d+)\.(\d+)", os.path.basename(p))
        return tuple(int(x) for x in m.groups()) if m else (0, 0, 0)

    return max(dirs, key=_ver) if dirs else None


# ── Patch validation framework ──────────────────────────────────────────────
class PatchResult:
    def __init__(self, name: str, critical: bool = True, log_level: str = "WARN"):
        self.name = name          # Nome descrittivo del patch
        self.critical = critical  # Se True, il fallimento è un errore; se False, un warning
        self.log_level = log_level.upper()  # Livello di log per fallimento non critico
        self.expected = 0         # Match attesi (>= 1)
        self.found = 0            # Match trovati
        self.applied = 0          # Sostituzioni effettuate

    def is_ok(self) -> bool:
        return self.applied > 0


class PatchTracker:
    def __init__(self, script_name: str, compat_version: str = ""):
        self.script_name = script_name
        self.compat_version = compat_version  # Versione software validata
        self.results: list[PatchResult] = []

    def tracked_sub(self, pattern, repl, string: str, name: str, critical: bool = True, count: int = 0, flags: int = 0, log_level: str = "WARN") -> str:
        """Wrapper di re.sub() che traccia i risultati"""
        res = PatchResult(name, critical=critical, log_level=log_level)
        res.expected = 1
        new_string, n = re.subn(pattern, repl, string, count=count, flags=flags)
        res.found = n
        res.applied = n
        self.results.append(res)
        return new_string

    def tracked_replace(self, text: str, old: str, new: str, name: str, critical: bool = True, count: int = -1, log_level: str = "WARN") -> str:
        """Wrapper di str.replace() che traccia i risultati"""
        res = PatchResult(name, critical=critical, log_level=log_level)
        res.expected = 1
        found = text.count(old)
        res.found = found
        if count == -1:
            new_text = text.replace(old, new)
            res.applied = found
        else:
            new_text = text.replace(old, new, count)
            res.applied = min(found, count)
        self.results.append(res)
        return new_text

    def report(self) -> None:
        """Stampa report finale con routing:
           [VV-PATCH] <script>: 15/17 patches applicati con successo (STDOUT)
           [VV-PATCH-OK] <name>: applicato (N match) (STDOUT)
           [VV-PATCH-DEBUG] <name>: pattern non trovato (atteso, non critico, log_level=DEBUG) (STDOUT)
           [VV-PATCH-WARN] <name>: pattern non trovato (non critico) (STDERR)
           [VV-PATCH-FAIL] <name>: FALLITO — pattern non trovato (CRITICO) (STDERR)
        """
        ok_count = sum(1 for r in self.results if r.is_ok())
        total = len(self.results)
        print(f"[VV-PATCH] {self.script_name}: {ok_count}/{total} patches applicati con successo", file=sys.stdout)
        for r in self.results:
            if r.is_ok():
                print(f"[VV-PATCH-OK] {r.name}: applicato ({r.applied} match)", file=sys.stdout)
            elif r.critical:
                print(f"[VV-PATCH-FAIL] {r.name}: FALLITO — pattern non trovato (CRITICO)", file=sys.stderr)
            elif getattr(r, "log_level", "WARN") == "DEBUG":
                print(f"[VV-PATCH-DEBUG] {r.name}: pattern non trovato (atteso, non critico)", file=sys.stdout)
            else:
                print(f"[VV-PATCH-WARN] {r.name}: pattern non trovato (non critico)", file=sys.stderr)

    def has_critical_failures(self) -> bool:
        """Ritorna True se almeno un patch critico è fallito"""
        return any(r.critical and not r.is_ok() for r in self.results)

    def exit_if_failures(self) -> None:
        """Chiama report() e sys.exit(1) se ci sono fallimenti critici"""
        self.report()
        if self.has_critical_failures():
            sys.exit(1)
