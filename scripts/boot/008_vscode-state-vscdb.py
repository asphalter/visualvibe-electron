#!/usr/bin/env python3
"""
008_vscode-state-vscdb.py — boot — configure VS Code globalStorage/state.vscdb with the
Secondary Side Bar layout (Zoo Code on the right) and the Activity Bar pinned viewlets
order (VisualVibe Projects first); then migrate & enforce the layout on all existing
workspaceStorage DBs. (Zoo Code language is seeded by 011_zoo-seed-profiles.py.)
"""
import sys, os
sys.path.insert(0, "/opt/visualvibe/scripts/lib")
from vv_common import HOME
import json
import glob
import sqlite3

db_dir  = os.path.join(HOME, ".local/share/code-server/User/globalStorage")
db_path = os.path.join(db_dir, "state.vscdb")
os.makedirs(db_dir, exist_ok=True)

try:
    conn = sqlite3.connect(db_path)
    cur  = conn.cursor()
    cur.execute("CREATE TABLE IF NOT EXISTS ItemTable (key TEXT PRIMARY KEY, value TEXT)")

    aux_panel_id = "workbench.view.extension.zoo-code-ActivityBar"
    pinned_panels = [{"id": aux_panel_id, "pinned": True, "visible": True, "order": 0}]

    items = {}

    # Note: Zoo Code "Configuration Profiles" are NOT seeded here. They live in VS Code
    # SecretStorage (context.secrets, key "roo_cline_config_api_config"), which code-server
    # does not expose via state.vscdb (no OS keyring → in-memory/browser-encrypted). The
    # profiles are instead seeded by 011_zoo-seed-profiles.py, which patches Zoo Code's
    # extension.js to write them from AI_API_URL/AI_API_KEY at activation time.

    # Layout: Secondary Side Bar (right) hosts Zoo Code; primary sidebar visible
    items["workbench.auxiliarybar.pinnedPanels"] = json.dumps(pinned_panels)
    items["workbench.auxiliarybar.activepanelid"] = json.dumps(aux_panel_id)
    items["workbench.auxiliarybar.hidden"] = "false"
    items["workbench.auxiliaryBar.hidden"] = "false"
    items["workbench.secondarySideBar.visible"] = "true"
    items["workbench.sideBar.hidden"] = "false"
    items["workbench.sidebar.hidden"] = "false"
    items["welcomeOnboarding.state"] = "true"

    # NOTE: pinnedViewlets2/placeholderViewlets below are best-effort only — in
    # code-server the real Activity Bar order lives in the browser's IndexedDB and is
    # enforced by 004_patch-workbench-activitybar.py (JS patches on workbench.js).
    # Layout: Primary Activity Bar order (visualvibe-projects as FIRST icon, order: 0)
    pinned_viewlets = [
        {"id": "workbench.view.extension.visualvibe-projects", "pinned": True, "visible": True, "order": 0},
        {"id": "workbench.view.explorer",                      "pinned": True, "visible": True, "order": 1},
        {"id": "workbench.view.search",                        "pinned": True, "visible": True, "order": 2},
        {"id": "workbench.view.scm",                           "pinned": True, "visible": True, "order": 3},
        {"id": "workbench.view.debug",                         "pinned": True, "visible": True, "order": 4},
        {"id": "workbench.view.extensions",                    "pinned": True, "visible": True, "order": 5},
        {"id": "workbench.view.extension.visualvibe-nav",      "pinned": True, "visible": True, "order": 6},
    ]
    items["workbench.activity.pinnedViewlets2"] = json.dumps(pinned_viewlets)

    # Pre-register placeholder viewlets so code-server places visualvibe-projects first during early startup
    placeholder_viewlets = [
        {"id": "workbench.view.extension.visualvibe-projects", "name": "Projects", "isBuiltin": False, "views": []},
        {"id": "workbench.view.explorer",                      "name": "Explorer", "isBuiltin": True,  "views": []},
        {"id": "workbench.view.search",                        "name": "Search",   "isBuiltin": True,  "views": []},
        {"id": "workbench.view.scm",                           "name": "SCM",      "isBuiltin": True,  "views": []},
        {"id": "workbench.view.debug",                         "name": "Debug",    "isBuiltin": True,  "views": []},
        {"id": "workbench.view.extensions",                    "name": "Extensions", "isBuiltin": True, "views": []},
        {"id": "workbench.view.extension.visualvibe-nav",      "name": "Navigator",  "isBuiltin": False, "views": [{"when": ""}]},
    ]
    items["workbench.activity.placeholderViewlets"] = json.dumps(placeholder_viewlets)

    for k, v in items.items():
        cur.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)", (k, v))

    conn.commit()
    conn.close()
    print("[Init] Zoo Code state & layout pre-configured in state.vscdb.")

    # ── Migrate and enforce sidebar visibility & pinned viewlets on all existing workspaces ──
    ws_dbs = glob.glob(os.path.join(HOME, ".local/share/code-server/User/workspaceStorage/*/state.vscdb"))
    for ws_db in ws_dbs:
        try:
            ws_conn = sqlite3.connect(ws_db)
            ws_cur = ws_conn.cursor()
            ws_cur.execute("CREATE TABLE IF NOT EXISTS ItemTable (key TEXT PRIMARY KEY, value TEXT)")

            ws_cur.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('workbench.sideBar.hidden', 'false')")
            ws_cur.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('workbench.sidebar.hidden', 'false')")
            ws_cur.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('workbench.auxiliaryBar.hidden', 'false')")
            ws_cur.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('workbench.auxiliarybar.hidden', 'false')")
            ws_cur.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('workbench.secondarySideBar.visible', 'true')")
            ws_cur.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('welcomeOnboarding.state', 'true')")

            row = ws_cur.execute("SELECT value FROM ItemTable WHERE key='workbench.activity.pinnedViewlets2'").fetchone()
            if row and row[0]:
                try:
                    pv_list = json.loads(row[0])
                    if isinstance(pv_list, list):
                        proj_entry = None
                        remaining = []
                        for entry in pv_list:
                            if isinstance(entry, dict) and entry.get("id") == "workbench.view.extension.visualvibe-projects":
                                proj_entry = entry
                            else:
                                remaining.append(entry)
                        if not proj_entry:
                            proj_entry = {"id": "workbench.view.extension.visualvibe-projects", "pinned": True, "visible": True}
                        proj_entry["order"] = 0
                        proj_entry["pinned"] = True
                        proj_entry["visible"] = True

                        reordered = [proj_entry]
                        for idx, entry in enumerate(remaining, start=1):
                            if isinstance(entry, dict):
                                entry["order"] = idx
                            reordered.append(entry)

                        ws_cur.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('workbench.activity.pinnedViewlets2', ?)", (json.dumps(reordered),))
                except Exception:
                    pass

            ws_conn.commit()
            ws_conn.close()
        except Exception as ws_err:
            print(f"[Init] Warning: Could not update workspace DB {ws_db}: {ws_err}")
    if ws_dbs:
        print(f"[Init] Enforced sidebar visibility and layout on {len(ws_dbs)} existing workspaceStorage DBs.")
except Exception as e:
    print(f"[Init] Warning: Could not configure Zoo Code state DB: {e}")
