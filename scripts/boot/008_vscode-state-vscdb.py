#!/usr/bin/env python3
"""
008_vscode-state-vscdb.py — boot — configure VSCodium globalStorage/state.vscdb with the
Secondary Side Bar layout (Zoo Code on the right) and the Activity Bar pinned viewlets
order (VisualVibe Projects first); then migrate & enforce the layout on all existing
workspaceStorage DBs.
"""
import sys, os
sys.path.insert(0, "/opt/visualvibe/scripts/lib")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
try:
    from vv_common import VV_HOME, VV_WORKDIRS, VSCODIUM_DATA, VSCODIUM_USER_DIR
except ImportError:
    VV_HOME = os.path.expanduser("~")
    VV_WORKDIRS = os.path.join(VV_HOME, "VisualVibe Workdirs")
    VSCODIUM_DATA = os.path.join(VV_HOME, ".vscode-oss")
    VSCODIUM_USER_DIR = os.path.join(VV_HOME, ".config/VSCodium/User")
import json
import glob
import sqlite3

target_dirs = [
    VSCODIUM_USER_DIR,
    os.path.join(VV_HOME, ".config/Code/User"),
    VSCODIUM_DATA,
]

aux_panel_id = "workbench.view.extension.zoo-code-ActivityBar"
pinned_panels = [{"id": aux_panel_id, "pinned": True, "visible": True, "order": 0}]

# Pinned Activity Bar order: Projects Picker first, then Explorer, Search, Source Control
# Zoo Code is explicitly NOT included in the Primary Activity Bar
pinned_viewlets = [
    {"id": "workbench.view.extension.visualvibe-projects", "pinned": True, "visible": True, "order": 0},
    {"id": "workbench.view.explorer", "pinned": True, "visible": True, "order": 1},
    {"id": "workbench.view.search", "pinned": True, "visible": True, "order": 2},
    {"id": "workbench.view.scm", "pinned": True, "visible": True, "order": 3}
]

views_customizations = {
    "viewContainerLocations": {
        aux_panel_id: 2,
        "zoo-code-ActivityBar": 2
    },
    "viewLocations": {
        "zoo-code.SidebarProvider": aux_panel_id
    },
    "viewContainerBadgeEnablementStates": {}
}

common_items = {
    # Layout and visibility
    "auxiliaryBar.hidden": "false",
    "workbench.auxiliarybar.hidden": "false",
    "workbench.auxiliaryBar.hidden": "false",
    "workbench.secondarySideBar.visible": "true",
    "workbench.secondarySideBar.active": "true",
    "workbench.secondarySideBar.defaultVisibility": "visible",
    "workbench.sideBar.hidden": "false",
    "workbench.activityBar.visible": "true",
    "welcomeOnboarding.state": "true",
    "auxiliaryBar.size": "350",

    # Secondary Side Bar pinned panels and active item
    "workbench.auxiliarybar.pinnedPanels": json.dumps(pinned_panels),
    "workbench.secondarySideBar.pinnedPanels": json.dumps(pinned_panels),
    "workbench.panel.pinnedPanels": json.dumps(pinned_panels),
    "workbench.auxiliarybar.activepanelid": json.dumps(aux_panel_id),
    "workbench.auxiliarybar.viewContainersWorkspaceState": json.dumps([{"id": aux_panel_id, "visible": True}]),

    # View customizations routing Zoo Code to Secondary Side Bar (location 2 = AuxiliaryBar)
    "views.customizations": json.dumps(views_customizations),
    "views.cachedViewContainerLocations": json.dumps([[aux_panel_id, 2], ["zoo-code-ActivityBar", 2]]),
    "views.cachedViewPositions": json.dumps([["zoo-code.SidebarProvider", {"containerId": aux_panel_id, "order": 0}]]),

    # Primary Activity Bar pinned items (excluding Zoo Code)
    "workbench.activity.pinnedViewlets2": json.dumps(pinned_viewlets),
}

def apply_items_to_db(db_path):
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute("CREATE TABLE IF NOT EXISTS ItemTable (key TEXT PRIMARY KEY, value TEXT)")

        for k, v in common_items.items():
            cur.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)", (k, v))

        conn.commit()
        conn.close()
        print(f"[Init] Successfully configured Secondary Side Bar & Activity Bar in {db_path}")
    except Exception as e:
        print(f"[Init] Warning configuring state.vscdb in {db_path}: {e}")

def seed_global_recent_paths(global_db):
    try:
        conn = sqlite3.connect(global_db)
        cur = conn.cursor()
        cur.execute("CREATE TABLE IF NOT EXISTS ItemTable (key TEXT PRIMARY KEY, value TEXT)")
        cur.execute("SELECT value FROM ItemTable WHERE key = 'history.recentlyOpenedPathsList'")
        row = cur.fetchone()
        if not row:
            recent_data = {
                "entries": [
                    {"folderUri": f"file://{VV_WORKDIRS.replace(' ', '%20')}"}
                ]
            }
            cur.execute(
                "INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('history.recentlyOpenedPathsList', ?)",
                (json.dumps(recent_data),)
            )
            conn.commit()
        conn.close()
    except Exception as e:
        print(f"[vscode-state] Warning: failed to seed recent paths in {global_db}: {e}")

for user_dir in target_dirs:
    # 1. Global storage DB
    global_db = os.path.join(user_dir, "globalStorage", "state.vscdb")
    apply_items_to_db(global_db)
    seed_global_recent_paths(global_db)

    # 2. Profiles DBs if any
    for prof_db in glob.glob(os.path.join(user_dir, "profiles/*/state.vscdb")):
        apply_items_to_db(prof_db)

    # 3. Workspace storage DBs
    for ws_db in glob.glob(os.path.join(user_dir, "workspaceStorage/*/state.vscdb")):
        apply_items_to_db(ws_db)
