# /scripts — Personalizzazioni di VisualVibe Electron

Ogni script di personalizzazione e configurazione è un **singolo script numerato**, modulare e idempotente per VSCodium e l'ambiente desktop KasmVNC.

- **`build/`** (001–099): eseguiti **una volta** in fase di build immagine, chiamati dal [`Containerfile`](../Containerfile).
- **`boot/`** (001–099): eseguiti a **ogni avvio**, chiamati da [`entrypoint.sh`](../entrypoint.sh) in ordine numerico.
  - `boot/010_*`: branding e configurazione per FileBrowser Quantum.
- **`lib/`**: costanti e helper condivisi.
  - [`vv_common.py`](lib/vv_common.py) — costanti/helper Python (HOME, endpoint AI, lingua, scoperta progetti).
  - [`common.sh`](lib/common.sh) — helper bash (logging).

La descrizione dettagliata **script per script** è nel [`README.md`](../README.md)
alla sezione *"🧩 Personalizzazioni, script di build e boot (`/scripts`)"*.

## Convenzioni

- Ogni script ha un **header auto-documentante** (cosa fa, fase, idempotenza).
- Gli script Python importano [`lib/vv_common.py`](lib/vv_common.py):
  ```python
  import sys, os
  sys.path.insert(0, "/opt/visualvibe/scripts/lib")
  from vv_common import HOME, api_url, api_key, ai_lang, discover_projects
  ```
- Gli script invocati da [`entrypoint.sh`](../entrypoint.sh) girano in ordine numerico alfabetico (`0NN_*.sh` e `0NN_*.py`).
