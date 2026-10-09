<p align="center">
  <img src="media/visualvibe_biglogo.jpg" alt="VisualVibe Electron" width="720" />
</p>

# 🧠 VisualVibe Electron

VisualVibe Electron is a containerized, web-native development environment running on **AlmaLinux 10**. It delivers a fully browser-based IDE experience via **code-server** (VS Code in the browser), proxied by **Caddy** on port `80`, with **Zoo Code AI agent** pre-configured and **FileBrowser Quantum** available at `/filebrowser/`.

---

## 🚀 Key Features

- **Base Operating System**: Enterprise-grade **AlmaLinux 10** with optimized package dependencies.
- **Web IDE**: **code-server** (VS Code in the browser) on `127.0.0.1:8080`, proxied via Caddy.
  - Full VS Code experience in any modern browser.
  - Optional password protection via `PASSWORD` environment variable (empty/unset = open access, perimeter security model).
- **code-server & Zoo Code**:
  - code-server pre-configured with custom title, telemetry off, and workspace trust disabled.
  - **Zoo Code AI extension** (`ZooCodeOrganization.zoo-code`) pre-installed and placed in the Secondary Side Bar.
  - Agnostic AI backend connectivity dynamically configurable via environment variables (`AI_API_URL`, `AI_API_KEY`).
  - Multi-role / multi-agent iterations via assignable roles that go beyond Plan/Act.
- **Reverse Proxy**: **Caddy** on port `80` — single exposed port:
  - `/filebrowser/*` → FileBrowser Quantum on `127.0.0.1:8081`
  - All other requests → code-server on `127.0.0.1:8080`
  - WebSocket upgrades handled automatically.
- **Web File Management**: **FileBrowser Quantum** (`/filebrowser/`) for one-click file upload/download.
- **Chromium Headless**: Pre-installed for Zoo Code browser tool support (puppeteer-core).
- **Rootless Podman-in-Podman**: Nested container capabilities inside the development container (`/dev/fuse` + `fuse-overlayfs`).
- **Zero Startup Updates**: Immutable, build-time compilation for instant startup and total reproducibility.
- **User Environment**: Dedicated non-root user `vvelectron` (UID 1000) with a persistent volume at `/home/vvelectron`.

---

## 📁 Project Structure

```
VisualVibe Electron/
├── Containerfile                  # Multi-stage OCI build definition (AlmaLinux 10)
├── entrypoint.sh                  # Container startup orchestrator (thin)
├── run_env.sh                     # Quick local run helper
├── config/
│   ├── Caddyfile                  # Caddy reverse proxy configuration (:80)
│   ├── containers-storage.conf    # Podman nested storage configuration
│   ├── filebrowser.webmanifest    # FileBrowser PWA manifest configuration
│   └── filebrowser.yaml           # FileBrowser Quantum configuration
├── extensions/
│   ├── vv-nav-button/             # VisualVibe Navigator button extension
│   └── vv-project-picker/         # VisualVibe Projects picker extension
├── media/
│   ├── visualvibe_biglogo.jpg     # Project logo (used in README header)
│   └── ...                        # Favicons and PWA icons (PNG, ICO, SVG)
├── scripts/
│   ├── brand_workbench.py         # Workbench UI brand customizer (support tool)
│   ├── print_banner.sh            # Neon ASCII art startup banner (support tool)
│   ├── lib/                       # Shared helpers & constants (vv_common.py, common.sh)
│   ├── build/                     # 0NN_* — image-build customizations (run by Containerfile)
│   └── boot/                      # 0NN_* — container-boot patches/config (run by entrypoint.sh)
├── quadlet/
│   ├── visualvibe-electron.container # Rootless Quadlet container unit
│   └── visualvibe-home.volume     # Rootless persistent volume unit
```


---

## 🧩 Personalizzazioni, patch e injection (`/scripts`)

Ogni personalizzazione, patch o configurazione iniettata in VisualVibe è
implementata in **un singolo script numerato** dentro `/scripts`, così da isolare
e manutenere una modifica alla volta (senza toccare un monolite) e per sopravvivere
ai bump di versione di code-server / Zoo Code (ogni *anchor* fragile vive in un solo file).

- **`build/`** — eseguiti **una volta** in fase di build immagine, chiamati dal `Containerfile`.
- **`boot/`** — eseguiti a **ogni avvio** del container, chiamati da `entrypoint.sh` in ordine numerico.
- **`lib/`** — costanti e helper condivisi (supporto, non "modifiche").

### `build/` — fase di build immagine

| Script | Cosa fa |
|---|---|
| `002_stage-custom-extensions.sh` | Rinomina `vv-nav-button` / `vv-project-picker` in `publisher.name-1.0.0` (layout riconosciuto da code-server). |
| `003_code-server-settings.sh` | Scrive `settings.json` + `keybindings.json` (titolo, telemetria off, trust disabilitato, shortcut Zoo Code). |
| `004_branding.sh` | Applica il brand VisualVibe: favicon, icone PWA, `manifest.json` e icona/CSS del workbench (via `brand_workbench.py`). |

### `boot/` — fase di avvio container

| Script | Cosa fa |
|---|---|
| `001_sync-extensions.sh` | Ripristina Zoo Code + sincronizza `vv-nav-button`/`vv-project-picker` e registra in `extensions.json`. |
| `002_zoo-fallback.sh` | Fallback idempotente: installa Zoo Code da Open VSX se assente. |
| `003_patch-zoo-sidebar.py` | Sposta Zoo Code nella Secondary Side Bar (activitybar → secondarySidebar). |
| `004_patch-workbench-activitybar.py` | I **7 patch** su `workbench.js` che mettono **VisualVibe Projects in prima posizione** + verifica fail-loud. |
| `005_cache-bust-workbench.py` | Appende `?v=<hash>` al `workbench.js` in `workbench.html` (niente cache stantia dopo un rebuild). |
| `006_preseed-workspace.py` | Pre-seed `workspaceStorage` (Secondary Side Bar visibile con Zoo Code, onboarding saltato) per home e progetti. |
| `007_preseed-rules.py` | Crea template `.roo/rules/` + `memory-bank/` in ogni progetto (idempotente). |
| `008_vscode-state-vscdb.py` | Configura `globalStorage/state.vscdb`: lingua, viewlets pinned + migra/enforce il layout sui workspace esistenti. |
| `009_sync-settings.sh` | Ri-applica `settings.json`/`keybindings.json` + re-run branding + `chown` sul volume persistente. |
| `010_filebrowser-branding.sh` | Applica il favicon VisualVibe a FileBrowser (post-avvio, ricrea le icone). |
| `011_zoo-seed-profiles.py` | Patcha l'`extension.js` di Zoo Code per seedare, all'attivazione, i **Configuration Profiles** e le chiavi individuali (`openAiApiKey`/`apiProvider`/`openAiBaseUrl`) da `AI_API_URL`/`AI_API_KEY`. Le chiavi individuali fanno passare il gate del wizard in modo naturale (niente wizard di primo avvio). |

### `lib/` — helper condivisi

| File | Cosa fornisce |
|---|---|
| `vv_common.py` | Costanti/helper Python: `HOME`, endpoint/lingua AI, scoperta progetti. |
| `common.sh` | Helper bash: logging coerente (`vv_log`). |

## ⚙️ Configuration & Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `AI_API_URL` | **Yes** | — | Base URL for the external AI API endpoint (OpenAI-compatible, e.g. OmniRoute) |
| `AI_API_KEY` | **Yes** | — | API key for authenticating against the AI endpoint |
| `AI_LANG` | **Yes** | — | Sets Zoo Code's **language** via ISO code (e.g. `it`, `en`, `es`). See [Supported AI Languages](#-supported-ai-languages). |
| `PASSWORD` | No | *(empty)* | Password for the code-server Web IDE. If empty or unset, authentication is disabled (`--auth none`) — secure at perimeter via Cloudflare Access or VPN. |

> ⚠️ **Mandatory Variables:** The container strictly validates `AI_LANG`, `AI_API_KEY`, and `AI_API_URL` on startup. If any of these variables are unset or empty, the container will immediately abort execution with a fatal error indicating which variables are missing.


### 🌐 Supported AI Languages (`AI_LANG`)

The `AI_LANG` environment variable configures Zoo Code's **language** setting.

| `AI_LANG` value | Language |
|---|---|
| `en` | English |
| `it` | Italian - Italiano |
| `es` | Spanish - Español |
| `fr` | French - Français |
| `de` | German - Deutsch |
| `pt-BR` | Portuguese (Brazil) - Português (Brasil) |
| `zh-CN` | Simplified Chinese - 简体中文 |
| `zh-TW` | Traditional Chinese - 繁體中文 |
| `ja` | Japanese - 日本語 |
| `ko` | Korean - 한국어 |
| `ru` | Russian - Русский |
| `hi` | Hindi - हिन्दी |
| `tr` | Turkish - Türkçe |
| `nl` | Dutch - Nederlands |
| `pl` | Polish - Polski |
| `ca` | Catalan - Català |
| `id` | Indonesian - Bahasa Indonesia |
| `vi` | Vietnamese - Tiếng Việt |

> *Note: `AI_LANG` is required and maps **1:1** onto Zoo Code's language setting.*
> *Legacy aliases `pt` and `zh` are accepted and mapped to `pt-BR` / `zh-CN`.*
> *Any unsupported value (e.g. `ar`, which Zoo Code does not provide) falls back to `en` (English).*


### Zoo Code AI Model Routing

Zoo Code is pre-configured with **"Use different models for Plan and Act modes"** enabled.
The container automatically configures the following model IDs at startup:

| Mode | Model ID | Purpose |
|---|---|---|
| **Default** | `visualvibe-default` | General-purpose fallback for all modes |
| **Plan (Architect)** | `visualvibe-architect` | Deep reasoning, architectural planning, strategy |
| **Act (Code)** | `visualvibe-code` | Fast execution, tool-calling, code writing, refactoring |
| **Ask** | `visualvibe-ask` | Q&A, explanations, code review |
| **Debug** | `visualvibe-debug` | Diagnosis and debugging |
| **Orchestrator** | `visualvibe-orchestrator` | Multi-agent orchestration / subtasks |

These identifiers are sent directly as the `model` parameter in all OpenAI-compatible API requests directed to `AI_API_URL`.

> [!IMPORTANT]
> **User Responsibility — Agnostic Proxy Configuration**:
> It is the user's responsibility to set up and configure an agnostic proxy (such as **OmniRoute**, **LiteLLM**, **One API**, or similar alternatives) at the endpoint pointed to by `AI_API_URL`.
> The proxy must expose the virtual model names above (`visualvibe-default`, `visualvibe-architect`, `visualvibe-code`, `visualvibe-ask`, `visualvibe-debug`, `visualvibe-orchestrator`) and route incoming requests to your desired upstream providers (e.g. Anthropic, OpenAI, DeepSeek, Google) and model targets according to your routing, fallback, and load-balancing strategy.

---

## 💻 Quick Start (Local Run)

### Building the Image
To build the container image directly with Podman:
```bash
podman build -t visualvibe-electron .
```

### Running Locally
To launch the full local environment:
```bash
# Optional: define your AI endpoint before running
export AI_API_URL="https://api.your-ai-service.com/v1"
export AI_API_KEY="your-secret-api-key"

./run_env.sh

# Skip image rebuild (use existing image — faster for restarts):
./run_env.sh --no-build
```

Access the interfaces in your browser:
- **Web IDE**: `http://localhost:80/`
- **File Manager**: `http://localhost:80/filebrowser/`

By default `PASSWORD` is empty, so code-server starts with `--auth none` (no login required). Set `PASSWORD=<value>` to enable built-in password authentication.

---

## ⚠️ Hard Runtime Requirements

VisualVibe Electron runs nested container tooling (Podman inside rootless container) and multi-process web IDE engines (VS Code / Chromium / Node.js). To ensure stability, the following host flags are strictly mandatory across both local execution (`run_env.sh`) and production service definitions (`quadlet`):

| Flag / Setting | Quadlet Key | Purpose & Necessity | Consequence if Omitted |
|---|---|---|---|
| `--privileged` | `PodmanArgs=--privileged` | Required for nested rootless containerization (Podman-in-Podman), `fuse-overlayfs` mounts, and UID/GID mapping delegation inside the container namespace. | Inner Podman commands will fail with permission denied or storage driver errors. |
| `--shm-size=2g` | `ShmSize=2g` | Allocates adequate shared memory (`/dev/shm`) for headless Chromium, Electron engines, and Node.js extension host multi-processing. | VS Code extension host and headless browser instances will crash with `SIGBUS` or out-of-memory errors. |
| `--device /dev/fuse` | Handled via `--privileged` | Exposes the FUSE device for rootless `fuse-overlayfs` storage driver operation. | Inner storage driver initialization fails if non-privileged. |

---

## 🛠️ Deployment via Quadlet

VisualVibe Electron can be installed as a native, rootless systemd service using **Podman Quadlets**:

> [!IMPORTANT]
> The provided `quadlet/visualvibe-electron.container` unit pre-configures `PodmanArgs=--privileged` and `ShmSize=2g`. **Do not remove these directives**, as they are strictly required for nested container execution and browser engine stability.

```bash
# 1. Copy Quadlet files to user systemd directory
mkdir -p ~/.config/containers/systemd
cp quadlet/visualvibe-electron.container quadlet/visualvibe-home.volume ~/.config/containers/systemd/

# 2. Reload systemd daemon to generate container units
systemctl --user daemon-reload

# 3. Start the service
systemctl --user start visualvibe-electron.service
```

### Managing the Service

```bash
# Check service status
systemctl --user status visualvibe-electron.service

# Restart service
systemctl --user restart visualvibe-electron.service

# View real-time service logs
journalctl --user -u visualvibe-electron.service -f

# View container logs
podman logs -f visualvibe-electron
```

---

## 🛡️ Security & Reverse Proxy Configuration

### Architecture

VisualVibe Electron exposes a **single HTTP port** (`80`) via Caddy:

| Service | Internal Address | Public Path | Notes |
|---|---|---|---|
| **code-server Web IDE** | `127.0.0.1:8080` | `/` | WebSocket supported (auto-handled by Caddy) |
| **FileBrowser Quantum** | `127.0.0.1:8081` | `/filebrowser/` | HTTP file manager |

> [!IMPORTANT]
> Caddy handles WebSocket upgrades for code-server automatically. No additional proxy configuration is needed for WebSocket support.

### Reverse Proxy Routing

For production deployments, configure your load balancer or reverse proxy to expose a single HTTPS domain pointing to port `80`:

| Public URL | Backend Target | Notes |
|---|---|---|
| `https://<DOMAIN>/` | `http://<CONTAINER_IP>:80/` | Caddy handles all routing internally |

#### Caddy (built-in)

Caddy is already running inside the container and handles all routing. Your external proxy only needs to forward to port `80`:

```
https://<DOMAIN>/ → http://container:80/
```

#### Cloudflare Zero Trust Example

If using **Cloudflare Access** as the SSO layer:

1. Create an **Access Application** for `vvelectron.example.com` with your IdP (SAML, OIDC, GitHub, etc.)
2. Create a **Cloudflare Tunnel** pointing to `http://localhost:80`
3. Cloudflare handles TLS termination, SSO enforcement, and WebSocket proxying natively

### Security Model

- **Perimeter Security**: All access control (SSO/SAML/OAuth2/mTLS) is enforced at the external reverse proxy or Cloudflare Access layer.
- **code-server Auth**: If `PASSWORD` is set and non-empty, code-server runs with `--auth password`. If `PASSWORD` is empty or unset (the default), code-server runs with `--auth none` — access is open and must be secured at the perimeter (Cloudflare Access, Tailscale, VPN, etc.).
- **Internal Isolation**: code-server and FileBrowser bind exclusively to `127.0.0.1` — they are unreachable from outside the container without going through Caddy on `:80`.
- **Namespace Isolation**: The container runs as non-root user `vvelectron` (UID 1000) inside an OCI namespace.
- **Immutable Base**: All system dependencies are baked at build time; no package installation occurs at runtime.

---

## 📦 Volume Persistence

All user data (code-server settings, extensions state, Zoo Code configuration, FileBrowser database, workspace files) is stored in the persistent volume mounted at `/home/vvelectron`.

This volume survives container restarts, image updates, and redeployments.

```bash
# View the persistent volume
podman volume inspect visualvibe-home

# Manual backup
podman volume export visualvibe-home > visualvibe-home-backup.tar

# Restore from backup
podman volume import visualvibe-home visualvibe-home-backup.tar
```

---

## 🧪 Testing and Validation

```bash
# Syntax-check all scripts
bash -n entrypoint.sh && echo 'entrypoint.sh OK'
bash -n run_env.sh && echo 'run_env.sh OK'

# Verify no KasmVNC/Openbox residuals
grep -ri 'kasmvnc\|openbox\|vncserver\|xstartup' Containerfile entrypoint.sh config/ && echo 'RESIDUALS FOUND' || echo 'Clean'

# Build the container image
podman build -t visualvibe-electron .

# Quick local test run
podman run --rm -it \
  -e AI_API_URL=https://api.example.com/v1 \
  -e AI_API_KEY=test-key \
  -e AI_LANG=en \
  -e PASSWORD=mysecret \
  -p 8080:80 \
  visualvibe-electron
```

---

## 📜 License

© VisualVibe. All rights reserved.
