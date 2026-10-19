# Active Context — visualvibe-electron

## Current Focus
Completata la risoluzione integrale delle 5 criticità architetturali di VisualVibe Electron con rilascio della versione `20261019.003` in [`VERSION`](VERSION).
La codebase è ora consolidata su tutti i fronti:
- Centralizzazione percorsi e costanti (C5) in [`scripts/lib/common.sh`](scripts/lib/common.sh) e [`scripts/lib/vv_common.py`](scripts/lib/vv_common.py).
- Standardizzazione dell'error handling e strict mode bash (C3) su tutti gli script in [`scripts/boot/`](scripts/boot/), [`scripts/build/`](scripts/build/) e in [`entrypoint.sh`](entrypoint.sh).
- Framework di validazione post-patching con [`PatchTracker`](scripts/lib/vv_common.py:149) per il branding/sidebar di KasmVNC (C1) in [`scripts/build/005_kasmvnc_sidebar.py`](scripts/build/005_kasmvnc_sidebar.py).
- Tracciamento e allarmi post-patching per Zoo Code Seed Profiles (C2) in [`scripts/boot/011_zoo-seed-profiles.py`](scripts/boot/011_zoo-seed-profiles.py).
- Health-check modulari e sequenziamento deterministico non bloccante tra i servizi (C4) in [`scripts/lib/common.sh`](scripts/lib/common.sh) e [`entrypoint.sh`](entrypoint.sh).

Focus operativo attuale: monitoraggio stabilità in produzione, verifica dei workflow di CI/CD per la build delle immagini container e feedback di usabilità dell'ambiente desktop web.

## Ultima milestone completata
- **Igiene repository e cleanup bytecode in build container**:
  - Rimozione automatica `__pycache__` e `*.pyc`/`*.pyo` a valle della compilazione build nel [`Containerfile`](Containerfile:185).
  - Creazione e configurazione di [`.gitignore`](.gitignore), [`.dockerignore`](.dockerignore) e [`.containerignore`](.containerignore) con esclusione di [`memory-bank/`](memory-bank/), [`plans/`](plans/) e bytecode Python.
- **Risoluzione integrale 5 Criticità Architetturali e Bump Versione `20261019.003`**:
  - Risolte e collaudate con successo tutte le criticità (C5, C3, C1, C2, C4).
  - Bump di versione a `20261019.003` in [`VERSION`](VERSION) e allineamento documentale del Memory Bank.
- **Step C4 — Health-check nell'avvio sequenziale dei servizi**:
  - Implementate e testate 4 funzioni riutilizzabili in `common.sh`: `vv_wait_for_file`, `vv_wait_for_port`, `vv_wait_for_process`, `vv_wait_for_display`.
  - Eliminati timing impliciti e fallimenti a catena tra KasmVNC, Openbox, VSCodium e i reverse proxy backend di Caddy.
  - Verificato che i timeout logghino warning appropriati senza bloccare l'avvio del container (`set +e` e `|| true`).
- **Step C2 — Integrazione PatchTracker in Zoo Code Seed Profiles**:
  - Tracciamento con `tracked_sub()` di `strip-legacy-seed` e `inject-activate-seed`.
  - Gestione specifica per script di boot: report formattato e allarme per fallimenti critici senza bloccare l'avvio del container.
- **Step C1 — Framework di validazione patching KasmVNC**:
  - Creato `PatchResult` con tracciamento `name`, `critical`, `expected`, `found`, `applied` e `is_ok()`.
  - Creato `PatchTracker` con metodi `tracked_sub()`, `tracked_replace()`, `report()`, `has_critical_failures()` ed `exit_if_failures()`.
  - Integrato il tracker in [`scripts/build/005_kasmvnc_sidebar.py`](scripts/build/005_kasmvnc_sidebar.py), wrappando tutte le sostituzioni di file HTML, CSS, JS e file di traduzione/locale.
  - Testate e verificate le logiche di report e terminazione con exit code 1 in caso di fallimento critico.

- **Step C3 — Error Handling e Strict Mode negli script Bash**:
  - Aggiunte funzioni `vv_trap_err()` (trap con script, linea, comando, exit code e timestamp ISO 8601), `vv_init_strict()` (`set -euo pipefail` + ERR trap) e `vv_log()` (livelli INFO, WARN, ERROR, DEBUG su stderr) in [`scripts/lib/common.sh`](scripts/lib/common.sh).
  - Applicato `vv_init_strict` a [`scripts/boot/000_disable-copilot.sh`](scripts/boot/000_disable-copilot.sh), [`scripts/boot/001_sync-extensions.sh`](scripts/boot/001_sync-extensions.sh), [`scripts/boot/002_zoo-fallback.sh`](scripts/boot/002_zoo-fallback.sh), [`scripts/boot/009_sync-settings.sh`](scripts/boot/009_sync-settings.sh), [`scripts/boot/010_filebrowser-branding.sh`](scripts/boot/010_filebrowser-branding.sh), [`scripts/boot/012_fix-extension-ownership.sh`](scripts/boot/012_fix-extension-ownership.sh), [`scripts/boot/013_kasmvnc-branding.sh`](scripts/boot/013_kasmvnc-branding.sh), [`scripts/build/002_stage-custom-extensions.sh`](scripts/build/002_stage-custom-extensions.sh), [`scripts/build/003_vscodium-settings.sh`](scripts/build/003_vscodium-settings.sh), [`scripts/build/004_kasmvnc-branding.sh`](scripts/build/004_kasmvnc-branding.sh), [`scripts/build/005_kasmvnc_sidebar.sh`](scripts/build/005_kasmvnc_sidebar.sh).
  - Isolato e protetto [`entrypoint.sh`](entrypoint.sh) per garantire che errori non critici durante il boot non abortiscano il PID 1 del container, con disabilitazione esplicita di `set -e` prima del ciclo watchdog.
  - Prioritizzato il sourcing locale dei file `common.sh` per garantire compatibilità sia in container che in ambienti di test/workspace locale.

- **Step C5 — Centralizzazione costanti e path**:
  - Centralizzate in [`scripts/lib/common.sh`](scripts/lib/common.sh) e [`scripts/lib/vv_common.py`](scripts/lib/vv_common.py) tutte le costanti di configurazione e i percorsi del filesystem.
  - Aggiornati tutti gli script bash ([`entrypoint.sh`](entrypoint.sh), [`scripts/boot/000_disable-copilot.sh`](scripts/boot/000_disable-copilot.sh), [`scripts/boot/001_sync-extensions.sh`](scripts/boot/001_sync-extensions.sh), [`scripts/boot/002_zoo-fallback.sh`](scripts/boot/002_zoo-fallback.sh), [`scripts/boot/009_sync-settings.sh`](scripts/boot/009_sync-settings.sh), [`scripts/boot/010_filebrowser-branding.sh`](scripts/boot/010_filebrowser-branding.sh), [`scripts/boot/012_fix-extension-ownership.sh`](scripts/boot/012_fix-extension-ownership.sh), [`scripts/boot/013_kasmvnc-branding.sh`](scripts/boot/013_kasmvnc-branding.sh), [`scripts/build/002_stage-custom-extensions.sh`](scripts/build/002_stage-custom-extensions.sh), [`scripts/build/003_vscodium-settings.sh`](scripts/build/003_vscodium-settings.sh), [`scripts/build/004_kasmvnc-branding.sh`](scripts/build/004_kasmvnc-branding.sh), [`scripts/build/005_kasmvnc_sidebar.sh`](scripts/build/005_kasmvnc_sidebar.sh), [`scripts/open-browser`](scripts/open-browser), [`scripts/print_banner.sh`](scripts/print_banner.sh)).
  - Aggiornati tutti gli script Python ([`scripts/boot/006_preseed-workspace.py`](scripts/boot/006_preseed-workspace.py), [`scripts/boot/007_preseed-rules.py`](scripts/boot/007_preseed-rules.py), [`scripts/boot/008_vscode-state-vscdb.py`](scripts/boot/008_vscode-state-vscdb.py), [`scripts/boot/011_zoo-seed-profiles.py`](scripts/boot/011_zoo-seed-profiles.py), [`scripts/build/005_kasmvnc_sidebar.py`](scripts/build/005_kasmvnc_sidebar.py)).
- **Release `20261019.001`**:
  - Bump di versione a `20261019.001` in [`VERSION`](VERSION).
  - Apertura nativa dei progetti in VSCodium desktop via [`vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(selectedProject), false)`](extensions/vv-project-picker/extension.js:31): rimosso il vecchio redirect URL web specifico di code-server a favore dell'API standard di VSCodium.
  - Aggiornato il testo descrittivo del comando in [`extensions/vv-project-picker/package.json`](extensions/vv-project-picker/package.json): *"Apre il selettore dei progetti dell'ambiente per cambiare workspace nativamente in VSCodium"*.
  - Rimozione totale dell'estensione superflua `vv-nav-button` dal repository e bonifica degli script di build e sincronizzazione di avvio in [`scripts/build/002_stage-custom-extensions.sh`](scripts/build/002_stage-custom-extensions.sh) e [`scripts/boot/001_sync-extensions.sh`](scripts/boot/001_sync-extensions.sh).
  - Iniezione deterministica del logo di connessione (`visualvibe-connect-logo`) in [`scripts/build/005_kasmvnc_sidebar.py`](scripts/build/005_kasmvnc_sidebar.py) con [`MutationObserver`](scripts/build/005_kasmvnc_sidebar.py:347) per contrastare la cancellazione del DOM da parte di KasmVNC e supporto completo alle varianti minificate di bundle e attributi HTML.
  - Profilo Cloudflare-Resilient (30 FPS capped, testo Lossless `consider_lossless_quality: 9` e `treat_lossless: 9`, dynamic quality [7, 9], WebP quality 8) e Native Resolution HiDPI automatica (`enable_hidpi: true`, `resize: 'remote'`).
  - Preselezione automatica e persistente del reasoning effort per Zoo Code in [`scripts/boot/008_vscode-state-vscdb.py`](scripts/boot/008_vscode-state-vscdb.py).
  - Bonifica delle directory e file temporanei di test e diagnostica (`.debug/`).

- **Profilo Cloudflare-Resilient (30 FPS, Testo Lossless e Native Resolution)**:
  - **Server KasmVNC ([`config/kasmvnc.yaml`](config/kasmvnc.yaml))**: Configurato `encoding.max_frame_rate: 30`, `encoding.rect_encoding_mode.consider_lossless_quality: 9`, `min_quality: 7`, `max_quality: 9` e `webp_quality: 8`. Questo riduce del 50% il bitrate di picco prevenendo bufferbloat su proxy Cloudflare, mantenendo codifica lossless su tutti i blocchi di testo statici.
  - **Client Web KasmVNC ([`scripts/build/005_kasmvnc_sidebar.py`](scripts/build/005_kasmvnc_sidebar.py))**: Configurato client JavaScript con `framerate: 30` (in `localStorage`, default client, `#noVNC_setting_framerate`, `applyVisualVibeSettings()`), `dynamic_quality: true` (con `dynamic_quality_min: 7` e `dynamic_quality_max: 9`), `treat_lossless: 9`, `enable_hidpi: true` e `resize: 'remote'`.
  - **Compilazione & Verifica**: Compilata l'immagine con Podman ed eseguito collaudo in container effimero: display socket pronto su `/tmp/.X11-unix/X1`, processo Xvnc attivo con `-FrameRate 30 -TreatLossless 9 -DynamicQualityMin 7 -DynamicQualityMax 9 -WebpVideoQuality 8`, e Caddy reverse proxy servente il client web con le impostazioni a 30 FPS e testo lossless.

- **Logo di connessione KasmVNC (`visualvibe-connect-logo`)**:
  - Risolta la mancata visualizzazione del logo in fase di connessione: lo script [`scripts/build/005_kasmvnc_sidebar.py`](scripts/build/005_kasmvnc_sidebar.py) inietta in modo deterministico in `#noVNC_transition` il blocco `<div class="visualvibe-connect-logo-container"><img class="visualvibe-connect-logo" src="./assets/visualvibe_horizontal.png" ...></div>` sopra `#noVNC_transition_text`.
  - Aggiunte regole CSS dedicate e guardia JavaScript `ensureVisualVibeConnectLogo()` con [`MutationObserver`](scripts/build/005_kasmvnc_sidebar.py:347) per reinserire il logo qualora KasmVNC ripulisca dinamicamente il contenuto del contenitore di transizione.

## Next Steps
- Risolte tutte e 5 le criticità architetturali del piano (C5, C3, C1, C2, C4).
- Collaudo d'integrazione e verifica operativa del ciclo di vita dei container.
  - Verificata immagine ricompilata in container effimero: markup presente in `index.html` e `vnc.html` serviti via HTTPS, risorsa `/assets/visualvibe_horizontal.png` risponde `HTTP 200` (`image/png`, 200666 byte) e regole CSS presenti.

- **Native Resolution, Qualità/Framerate KasmVNC e Reasoning Effort in Zoo Code**:
  - **Native Resolution**: Risolta la configurazione HiDPI (voce "Native Resolution" in KasmVNC corrispondente alla checkbox `enable_hidpi` + resize `remote` in RFB/UI KasmVNC). Integrato patch sia nei sorgenti client HTML/JS sia a runtime via [`scripts/build/005_kasmvnc_sidebar.py`](scripts/build/005_kasmvnc_sidebar.py) per garantire `enable_hidpi: true` e `resize: 'remote'` come stato predefinito e riapplicato a ogni connessione RFB.
  - **Framerate e Qualità**: Ottimizzato a 30 FPS Cloudflare-Resilient per massima fluidità senza drop di frame.
  - **Reasoning Effort in Zoo Code**: Creato script [`scripts/boot/008_vscode-state-vscdb.py`](scripts/boot/008_vscode-state-vscdb.py) per pre-popolare il database SQLite `state.vscdb` di VSCodium all'avvio con `zoo.thoughtEffort: medium`.
