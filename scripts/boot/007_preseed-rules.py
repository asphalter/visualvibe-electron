#!/usr/bin/env python3
"""
007_preseed-rules.py — boot — pre-seed Zoo Code Global Rules (~/.roo/rules/visualvibe.md)
and workspace memory-bank/ folders (projectbrief, activeContext, progress, systemPatterns, techContext)
into every discovered project that does not already have them (idempotent).
"""
import sys, os
sys.path.insert(0, "/opt/visualvibe/scripts/lib")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
from vv_common import VV_HOME, VV_WORKDIRS, discover_projects

# ── 1. Global Zoo Code Rules (~/.roo/rules/visualvibe.md) ────────────────────
# Zoo Code loads global rules from ~/.roo/rules/*.md across all workspaces.
# Keeping VisualVibe directives here ensures they appear in the UI under "Global Rules"
# and prevents duplication across individual projects.
try:
    global_rules_dir = os.path.join(VV_HOME, ".roo", "rules")
    os.makedirs(global_rules_dir, exist_ok=True)
    global_rules_file = os.path.join(global_rules_dir, "visualvibe.md")

    global_rules_content = """# VisualVibe Rules — Global Directives

## 1. Memory Bank
At the start of every task or conversation in a project:
1. Read all files in the workspace's `memory-bank/` directory to gather the current context.
2. Pay close attention to `memory-bank/activeContext.md` and `memory-bank/progress.md`.
3. When completing architectural changes, milestones, or new features, update the corresponding `memory-bank/` files.

## 2. Project Directives
- Maintain existing folder structures and established coding patterns.
- Before implementing complex changes, present a clear plan and await user alignment when in plan mode.

## 3. Safe Execution — Ephemeral Podman Containers

Any operation requiring dependency installation, code compilation, test suite execution,
proof-of-concept trials, temporary development servers, or bulk downloads MUST be executed
inside ephemeral Podman containers, taking full advantage of the nested Podman-in-Podman runtime.

Never install packages or global dependencies directly into the main container's filesystem
to prevent polluting the persistent host environment.

### Standard Patterns

```bash
# Execute and automatically remove container (--rm) mounting workspace
podman run --rm -v "$(pwd):/workspace:z" -w /workspace <image> <command>

# Execute with temporary port exposure
podman run --rm -v "$(pwd):/workspace:z" -w /workspace -p <port>:<port> <image> <command>
```

### Recommended Images

- **Python**: `python:3.12-slim`
- **Node.js**: `node:22-slim`
- **Rust**: `rust:slim`
- **Go**: `golang:alpine`
- **C/C++**: `gcc:latest` or `alpine:latest`
- **Shell / Utilities**: `alpine:latest`

### Operating Rules

1. Always use `--rm` to automatically clean up the container upon completion.
2. Always mount current working directory with `-v "$(pwd):/workspace:z"` (`:z` is required for SELinux/Podman compatibility).
3. Never use `--privileged` flag inside ephemeral containers unless strictly and demonstrably required.
4. All generated files and persistent build artifacts must reside within the mounted `/workspace` directory.
"""
    # Write or update global rules
    with open(global_rules_file, "w", encoding="utf-8") as f:
        f.write(global_rules_content)
    print("[Init] Seeded global Zoo Code rules at ~/.roo/rules/visualvibe.md")
except Exception as e:
    print(f"[Init] Warning: Could not seed global Zoo Code rules: {e}")

# ── 2. Workspace Pre-seeding (memory-bank/ per project) ───────────────────────
_workdirs_path = VV_WORKDIRS

for prj_name, prj_dir in discover_projects(_workdirs_path):
    try:
        # Clean up legacy redundant workspace rule if it was previously injected
        legacy_prj_rule = os.path.join(prj_dir, ".roo", "rules", "visualvibe.md")
        if os.path.exists(legacy_prj_rule):
            try:
                os.remove(legacy_prj_rule)
                print(f"[Init] Cleaned up redundant workspace rule {legacy_prj_rule} in favor of global rules.")
            except Exception:
                pass

        mb_dir = os.path.join(prj_dir, "memory-bank")
        os.makedirs(mb_dir, exist_ok=True)

        mb_files = {
            "projectbrief.md": f"""# Project Brief — {prj_name}

## Goal
Brief description of the primary objective for project {prj_name}.

## Key Requirements
- Requirement 1
- Requirement 2

## Notes
General context, architectural constraints, and considerations.
""",
            "activeContext.md": f"""# Active Context — {prj_name}

## Current Focus
Describe the ongoing task or latest objective being worked on.

## Next Steps
- [ ] Task 1
- [ ] Task 2

## Recent Decisions
- Record technical and architectural decisions made in recent sessions.
""",
            "progress.md": f"""# Progress — {prj_name}

## What Works
- Verified and completed features.

## What's Left
- Planned or in-progress features.

## Known Issues
- No critical blockers reported.
""",
            "systemPatterns.md": f"""# System Patterns — {prj_name}

## Architecture
Overview of system architecture and design patterns used in the project.

## Code Conventions
- Project code style and practices.
- Naming conventions.
""",
            "techContext.md": f"""# Tech Context — {prj_name}

## Technology Stack
- Languages:
- Frameworks / Libraries:
- Build & Deployment Tools:

## Primary Commands
- Build / Run:
- Tests:
"""
        }

        for fname, content in mb_files.items():
            fpath = os.path.join(mb_dir, fname)
            if not os.path.exists(fpath):
                with open(fpath, "w", encoding="utf-8") as f:
                    f.write(content)

        # Migrate legacy .clinerules -> Zoo Code's native .roo/rules/ location.
        # Zoo Code loads every .md file under .roo/rules/, so preserve any custom
        # .clinerules content into its own file before removing the legacy file
        # (instead of silently dropping it).
        clinerules_file = os.path.join(prj_dir, ".clinerules")
        if os.path.isfile(clinerules_file):
            try:
                with open(clinerules_file, "r", encoding="utf-8", errors="replace") as f:
                    cl_content = f.read().strip()
                if cl_content:
                    existing = ""
                    if os.path.exists(rules_file):
                        with open(rules_file, "r", encoding="utf-8", errors="replace") as f:
                            existing = f.read().strip()
                    if cl_content != existing:
                        migrated_file = os.path.join(rules_dir, "clinerules.md")
                        with open(migrated_file, "w", encoding="utf-8") as f:
                            f.write(cl_content + "\n")
                os.remove(clinerules_file)
                print(f"[Init] Migrated .clinerules -> .roo/rules for {prj_name}")
            except Exception as e:
                print(f"[Init] Warning: Could not migrate .clinerules for {prj_name}: {e}")
    except Exception as e:
        print(f"[Init] Warning: Could not seed .roo/rules + memory-bank for {prj_name}: {e}")
