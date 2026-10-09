#!/usr/bin/env python3
"""
005_cache-bust-workbench.py — boot — append a content hash of the (already patched)
workbench.js to the <script src> in workbench.html so a rebuilt image is never
served stale by browser/CDN caches (code-server serves workbench.js with a 1-year
Cache-Control on a build-hash URL that only changes on version bumps).
"""
import glob
import hashlib as _vv_hashlib
import re as _vv_re

_vv_wb_hash = ""
for _vv_wb in glob.glob("/usr/lib/code-server/lib/vscode/out/vs/code/browser/workbench/workbench.js"):
    try:
        with open(_vv_wb, "rb") as _vv_f:
            _vv_wb_hash = _vv_hashlib.sha256(_vv_f.read()).hexdigest()[:12]
    except Exception as _vv_e:
        print(f"[Init] Warning: could not hash workbench.js for cache-busting: {_vv_e}")

for _vv_html in glob.glob("/usr/lib/code-server/lib/vscode/out/vs/code/browser/workbench/workbench.html"):
    try:
        if not _vv_wb_hash:
            print("[Init] Warning: skipping workbench.html cache-buster (no workbench.js hash).")
            continue
        with open(_vv_html, "r", encoding="utf-8") as _vv_f:
            _vv_content = _vv_f.read()
        _vv_plain = 'src="{{WORKBENCH_WEB_BASE_URL}}/out/vs/code/browser/workbench/workbench.js"'
        _vv_busted = 'src="{{WORKBENCH_WEB_BASE_URL}}/out/vs/code/browser/workbench/workbench.js?v=%s"' % _vv_wb_hash
        if _vv_plain in _vv_content:
            _vv_content = _vv_content.replace(_vv_plain, _vv_busted, 1)
            with open(_vv_html, "w", encoding="utf-8") as _vv_f:
                _vv_f.write(_vv_content)
            print(f"[Init] Patched code-server workbench.html: workbench.js cache-buster v={_vv_wb_hash}.")
        elif "workbench.js?v=" in _vv_content:
            _vv_updated = _vv_re.sub(r'workbench\.js\?v=[A-Za-z0-9]+', 'workbench.js?v=%s' % _vv_wb_hash, _vv_content, count=1)
            if _vv_updated != _vv_content:
                with open(_vv_html, "w", encoding="utf-8") as _vv_f:
                    _vv_f.write(_vv_updated)
                print(f"[Init] Updated code-server workbench.html cache-buster to v={_vv_wb_hash}.")
            else:
                print("[Init] code-server workbench.html cache-buster already current.")
        else:
            print("[Init] Warning: code-server workbench.html script anchor not found.")
    except Exception as _vv_e:
        print(f"[Init] Warning: could not cache-bust workbench.html: {_vv_e}")
