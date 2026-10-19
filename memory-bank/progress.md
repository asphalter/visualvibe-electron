# Progress — visualvibe-electron

## Health-check: Polling Interval Configurabile
- In [`scripts/lib/common.sh`](scripts/lib/common.sh) introdotto l'intervallo di polling configurabile `VV_POLL_INTERVAL` (default `1` secondo) nelle funzioni [`vv_wait_for_file()`](scripts/lib/common.sh:72), [`vv_wait_for_port()`](scripts/lib/common.sh:102), [`vv_wait_for_process()`](scripts/lib/common.sh:155) e [`vv_wait_for_display()`](scripts/lib/common.sh:193).
- Sostituito `sleep 1` con `sleep "$interval"` e aggiornato il contatore con `elapsed=$((elapsed + interval))` per mantenere il timeout massimo coerente.
- Mantenuti firma delle funzioni, log `vv_log` e ritorno immediato (`return 0`) appena la risorsa risulta pronta.
- Validato sintatticamente con `bash -n scripts/lib/common.sh`.

## Versione 20261019.004
- Incrementata versione a `20261019.004` in [`VERSION`](VERSION:1).

## Licenza MIT Open Source
- Creato il file di licenza [`LICENSE`](LICENSE) nella root del progetto con il testo standard della licenza MIT.
- Attribuito il copyright a VisualVibe per l'anno 2026 (`Copyright (c) 2026 VisualVibe`), allineando il repository con il riferimento in [`README.md`](README.md:223) a valle dell'audit di pre-pubblicazione.

## Routing Log PatchTracker e Pulizia Banner Active Services
- **Routing dei log in [`scripts/lib/vv_common.py`](scripts/lib/vv_common.py:180)**:
  - Aggiornato il metodo [`PatchTracker.report()`](scripts/lib/vv_common.py:180) per inviare i messaggi informativi e di esito regolare su `sys.stdout`: `[VV-PATCH]`, `[VV-PATCH-OK]` e `[VV-PATCH-DEBUG]`.
  - Mantenuto l'invio su `sys.stderr` esclusivamente per avvisi ed errori critici: `[VV-PATCH-WARN]` e `[VV-PATCH-FAIL]`.
  - Convalidato il corretto smistamento degli stream STDOUT/STDERR tramite test con vari livelli di severità.
- **Pulizia e rinomina servizi attivi all'avvio in [`entrypoint.sh`](entrypoint.sh:292)**:
  - Rimossa la stampa ridondante dei servizi interni non esposti direttamente: `KasmVNC Web UI`, `FileBrowser`, `X11 Display` e `VSCodium IDE`.
  - Rinominati i punti di ingresso esposti:
    - `Caddy HTTPS` → `VisualVibe HTTPS`
    - `Caddy HTTP` → `VisualVibe HTTP Proxy`
  - Preservata la formattazione e l'allineamento dei delimitatori nella sezione Active Services.

## Igiene Repository e Ottimizzazione Build Container
- **Rimozione ricorsiva `__pycache__` a fine compilazione**:
  - Nel [`Containerfile`](Containerfile:185), al termine dell'esecuzione degli script di build (fase 11), è stato introdotto il cleanup automatico per rimuovere tutte le directory `__pycache__` e i file `*.pyc`/`*.pyo` sotto `/opt/visualvibe/scripts/`.
  - Le directory `__pycache__` e i relativi bytecode rimasti nel workspace sono stati rimossi e deregistrati dall'indice git.
- **Configurazione ignore per `memory-bank/`, `plans/` e bytecode**:
  - Creati i file [`.gitignore`](.gitignore), [`.dockerignore`](.dockerignore) e [`.containerignore`](.containerignore) nella root del workspace.
  - Voci incluse: [`memory-bank/`](memory-bank/), [`plans/`](plans/), directory `__pycache__/`, pattern bytecode `*.pyc` e `*.pyo`, oltre ai file di sistema, log e temporanei.
  - Verificato che i file fisici di [`memory-bank/`](memory-bank/) e [`plans/`](plans/) rimangano intatti sul filesystem locale e che non vengano inclusi nei commit né nel context di build Podman/Docker.

## Diagnosi Warning di Avvio (Log Boot)
- **`[VV-WARN] 010_filebrowser-branding.sh: icon cache directory not found`**:
  - Causa: [`scripts/boot/010_filebrowser-branding.sh`](scripts/boot/010_filebrowser-branding.sh:14) attende fino a 10s la creazione di `${VV_HOME}/.cache/filebrowser/icons` da parte di FileBrowser Quantum; al primissimo avvio (o prima che il frontend generi la cache) la directory può non esistere ancora al termine del polling.
  - Verifica: il percorso è corretto e coerente con `cacheDir` in [`config/filebrowser.yaml`](config/filebrowser.yaml:17); sul filesystem la directory esiste (`/home/vvelectron/.cache/filebrowser/icons`) con le icone VisualVibe già applicate.
  - Classificazione: innocuo/transitorio (nessun path errato); il branding favicon può non essere applicato solo nel boot in cui FileBrowser non ha ancora generato la cache, per poi essere applicato nei boot successivi.
  - Intervento: declassato il log a `DEBUG` con messaggio più esplicito in [`scripts/boot/010_filebrowser-branding.sh`](scripts/boot/010_filebrowser-branding.sh:39).
- **`[VV-PATCH-WARN] strip-legacy-seed: pattern non trovato`**:
  - Causa: [`scripts/boot/011_zoo-seed-profiles.py`](scripts/boot/011_zoo-seed-profiles.py:125) cerca un seed legacy precedente da rimuovere; in assenza di un seed v1-v12 (caso normale: l'estensione viene ripristinata da `/opt` a ogni boot) il pattern non trova match.
  - Classificazione: atteso e innocuo; `critical=False` era già corretto.
  - Intervento: introdotto `log_level` in [`PatchResult`](scripts/lib/vv_common.py:136)/[`PatchTracker`](scripts/lib/vv_common.py:148) e impostato `log_level="DEBUG"` per il patch `strip-legacy-seed`, così il report emette `[VV-PATCH-DEBUG]` invece di `[VV-PATCH-WARN]`.
  - Verifica: `python3 -m py_compile` e `bash -n` superati in container Podman effimeri.

## Risoluzione Criticità Architetturali (Release 20261019.003)
Tutte e 5 le criticità individuate per il consolidamento e l'affidabilità di VisualVibe Electron sono state completate con successo, portando il rilascio della versione a `20261019.003` in [`VERSION`](VERSION):
- **C5 — Centralizzazione hardcoded paths**:
  - Centralizzati percorsi e costanti in [`scripts/lib/common.sh`](scripts/lib/common.sh) e [`scripts/lib/vv_common.py`](scripts/lib/vv_common.py).
  - Bonificati tutti i riferimenti sparsi negli script di boot ([`scripts/boot/`](scripts/boot/)), build ([`scripts/build/`](scripts/build/)) e in [`entrypoint.sh`](entrypoint.sh).
- **C3 — Standardizzazione gestione errori bash**:
  - Introdotti `vv_init_strict()` (`set -euo pipefail` con trap `ERR`) e logging standardizzato [`vv_log()`](scripts/lib/common.sh:27).
  - Corretto il routing dei log in [`vv_log()`](scripts/lib/common.sh:27): livelli `INFO` e `DEBUG` su STDOUT, livelli `WARN` ed `ERROR` su STDERR (con [`vv_trap_err()`](scripts/lib/common.sh:49) su STDERR).
  - Applicata strict mode a tutti gli script bash e implementata resilienza per PID 1 in [`entrypoint.sh`](entrypoint.sh) contro crash inattesi.
- **C1 — Framework validazione post-patching KasmVNC**:
  - Implementata la classe [`PatchTracker`](scripts/lib/vv_common.py:149) in [`scripts/lib/vv_common.py`](scripts/lib/vv_common.py) con verifica di pattern, integrità e allarmi critici in [`scripts/build/005_kasmvnc_sidebar.py`](scripts/build/005_kasmvnc_sidebar.py).
- **C2 — Validazione post-patching Zoo Code**:
  - Esteso l'uso di [`PatchTracker`](scripts/lib/vv_common.py:149) a [`scripts/boot/011_zoo-seed-profiles.py`](scripts/boot/011_zoo-seed-profiles.py) con tracciamento `strip-legacy-seed` e `inject-activate-seed`.
- **C4 — Health-check tra avvio servizi**:
  - Implementate le funzioni [`vv_wait_for_file()`](scripts/lib/common.sh:66), [`vv_wait_for_port()`](scripts/lib/common.sh:96), [`vv_wait_for_process()`](scripts/lib/common.sh:147) e [`vv_wait_for_display()`](scripts/lib/common.sh:182) in [`scripts/lib/common.sh`](scripts/lib/common.sh).
  - Sequenziamento deterministico non bloccante tra KasmVNC, Openbox, VSCodium, FileBrowser e Caddy in [`entrypoint.sh`](entrypoint.sh).

## Fix — Zoo Code mostrava `gpt-o4` nel profilo `default` alla prima apertura
- **Sintomo**: alla prima apertura Zoo Code si apriva in modalità `Architect` ma il profilo attivo `default` mostrava il modello inesistente `gpt-o4`; riselezionando una modalità l'assegnazione si correggeva.
- **Causa root**: [`scripts/boot/011_zoo-seed-profiles.py`](scripts/boot/011_zoo-seed-profiles.py) usava un fallback generico per l'anchor di `activate()` quando non trovava la dichiarazione esportata. Su Zoo Code `3.90.0` tale fallback poteva iniettare il seed in una funzione diversa (es. l'handler di cambio modalità), quindi il seed NON veniva eseguito all'apertura: il profilo `default` restava al default interno `gpt-o4` finché un cambio modalità non faceva scattare l'iniezione.
- **Correzione**: ancoraggio stretto all'`activate()` esportata, rimozione del fallback generico, `ZOO_CODE_COMPAT_VERSION = "3.90.0"`, marker `v13` e verifica fail-loud dell'iniezione. Se l'anchor reale non è trovato, lo script non applica il seed e segnala l'errore invece di iniettare nel punto sbagliato.
- **Verifica**: `python3 -m py_compile scripts/boot/011_zoo-seed-profiles.py` completata con successo in container Podman effimero.

## What Works
- **Health-check e sequenziamento deterministico dei servizi (C4)**:
  - Implementate in [`scripts/lib/common.sh`](scripts/lib/common.sh:62) le 4 funzioni standard di readiness:
    - [`vv_wait_for_file()`](scripts/lib/common.sh:66): attesa idempotente con timeout di file, directory o socket unix.
    - [`vv_wait_for_port()`](scripts/lib/common.sh:96): attesa robusta di porte TCP in ascolto (/dev/tcp, ss, nc, socket python).
    - [`vv_wait_for_process()`](scripts/lib/common.sh:147): attesa di processi attivi tramite `pgrep` e `pidof`.
    - [`vv_wait_for_display()`](scripts/lib/common.sh:182): attesa di display X11 (`:1`) tramite socket Unix `/tmp/.X11-unix/X<num>` e query `xprop`/`xdpyinfo`.
  - Integrati health-check non bloccanti in [`entrypoint.sh`](entrypoint.sh:207):
    - Attesa deterministica del display X11 KasmVNC (`DISPLAY_NUM`) e porta websocket (8444) prima di proseguire.
    - Attesa di avvio di Openbox (`vv_wait_for_process "openbox"`) prima di VSCodium.
    - Verifica di display X e window manager prima del lancio di VSCodium e check post-lancio (`vv_wait_for_process "codium"`).
    - Attesa delle porte dei backend (8444 per KasmVNC, 8081 per FileBrowser) prima di avviare Caddy reverse proxy.
    - Attesa del display X e verifica processo nel ciclo watchdog di respawn di VSCodium.
  - Aggiunto check di prontezza display in [`config/openbox/autostart`](config/openbox/autostart:5) prima dell'applicazione dei comandi `xset`.

- **Validazione Patching Zoo Code Seed Profiles (C2)**:
  - Integrato [`PatchTracker`](scripts/lib/vv_common.py:149) in [`scripts/boot/011_zoo-seed-profiles.py`](scripts/boot/011_zoo-seed-profiles.py) con costante `ZOO_CODE_COMPAT_VERSION = "3.90.0"` (allineata alla versione pinnata in [`Containerfile`](Containerfile:6) e in [`scripts/boot/002_zoo-fallback.sh`](scripts/boot/002_zoo-fallback.sh:8)).
  - Tracciamento trasparente con `tracked_sub()` per rimozione vecchi seed (`strip-legacy-seed`, non critico) e iniezione seed all'attivazione dell'estensione (`inject-activate-seed`, critico).
  - Segnalazione formattata dello stato delle patch via `tracker.report()` e logging di errori critici su `stderr` garantendo la resilienza al boot (nessun blocco dell'avvio o `sys.exit(1)`).
  - Ancoraggio dell'iniezione esclusivamente alla funzione `activate()` esportata dal bundle (`activate:()=>NAME`) con rimozione del fallback generico che poteva iniettare il seed nel handler di cambio modalità.
  - Marker aggiornato a `v13` e verifica post-scrittura basata sulla presenza del marker immediatamente dopo l'apertura della vera `activate()`.

- **Framework di validazione patching KasmVNC (C1)**:
  - Implementate le classi [`PatchResult`](scripts/lib/vv_common.py:137) e [`PatchTracker`](scripts/lib/vv_common.py:149) in [`scripts/lib/vv_common.py`](scripts/lib/vv_common.py).
  - Wrapper trasparenti `tracked_sub()` e `tracked_replace()` con tracking dei match trovati e delle sostituzioni applicate.
  - Generazione di report formattato su `stderr` (`[VV-PATCH]`, `[VV-PATCH-OK]`, `[VV-PATCH-WARN]`, `[VV-PATCH-FAIL]`).
  - Interruzione automatica della build Docker con exit code 1 (`exit_if_failures()`) in caso di fallimenti critici, garantendo zero fallimenti silenziosi in caso di aggiornamento KasmVNC o modifiche ai bundle.
  - Integrato `PatchTracker` con versione compatibile `KASMVNC_COMPAT_VERSION = "1.3.3"` in [`scripts/build/005_kasmvnc_sidebar.py`](scripts/build/005_kasmvnc_sidebar.py) per tutti i file HTML, CSS, JS e locale.

- **Error Handling e Strict Mode negli script bash (C3)**:
  - Definita infrastruttura di error handling in [`scripts/lib/common.sh`](scripts/lib/common.sh): `vv_trap_err()`, `vv_init_strict()` (`set -euo pipefail` + `ERR` trap), e `vv_log()` con formattazione standardizzata e timestamp ISO 8601 su stderr.
  - Applicata strict mode a tutti gli script in [`scripts/boot/*.sh`](scripts/boot/) e [`scripts/build/*.sh`](scripts/build/), con sanitizzazione delle logiche condizionali (es. loop di controllo e test con `if` anziché `cmd && break`).
  - Reso [`entrypoint.sh`](entrypoint.sh) robusto e resiliente per il ruolo di PID 1: cattura degli exit code non-zero degli script di boot con log warning informativo senza interruzione del container, e disattivazione di `set -e` prima dell'ingresso nel supervisore watchdog.
  - Ottimizzato il sourcing relativo con fallback in tutti gli script per il corretto funzionamento indistinto in locale e dentro container.

- **Centralizzazione percorsi e costanti (C5)**:
  - Centralizzate in [`scripts/lib/common.sh`](scripts/lib/common.sh) e [`scripts/lib/vv_common.py`](scripts/lib/vv_common.py) tutte le variabili di ambiente e costanti di sistema: `VV_USER`, `VV_HOME`, `VV_BASE`, `VV_WORKDIRS`, `KASMVNC_WWW_DIR`, `VSCODIUM_DATA`, `VSCODIUM_EXTENSIONS`, `VSCODIUM_CONFIG`, `VSCODIUM_USER_DIR`, `VV_CONFIG`, `VV_MEDIA`, `VV_EXTENSIONS`, `VV_SCRIPTS`, `VV_BOOT_DIR`, `VV_BUILD_DIR`, `VV_LIB_DIR`.
  - Bonificati tutti i percorsi hardcoded in [`entrypoint.sh`](entrypoint.sh), negli script di boot ([`scripts/boot/`](scripts/boot/)) e di build ([`scripts/build/`](scripts/build/)), sia bash che python.
  - Garantito il sourcing dinamico sicuro sia in ambiente containerizzato (`/opt/visualvibe`) sia con fallback locale per test/sviluppo.

- **Apertura iniziale di VSCodium in `/home/vvelectron/VisualVibe Workdirs`**:
  - Configurato [`entrypoint.sh`](entrypoint.sh:230) per garantire la creazione precoce di `/home/vvelectron/VisualVibe Workdirs` con permessi `vvelectron:vvelectron` e per lanciare VSCodium puntando direttamente a `"$WORKDIRS_PATH"` alla prima installazione (tramite marker idempotente `/home/vvelectron/.config/VSCodium/.initial_workspace_done`).
  - Nei successivi riavvii e nel ciclo di watchdog respawn in [`entrypoint.sh`](entrypoint.sh:310), VSCodium viene avviato senza argomenti cartella forzati, consentendo il ripristino nativo dello stato della sessione e dell'eventuale progetto selezionato dall'utente.
  - Aggiornato [`scripts/boot/006_preseed-workspace.py`](scripts/boot/006_preseed-workspace.py:40) per preseedare `workspaceStorage` e il relativo database SQLite per `/home/vvelectron/VisualVibe Workdirs` con Zoo Code abilitato e onboarding skippato.
  - Aggiornato [`scripts/boot/008_vscode-state-vscdb.py`](scripts/boot/008_vscode-state-vscdb.py:92) per applicare le personalizzazioni di layout a tutti i workspace e per registrare deterministicamente `VisualVibe Workdirs` come cartella iniziale in [`history.recentlyOpenedPathsList`](scripts/boot/008_vscode-state-vscdb.py:92) nel database globale `state.vscdb`.
  - Impostato [`window.restoreWindows: "all"`](scripts/build/003_vscodium-settings.sh:38) sia in fase di build in [`scripts/build/003_vscodium-settings.sh`](scripts/build/003_vscodium-settings.sh:38) sia in fase di boot in [`scripts/boot/009_sync-settings.sh`](scripts/boot/009_sync-settings.sh:58).
  - Documentato in [`config/openbox/autostart`](config/openbox/autostart:10) il ciclo di vita gestito da `entrypoint.sh`.

- **Rimozione della variabile d'ambiente obsoleta `PASSWORD`**:
  - Rimossa la variabile d'ambiente `PASSWORD` da [`docker-compose.yml`](docker-compose.yml).
  - Rimossa la direttiva `Environment=PASSWORD=` da [`quadlet/visualvibe-electron.container`](quadlet/visualvibe-electron.container).
  - Normalizzato il fallback di autenticazione per KasmVNC in [`entrypoint.sh`](entrypoint.sh:156) impostando direttamente `KASM_USER_PASS="visualvibe"`.
  - Rimossa l'iniezione `-e PASSWORD` e aggiornati i log/commenti in [`run_env.sh`](run_env.sh:12).
  - Rimossa la voce `PASSWORD` dalla tabella delle variabili d'ambiente in [`README.md`](README.md).

- **Ottimizzazioni Qualità Video KasmVNC & Profilo "VisualVibe"**:
  - Aggiunti parametri ottimali per Cloudflare Tunnel e IDE testuale nella sezione `encoding:` di [`config/kasmvnc.yaml`](config/kasmvnc.yaml:30): [`treat_lossless: 7`](config/kasmvnc.yaml:33) (soglia rendering lossless testo ottimizzata per IDE), [`video_area: 0`](config/kasmvnc.yaml:34) (disabilitazione rilevamento automatico aree video per ridurre overhead) e [`resize: remote`](config/kasmvnc.yaml:35) (ridimensionamento lato server sincronizzato).
  - Ridenominazione completa dell'etichetta del profilo stream da "High" ad "VisualVibe" nella UI via [`scripts/build/005_kasmvnc_sidebar.py`](scripts/build/005_kasmvnc_sidebar.py):
    - Manipolazione DOM dinamica in [`applyVisualVibeSettings()`](scripts/build/005_kasmvnc_sidebar.py:516) con supporto `MutationObserver` per garantire persistenza dell'etichetta "VisualVibe" sul dropdown `#noVNC_setting_video_quality` (mantenendo internamente `value: "3"`).
    - Patch statica delle opzioni HTML in `index.html` e `vnc.html`.
    - Patch dei bundle JS (`app/ui.js`, `dist/main.bundle.js`) per assegnare `label: "VisualVibe"`.
    - Patch dei file di localizzazione in `app/locale/*.json` per mappare sia "High" che traduzioni come "Alto" a "VisualVibe".

- **Prompt Caching per modelli Zoo Code (Roo Code)**:
  - Abilitato il Prompt Caching ([`supportsPromptCache: true`](scripts/boot/011_zoo-seed-profiles.py:54)) nell'oggetto [`openAiCustomModelInfo`](scripts/boot/011_zoo-seed-profiles.py:54) su ogni modello e profilo configurato (`default`, `visualvibe-architect`, `visualvibe-code`, `visualvibe-ask`, `visualvibe-debug`, `visualvibe-orchestrator`) nello script di seed [`scripts/boot/011_zoo-seed-profiles.py`](scripts/boot/011_zoo-seed-profiles.py).
  - Incrementata la versione del marker di iniezione a `v12` (`MARKER = "/*[VisualVibe profiles seed v12]*/"`) in [`scripts/boot/011_zoo-seed-profiles.py`](scripts/boot/011_zoo-seed-profiles.py:42) per assicurare l'applicazione idempotente e la sostituzione automatica del seed precedente.

- **Release `20261019.002` (Versione Attuale)**:
  - Bump di versione a `20261019.002`.

- **Release `20261019.001`**:
  - Rimozione pulita dell'opzione "Modalità cursore di gioco" (Game pointer mode / Game cursor mode) dal menu a sinistra (sidebar) di KasmVNC via [`scripts/build/005_kasmvnc_sidebar.py`](scripts/build/005_kasmvnc_sidebar.py): gestione multilivello (regole CSS con `display: none !important;`, marcatura wrapper HTML `#noVNC_game_mode_container`, patch a `app/ui.js` e `dist/main.bundle.js` sostituendo `showControlInput("noVNC_game_mode_button")` con `hideControlInput("noVNC_game_mode_button")`, ed hook difensivo runtime su `window.UI.showControlInput`).
  - Bump di versione a `20261019.001` registrato in [`VERSION`](VERSION).
  - Apertura nativa dei progetti in VSCodium desktop via [`vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(selectedProject), false)`](extensions/vv-project-picker/extension.js:31), eliminando i vecchi redirect browser non compatibili con l'ambiente Kiosk Openbox.
  - Testo descrittivo del comando aggiornato in [`extensions/vv-project-picker/package.json`](extensions/vv-project-picker/package.json) per chiarire il cambio workspace nativo in VSCodium.
  - Rimozione completa dell'estensione `vv-nav-button` e pulizia retrocompatibile di vecchi residui nei volumi persistenti via [`scripts/boot/001_sync-extensions.sh`](scripts/boot/001_sync-extensions.sh).
  - Iniezione deterministica del logo di connessione KasmVNC (`visualvibe-connect-logo`) con il logo vettoriale trasparente [`media/favicon.svg`](media/favicon.svg) (`./assets/favicon.svg`) e dimensioni calibrate (140x140px, max 160x160px con drop-shadow) in [`scripts/build/005_kasmvnc_sidebar.py`](scripts/build/005_kasmvnc_sidebar.py), esteso a `#noVNC_transition`, `.visualvibe-connect-logo-container` e `#noVNC_transition_content` su sfondo uniforme `#0e0e16`.
  - Profilo Cloudflare-Resilient (30 FPS capped, testo Lossless `consider_lossless_quality: 9` e `treat_lossless: 9`, dynamic quality [7, 9], WebP quality 8) che elimina il bufferbloat e i drop di frame su proxy Cloudflare.
  - Native Resolution HiDPI (`enable_hidpi: true`, `resize: 'remote'`) attiva di default e riapplicata automaticamente all'handshake RFB.
  - Preselezione persistente del reasoning effort per Zoo Code in `state.vscdb` ([`scripts/boot/008_vscode-state-vscdb.py`](scripts/boot/008_vscode-state-vscdb.py)).
  - Persistenza nativa a livello OS su AlmaLinux 10: VSCodium in sessione Openbox Kiosk su Xvnc headless, indipendente da disconnessioni del browser.
  - Integrazione completa Caddy reverse proxy HTTPS (`:8443`), FileBrowser (`:8080`) e suite di estensioni/branding VisualVibe.
  - Bonifica completa di file e directory temporanee `.debug/`.

- **Release `20261018.002`**:
  - Nuova architettura Headless Desktop su Linux basata su KasmVNC + VSCodium in sessione Openbox Kiosk.
  - Native Resolution HiDPI (`enable_hidpi: true`, `resize: 'remote'`) attiva di default e riapplicata automaticamente all'handshake RFB.
  - Profilo Cloudflare-Resilient (30 FPS capped, testo Lossless `consider_lossless_quality: 9` e `treat_lossless: 9`, dynamic quality [7, 9], WebP quality 8).
  - Preselezione persistente del reasoning effort per Zoo Code in `state.vscdb` (`zoo.thoughtEffort: medium`).
  - Integrazione completa Caddy reverse proxy HTTPS (`:8443`), FileBrowser (`:8080`) e suite di estensioni/branding VisualVibe.

- **Profilo Cloudflare-Resilient (30 FPS, Testo Lossless e Native Resolution)**:
  - Aggiornato [`config/kasmvnc.yaml`](config/kasmvnc.yaml) con `encoding.max_frame_rate: 30`, `encoding.rect_encoding_mode.consider_lossless_quality: 9`, `min_quality: 7`, `max_quality: 9` e `webp_quality: 8`.
  - Aggiornato [`scripts/build/005_kasmvnc_sidebar.py`](scripts/build/005_kasmvnc_sidebar.py) per applicare 30 FPS (`framerate: 30`, `frame_rate: 30`), `dynamic_quality: true` (floor a 7, ceiling a 9), `treat_lossless: 9` nei default di localStorage, nel DOM (`#noVNC_setting_framerate`), nei bundle minificati (`main.bundle.js` e `ui.js`) e nella funzione runtime `applyVisualVibeSettings()`.
  - Native Resolution interamente preservata (`enable_hidpi: true`, `resize: 'remote'`).
  - Collaudo convalidato in runtime con Podman: Xvnc avviato con flags confermati (`-FrameRate 30 -TreatLossless 9 -DynamicQualityMin 7 -DynamicQualityMax 9 -WebpVideoQuality 8`), display socket `/tmp/.X11-unix/X1` attivo e client web servito via Caddy su HTTPS.

- **Logo di connessione KasmVNC (`visualvibe-connect-logo`)**:
  - Corretto [`scripts/build/005_kasmvnc_sidebar.py`](scripts/build/005_kasmvnc_sidebar.py) per iniettare deterministicamente in `index.html` e `vnc.html` il container/logo `visualvibe-connect-logo` dentro `#noVNC_transition`, sopra `#noVNC_transition_text`.
  - Resa idempotente l'iniezione CSS (sostituzione del blocco `visualvibe-splash-style` legacy) e corretto il guard della sostituzione del markup con supporto per classi e attributi minificati.
  - Aggiunta guardia JavaScript `ensureVisualVibeConnectLogo()` con [`MutationObserver`](scripts/build/005_kasmvnc_sidebar.py:347) e chiamate periodiche per ripristinare il logo in caso di pulizia dinamica del contenuto.
  - Ricompilata e collaudata l'immagine in container effimero: markup e CSS serviti correttamente, asset `/assets/visualvibe_horizontal.png` risponde `HTTP 200`.

- **Rimozione estensione custom vv-nav-button**:
  - Rimossa la cartella dell'estensione obsoleta `extensions/vv-nav-button/`.
  - Aggiornato [`scripts/build/002_stage-custom-extensions.sh`](scripts/build/002_stage-custom-extensions.sh) per non processare `vv-nav-button`.
  - Aggiornato [`scripts/boot/001_sync-extensions.sh`](scripts/boot/001_sync-extensions.sh) per rimuovere e deregistrare eventuali versioni residue di `vv-nav-button` da installazioni precedenti / volumi persistenti.
  - Aggiornata la documentazione in [`README.md`](README.md) e nel Memory Bank.

- **Apertura nativa progetti VSCodium (`vv-project-picker`)**:
  - Aggiornato [`extensions/vv-project-picker/extension.js`](extensions/vv-project-picker/extension.js) con [`vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(selectedProject), false)`](extensions/vv-project-picker/extension.js:31).
  - Aggiornato [`extensions/vv-project-picker/package.json`](extensions/vv-project-picker/package.json) con la descrizione aggiornata.

- **Correzione configurazione KasmVNC**:
  - Rimossi i parametri non supportati da KasmVNC (`encoding.resize`, `encoding.video_area`, `encoding.treat_lossless`) da [`config/kasmvnc.yaml`](config/kasmvnc.yaml), risolvendo il crash fatale di Xvnc al boot.
  - Mantenuti intatti tutti gli altri parametri validi di `encoding:` (`max_frame_rate: 30`, `full_frame_updates: none`, `rect_encoding_mode`, `video_encoding_mode`).

## Health-check: Fix "Ready" spurio al timeout in vv_wait_for_display
- In [`scripts/lib/common.sh`](scripts/lib/common.sh) corretto [`vv_wait_for_display()`](scripts/lib/common.sh:220): al raggiungimento del timeout stampava `Ready ... is available` basandosi solo sull'esistenza del socket `/tmp/.X11-unix/X1`, senza validare che il server X accettasse connessioni via `xdpyinfo`/`xprop`.
- Introdotto l'helper [`vv_display_is_ready()`](scripts/lib/common.sh:194) che restituisce `0` se il display accetta connessioni, `1` se non è pronto, `2` se esiste solo il socket senza validator disponibile.
- Loop e controllo post-loop ora condividono la stessa validazione: `Ready` è emesso solo su successo di `xdpyinfo`/`xprop` (o, in assenza di validator, su sola presenza del socket); in caso di timeout viene emesso `WARN Timeout` e la funzione ritorna `1`.
- Mantenuti firma, polling a `VV_POLL_INTERVAL` (default `1s`), ritorno immediato e log `vv_log` coerenti.
- Validato con `bash -n scripts/lib/common.sh`.

## Health-check: Validazione display X con Xauthority corretto
- Causa root del timeout `vv_wait_for_display` sul display KasmVNC: [`vv_display_is_ready()`](scripts/lib/common.sh:194) eseguiva `xdpyinfo`/`xprop` come root senza il cookie Xauthority dell'utente `vvelectron`, causando falsi negativi nonostante il socket `/tmp/.X11-unix/X1` fosse presente.
- Aggiornato [`vv_display_is_ready()`](scripts/lib/common.sh:194) per usare `XAUTHORITY="${VV_HOME}/.Xauthority"` quando leggibile, con diagnostica `vv_log DEBUG` sull'errore del validator.
- Aggiunta in [`vv_wait_for_display()`](scripts/lib/common.sh:220) una diagnostica una-tantum (`vv_log WARN`) con lo stato dei processi `Xvnc` quando il socket è presente ma il display non accetta ancora connessioni X.
- Verificato che `xdpyinfo`/`xprop` sono già installati tramite `xorg-x11-utils` in [`Containerfile`](Containerfile:50); nessuna modifica alle dipendenze richiesta.
- Validato con `bash -n scripts/lib/common.sh`.

## What's Next
- Verificare la corretta build delle immagini nei workflow di CI/CD.
- Monitorare il feedback degli utenti sulle performance di rendering e interazione desktop.
