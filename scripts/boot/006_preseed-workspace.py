#!/usr/bin/env python3
"""
006_preseed-workspace.py — boot — pre-seed VSCodium workspaceStorage (Secondary Side Bar
visible with Zoo Code, onboarding skipped) for the home folder and every project.
Populates ~/.config/VSCodium/User/workspaceStorage.
"""
import sys, os
sys.path.insert(0, "/opt/visualvibe/scripts/lib")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
from vv_common import VV_HOME, VV_WORKDIRS, VSCODIUM_USER_DIR, discover_projects
import json
import sqlite3
import hashlib


def _vscode_folder_hashes(fs_path):
    """Compute possible workspaceStorage folder hashes."""
    hashes = []
    try:
        ino = str(os.stat(fs_path).st_ino)
    except OSError:
        ino = ""
    if ino:
        h_ino = hashlib.md5()
        h_ino.update(fs_path.encode("utf-8"))
        h_ino.update(ino.encode("utf-8"))
        hashes.append(h_ino.hexdigest())

    h_path = hashlib.md5()
    h_path.update(fs_path.encode("utf-8"))
    digest = h_path.hexdigest()
    if digest not in hashes:
        hashes.append(digest)
    return hashes


_workdirs_path = VV_WORKDIRS
_home_path = VV_HOME

# Ensure VisualVibe Workdirs directory exists so inode hashing succeeds
os.makedirs(_workdirs_path, exist_ok=True)

ws_configs = []
# Pre-seed VisualVibe Workdirs as the primary default workspace folder
for h in _vscode_folder_hashes(_workdirs_path):
    ws_configs.append((h, f"file://{_workdirs_path.replace(' ', '%20')}"))

# Pre-seed home folder for compatibility
for h in _vscode_folder_hashes(_home_path):
    ws_configs.append((h, f"file://{_home_path}"))

for _name, _full in discover_projects(_workdirs_path):
    for h in _vscode_folder_hashes(_full):
        ws_configs.append((h, f"file://{_full.replace(' ', '%20')}"))

target_storage_roots = [
    os.path.join(VSCODIUM_USER_DIR, "workspaceStorage"),
]

for root_dir in target_storage_roots:
    for ws_hash, folder_uri in ws_configs:
        ws_dir = os.path.join(root_dir, ws_hash)
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
            ws_cur.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (\"workbench.secondarySideBar.visible\", \"true\")")
            ws_cur.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (\"workbench.activityBar.visible\", \"true\")")
            ws_conn.commit()
            ws_conn.close()
        except Exception:
            pass
