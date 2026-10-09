#!/usr/bin/env python3
"""
006_preseed-workspace.py — boot — pre-seed VS Code workspaceStorage (Secondary Side Bar
visible with Zoo Code, onboarding skipped) for the home folder and every project.
NOTE: the workspaceStorage folder hash (md5 of path+inode) mirrors code-server internals
and may change across code-server versions (008 also migrates existing workspace DBs).
"""
import sys, os
sys.path.insert(0, "/opt/visualvibe/scripts/lib")
from vv_common import HOME, discover_projects
import json
import sqlite3
import hashlib


def _vscode_folder_hash(fs_path):
    """Compute the code-server workspaceStorage folder hash for a local folder."""
    try:
        ino = str(os.stat(fs_path).st_ino)
    except OSError:
        ino = ""
    h = hashlib.md5()
    h.update(fs_path.encode("utf-8"))
    if ino:
        h.update(ino.encode("utf-8"))
    return h.hexdigest()


_workdirs_path = os.path.join(HOME, "VisualVibe Workdirs")
_home_path = HOME

ws_configs = [
    (_vscode_folder_hash(_home_path), f"file://{_home_path}"),
]

for _name, _full in discover_projects(_workdirs_path):
    ws_configs.append((_vscode_folder_hash(_full), f"file://{_full.replace(' ', '%20')}"))

for ws_hash, folder_uri in ws_configs:
    ws_dir = os.path.join(HOME, f".local/share/code-server/User/workspaceStorage/{ws_hash}")
    os.makedirs(ws_dir, exist_ok=True)
    try:
        with open(os.path.join(ws_dir, "workspace.json"), "w", encoding="utf-8") as f:
            json.dump({"folder": folder_uri}, f, indent=2)
    except Exception:
        pass

    try:
        ws_db = os.path.join(ws_dir, "state.vscdb")
        ws_conn = sqlite3.connect(ws_db)
        ws_cur = ws_conn.cursor()
        ws_cur.execute("CREATE TABLE IF NOT EXISTS ItemTable (key TEXT PRIMARY KEY, value TEXT)")
        aux_panel_id = "workbench.view.extension.zoo-code-ActivityBar"
        ws_cur.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (\"workbench.auxiliarybar.activepanelid\", ?)", (json.dumps(aux_panel_id),))
        ws_cur.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (\"workbench.auxiliarybar.viewContainersWorkspaceState\", ?)", (json.dumps([{"id": aux_panel_id, "visible": True}]),))
        ws_cur.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (\"workbench.auxiliaryBar.hidden\", \"false\")")
        ws_cur.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (\"workbench.auxiliarybar.pinnedPanels\", ?)", (json.dumps([{"id": aux_panel_id, "pinned": True, "visible": True, "order": 0}]),))
        ws_cur.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (\"welcomeOnboarding.state\", \"true\")")
        # Ensure secondary sidebar (auxiliary bar) and primary sidebar are visible for this workspace
        ws_cur.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (\"workbench.secondarySideBar.visible\", \"true\")")
        ws_cur.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (\"workbench.sideBar.hidden\", \"false\")")
        ws_conn.commit()
        ws_conn.close()
    except Exception as e:
        print(f"[Init] Warning: Could not pre-seed workspaceStorage {ws_hash}: {e}")
