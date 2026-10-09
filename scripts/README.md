# /scripts — Personalizzazioni di VisualVibe Electron

Ogni personalizzazione / patch / injection è un **singolo script numerato**, così da
poter manutenere una modifica alla volta e sopravvivere ai bump di versione di
code-server / Zoo Code (ogni *anchor* fragile vive in un solo file).

- **`build/`** (001–099): eseguiti **una volta** in fase di build immagine, chiamati dal `Containerfile`.
- **`boot/`** (001–099): eseguiti a **ogni avvio**, chiamati da `entrypoint.sh` in ordine numerico.
  - `boot/010_*` è speciale: gira **dopo** l'avvio di FileBrowser (vedi `entrypoint.sh`).
- **`lib/`**: costanti e helper condivisi (non sono "modifiche").
  - `vv_common.py` — costanti/helper Python (HOME, endpoint AI, lingua, scoperta progetti).
  - `common.sh` — helper bash (logging).

La descrizione dettagliata **script per script** è nel [`README.md`](../README.md)
alla sezione *"🧩 Personalizzazioni, patch e injection (`/scripts`)"*.

## Convenzioni

- Ogni script ha un **header auto-documentante** (cosa fa, fase, idempotenza).
- Gli script `.py` importano `lib/vv_common.py`:
  ```python
  import sys, os
  sys.path.insert(0, "/opt/visualvibe/scripts/lib")
  from vv_common import HOME, api_url, api_key, ai_lang, discover_projects
  ```
- Gli script `.sh` invocati da `entrypoint.sh` girano in ordine numerico; aggiungere
  un nuovo file `0NN_*.sh`/`0NN_*.py` lo fa eseguire automaticamente.
