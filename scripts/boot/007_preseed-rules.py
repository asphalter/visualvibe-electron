#!/usr/bin/env python3
"""
007_preseed-rules.py — boot — pre-seed Zoo Code project rules (.roo/rules/) and a
memory-bank/ folder (projectbrief, activeContext, progress, systemPatterns, techContext)
into every discovered project that does not already have them (idempotent).
"""
import sys, os
sys.path.insert(0, "/opt/visualvibe/scripts/lib")
from vv_common import HOME, discover_projects

_workdirs_path = os.path.join(HOME, "VisualVibe Workdirs")

for prj_name, prj_dir in discover_projects(_workdirs_path):
    try:
        rules_dir = os.path.join(prj_dir, ".roo", "rules")
        os.makedirs(rules_dir, exist_ok=True)
        rules_file = os.path.join(rules_dir, "visualvibe.md")
        if not os.path.exists(rules_file):
            with open(rules_file, "w", encoding="utf-8") as f:
                f.write(f"""# VisualVibe Rules — {prj_name}

## 1. Memory Bank
All'inizio di ogni task o conversazione su questo progetto:
1. Leggi tutti i file presenti nella cartella `memory-bank/` per acquisire il contesto corrente.
2. In particolare consulta `memory-bank/activeContext.md` e `memory-bank/progress.md`.
3. Quando completi modifiche architetturali, milestone o nuove funzionalita', aggiorna i file della `memory-bank/` corrispondenti.

## 2. Direttive di progetto
- Lingua preferita: Italiano.
- Mantieni la struttura delle cartelle e i pattern di codice esistenti.
- Prima di implementare modifiche complesse, descrivi il piano e attendi allineamento se in plan mode.
""")

        mb_dir = os.path.join(prj_dir, "memory-bank")
        os.makedirs(mb_dir, exist_ok=True)

        mb_files = {
            "projectbrief.md": f"""# Project Brief — {prj_name}

## Obiettivo
Breve descrizione dell'obiettivo principale del progetto {prj_name}.

## Requisiti chiave
- Requisito 1
- Requisito 2

## Note
Informazioni generali o vincoli architetturali.
""",
            "activeContext.md": f"""# Active Context — {prj_name}

## Focus corrente
Descrivere qui l'attivita' in corso o l'ultimo obiettivo su cui si e' lavorato.

## Prossimi passi
- [ ] Task 1
- [ ] Task 2

## Decisioni recenti
- Registrare qui le decisioni tecniche prese nelle ultime sessioni.
""",
            "progress.md": f"""# Progress — {prj_name}

## Cosa funziona
- Funzionalita' completate e verificate.

## Cosa manca
- Funzionalita' pianificate o in sviluppo.

## Problemi noti
- Nessun blocco critico segnalato.
""",
            "systemPatterns.md": f"""# System Patterns — {prj_name}

## Architettura
Descrizione dell'architettura generale e pattern utilizzati nel progetto.

## Convenzioni di codice
- Stile e convenzioni del progetto.
- Naming conventions.
""",
            "techContext.md": f"""# Tech Context — {prj_name}

## Stack tecnologico
- Linguaggi:
- Framework / Librerie:
- Strumenti di build / deploy:

## Comandi principali
- Build / Esecuzione:
- Test:
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
