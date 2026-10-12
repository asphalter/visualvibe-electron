<p align="center">
  <img src="media/visualvibe_biglogo.jpg" alt="VisualVibe Electron" width="720" />
</p>

# 🧠 VisualVibe Electron

VisualVibe Electron is a containerized, web-native development environment running on **AlmaLinux 10**. It delivers a fully browser-based IDE experience via **code-server** (VS Code in the browser), proxied by **Caddy** (tri-listener on ports `80`, `443`, and `8000`), with **Zoo Code AI agent** (v3.88.0) pre-configured and **FileBrowser Quantum** available at `/filebrowser/`.

---

## 🚀 Key Features

- **Base Operating System**: Enterprise-grade **AlmaLinux 10** with optimized package dependencies.
- **Web IDE**: **code-server** (VS Code in the browser) on `127.0.0.1:8080`, proxied via Caddy.
  - Full VS Code experience in any modern browser.
  - Optional password protection via `PASSWORD` environment variable (empty/unset = open access, perimeter security model).
- **code-server & Zoo Code**:
  - code-server pre-configured with custom title displaying release version, telemetry off, and workspace trust disabled.
  - **Zoo Code AI extension** (`ZooCodeOrganization.zoo-code`) updated to **v3.88.0** pre-installed and placed in the Secondary Side Bar.
  - Agnostic AI backend connectivity dynamically configurable via environment variables (`AI_API_URL`, `AI_API_KEY`).
  - Multi-role / multi-agent iterations via assignable roles that go beyond Plan/Act.
  - **Image support** enabled across all AI profiles.
  - **Mode switch auto-approval** enabled for seamless role transitions.
- **Reverse Proxy**: **Caddy** tri-listener architecture:
  - `80` (HTTP): Permanent 301 redirect → HTTPS (`:443`).
  - `443` (**HTTPS**): TLS listener for direct IP / LAN access, ensuring `window.isSecureContext = true` for webviews and Zoo Code sidebar. Supports custom TLS certificates via `CERTFILE_PUBLIC` / `CERTFILE_PRIVATE` with automatic fallback to persistent self-signed certificates with IP SANs.
  - `8000` (Plain HTTP): Dedicated upstream reverse proxy listener (Cloudflare, Nginx, Traefik) terminating TLS externally without redirects.
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
├── VERSION                        # Release version string (YYYYMMDD.NNN)
├── config/
│   ├── Caddyfile                  # Caddy reverse proxy configuration (:80, :443, :8000)
│   ├── containers-storage.conf    # Podman nested storage configuration
│   ├── filebrowser.webmanifest    # FileBrowser PWA manifest configuration
│   └── filebrowser.yaml           # FileBrowser Quantum configuration
├── extensions/
│   ├── vv-nav-button/             # VisualVibe Navigator button extension
│   ├── vv-project-picker/         # VisualVibe Projects picker extension
│   └── vv-update-checker/         # Background update checker extension (checks GitHub every 12h)
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
| `002_stage-custom-extensions.sh` | Rinomina `vv-nav-button`, `vv-project-picker` e `vv-update-checker` in `publisher.name-1.0.0` (layout riconosciuto da code-server). |
| `003_code-server-settings.sh` | Scrive `settings.json` + `keybindings.json` (telemetria off, trust disabilitato, shortcut Zoo Code). |
| `004_branding.sh` | Applica il brand VisualVibe: favicon, icone PWA, `manifest.json` e icona/CSS del workbench (via `brand_workbench.py`). |

### `boot/` — fase di avvio container

| Script | Cosa fa |
|---|---|
| `001_sync-extensions.sh` | Ripristina Zoo Code + sincronizza estensioni custom (`vv-nav-button`, `vv-project-picker`, `vv-update-checker`) e registra in `extensions.json`. |
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
| `CERTFILE_PUBLIC` | No | *(empty)* | Custom TLS public certificate (PEM). Requires `CERTFILE_PRIVATE`. Accepts container file path, raw PEM text, or base64-encoded PEM string. |
| `CERTFILE_PRIVATE` | No | *(empty)* | Custom TLS private key (PEM/KEY). Requires `CERTFILE_PUBLIC`. Accepts container file path, raw PEM text, or base64-encoded PEM string. |

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

### 🔒 Upstream Forwarding & Port Architecture

The container exposes three dedicated network entrypoints via Caddy:
- Port `80`: Permanently redirects (301) to port `443` (HTTPS).
- Port `443`: Serves HTTPS for direct browser access, guaranteeing `window.isSecureContext = true` for VS Code webviews and the Zoo Code sidebar without external proxy configuration. Uses custom certificates if provided, or persistent self-signed certificates with IP SANs.
- Port `8000`: Dedicated plain HTTP port without TLS and without redirects, intended for upstream reverse proxies (Cloudflare Tunnel, Nginx, Traefik) that terminate TLS externally. Proxies connect via plain HTTP while clients access the service over HTTPS via the upstream proxy, providing a Secure Context at the browser level.

### 🔐 Custom TLS Certificates (`CERTFILE_PUBLIC` & `CERTFILE_PRIVATE`)

By default, VisualVibe generates and caches a persistent self-signed TLS certificate with Subject Alternative Names (SAN) for `localhost`, `127.0.0.1`, and all container IP addresses.

You can supply your own custom TLS certificates via environment variables:
- **`CERTFILE_PUBLIC`**: Public certificate / certificate fullchain.
- **`CERTFILE_PRIVATE`**: Private key.

**Requirements & Behavior:**
- **Both variables are required**: `CERTFILE_PUBLIC` and `CERTFILE_PRIVATE` must **both** be specified and non-empty. If only one is specified or both are omitted, the container logs a notice and falls back automatically to the persistent self-signed certificate.
- **Supported Formats**:
  1. **Container file path**: Path to a file mounted inside the container (e.g. `/certs/fullchain.pem` and `/certs/privkey.pem`).
  2. **Raw PEM content**: Multiline PEM-formatted string starting with `-----BEGIN ...`.
  3. **Base64 string**: Base64-encoded representation of the PEM file.
- **Deployment**: Certificates are deployed to `/home/vvelectron/.config/caddy/certs/cert.pem` and `key.pem` with appropriate file permissions (`644` for certificate, `600` for key).


### Zoo Code AI Configuration & Model Routing

Zoo Code is updated to **v3.88.0** with **image support** enabled across all AI profiles and **mode switch auto-approval** enabled for smooth automated role transitions.

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

## 🏷️ Versioning & Update Checker

### Product Versioning

- The product release version is stored in the [`VERSION`](VERSION:1) file in the repository root, using the format `YYYYMMDD.NNN` (e.g. `20261012.002`).
- The version is printed in the ASCII banner at build and startup, and shown permanently in the bottom Status Bar, while the window/tab title remains `"VisualVibe Electron"`.
- **Updating the version**: Simply edit the [`VERSION`](VERSION:1) file and rebuild the container image.

### VisualVibe Update Checker Extension

- **VisualVibe Update Checker** (`vv-update-checker`) is a pre-installed background extension.
- Every 12 hours (with an initial 30-second delay upon startup), it checks GitHub to verify if a newer release version is available.
- If the running container is outdated, it displays a non-blocking warning notification in VS Code.
- It remains completely silent if the container is already up to date, offline, or if the GitHub check cannot be reached.

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
- **Direct HTTPS (Browser / LAN)**: `https://localhost/` (or `https://<IP>/`)
- **HTTP Redirect**: `http://localhost:80/` (permanently redirects 301 to HTTPS `:443`)
- **Upstream Plain HTTP**: `http://localhost:8000/` (for external reverse proxies)
- **Web File Manager**: `https://localhost/filebrowser/`

> [!NOTE]
> **Certificate Notice**: On direct access via IP (`https://<IP>/`) using the default self-signed certificate, the browser displays a certificate warning. Accept it once per device to establish the Secure Context (`window.isSecureContext = true`) needed by VS Code webviews and the Zoo Code sidebar. If you provide a trusted certificate via `CERTFILE_PUBLIC` and `CERTFILE_PRIVATE`, or access through an external trusted proxy (Cloudflare, Nginx, Traefik), no browser warnings are shown.

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

### Port Architecture

VisualVibe Electron exposes **three ports** via Caddy:

| Port | Protocol | Purpose |
|---|---|---|
| `80` | HTTP | 301 Permanent Redirect → HTTPS (`:443`) |
| `443` | **HTTPS** (Caddy internal self-signed CA — `tls internal`) | Direct browser access; guarantees `window.isSecureContext = true` for webviews and Zoo Code sidebar |
| `8000` | Plain HTTP (no TLS, no redirect) | For upstream reverse proxies (Cloudflare, nginx, Traefik) terminating TLS externally |

> [!NOTE]
> **Self-Signed Certificate Warning**: On the first direct access via IP (`https://<IP>/`), the browser displays a warning for the self-signed certificate. It must be accepted once per device. Access via Cloudflare or another trusted reverse proxy terminating TLS externally does not show any warnings.

| Service | Internal Address | Public Path | Notes |
|---|---|---|---|
| **code-server Web IDE** | `127.0.0.1:8080` | `/` | WebSocket supported (auto-handled by Caddy) |
| **FileBrowser Quantum** | `127.0.0.1:8081` | `/filebrowser/` | HTTP file manager |

> [!IMPORTANT]
> Caddy handles WebSocket upgrades for code-server automatically across all listeners. No additional proxy configuration is needed for WebSocket support.

### Reverse Proxy Routing

For production deployments behind an external reverse proxy (Cloudflare Tunnel, nginx, Traefik), configure the upstream to point to plain HTTP port `8000` (without TLS, without redirects):

| Public URL | Backend Target | Notes |
|---|---|---|
| `https://<DOMAIN>/` | `http://<CONTAINER_IP>:8000/` | Plain HTTP, no TLS, no redirects (TLS terminated by upstream proxy) |

#### Upstream Reverse Proxy (nginx, Traefik, etc.)

Caddy runs inside the container and handles all internal routing. Your external proxy forwards plain HTTP to port `8000`:

```
https://<DOMAIN>/ → http://container:8000/
```

#### Cloudflare Zero Trust Example

If using **Cloudflare Access** as the SSO layer:

1. Create an **Access Application** for `vvelectron.example.com` with your IdP (SAML, OIDC, GitHub, etc.)
2. Create a **Cloudflare Tunnel** pointing to `http://localhost:8000`
3. Cloudflare handles TLS termination, SSO enforcement, and WebSocket proxying natively

### Security Model

- **Perimeter Security**: All access control (SSO/SAML/OAuth2/mTLS) is enforced at the external reverse proxy or Cloudflare Access layer.
- **code-server Auth**: If `PASSWORD` is set and non-empty, code-server runs with `--auth password`. If `PASSWORD` is empty or unset (the default), code-server runs with `--auth none` — access is open and must be secured at the perimeter (Cloudflare Access, Tailscale, VPN, etc.).
- **Internal Isolation**: code-server and FileBrowser bind exclusively to `127.0.0.1` — they are unreachable from outside the container without going through Caddy on `:80`, `:443`, or `:8000`.
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
  -p 80:80 \
  -p 443:443 \
  -p 8000:8000 \
  visualvibe-electron
```

---

## 📜 License

© VisualVibe. All rights reserved.
