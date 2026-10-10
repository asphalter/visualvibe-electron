# ==============================================================================
# patch_anchors.py — Centralized Registry of Runtime Patches & Anchors
# ==============================================================================
"""
Defines targets, expected anchor patterns, and verification tests for runtime
patches applied to third-party code (code-server workbench and Zoo Code extension).

Version: 1.2.0 (compatible with code-server 4.140.0 / Zoo Code 3.86.0)
"""
import os

CODE_SERVER_WORKBENCH_PATH = "/usr/lib/code-server/lib/vscode/out/vs/code/browser/workbench/workbench.js"

WORKBENCH_PATCH_VERIFICATIONS = [
    {
        "id": "shouldBeHidden",
        "description": "Force shouldBeHidden() to never hide visualvibe-projects",
        "expected_substring": 'if(n==="workbench.view.extension.visualvibe-projects")return!1'
    },
    {
        "id": "shouldBeHidden-hide-chat",
        "description": "Force shouldBeHidden() to always hide workbench.panel.chat (Copilot)",
        "expected_substring": 'if(n==="workbench.panel.chat")return!0;'
    },
    {
        "id": "addComposite",
        "description": "Force requestedIndex:0 for visualvibe-projects in addComposite",
        "expected_substring": 'requestedIndex:e.id==="workbench.view.extension.visualvibe-projects"?0:e.requestedIndex'
    },
    {
        "id": "registerCustomViewContainer",
        "description": "Force order -1 for visualvibe-projects in registerCustomViewContainer",
        "expected_substring": 'r.id==="visualvibe-projects"?-1:t++'
    },
    {
        "id": "CompositeBarModel.add",
        "description": "Prepend visualvibe-projects to index 0 in CompositeBarModel",
        "expected_substring": 'if(o==="workbench.view.extension.visualvibe-projects"){let x=this.items.indexOf(n)'
    },
    {
        "id": "getPinnedViewContainers",
        "description": "Force visualvibe-projects to head of getPinnedViewContainers",
        "expected_substring": 'x.id==="workbench.view.extension.visualvibe-projects"'
    },
    {
        "id": "getPinnedViewContainers-filter-chat",
        "description": "Filter out workbench.panel.chat from getPinnedViewContainers",
        "expected_substring": 'x.id!=="workbench.panel.chat"'
    },
    {
        "id": "chatIsDefaultFalse",
        "description": "Unset isDefault on core Chat container registration",
        "expected_substring": '{isDefault:!1,'
    },
    {
        "id": "chatViewsNeutralized",
        "description": "Do not register views under Chat container so hideIfEmpty takes effect",
        "expected_substring": '.registerViews([],ZTe)'
    },
    {
        "id": "chatStatusBarDisabled",
        "description": "Disable Copilot status bar entry registration",
        "expected_substring": 'this.entry=null;if(false)this.entry='
    }
]

ZOO_CODE_VERIFICATIONS = [
    {
        "id": "zoo-sidebar-moved",
        "description": "Zoo Code view container moved to secondarySidebar in package.json",
        "check": "check_zoo_package_json"
    },
    {
        "id": "zoo-profiles-seed",
        "description": "Zoo Code configuration profiles seed marker in extension.js",
        "expected_substring": "/*[VisualVibe profiles seed"
    }
]
