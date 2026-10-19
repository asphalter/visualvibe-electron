# Tech Context — visualvibe-electron

## Technology Stack
- **OS Base**: AlmaLinux 10 (RHEL 10 compatible)
- **Display Server**: Xvfb (Display `:1`) con estensione RandR per resizing dinamico 1:1
- **Window Manager**: Openbox Kiosk (senza bordi, massimizzato, keybindings pass-through)
- **VNC & Web Streaming**: KasmVNC Server (`127.0.0.1:8444`) con WebSocket HTML5 e encoding WebP ad alta fedeltà
- **IDE Application**: VSCodium (native desktop app con `--no-sandbox`)
- **File Manager**: FileBrowser Quantum (`127.0.0.1:8081`)
- **Reverse Proxy**: Caddy (`:80`, `:443`, `:8000`)
- **Container Runtime**: Nested rootless Podman-in-Podman con `/dev/fuse`
- **AI Extension**: Zoo Code per VSCodium

## Primary Commands
- **Build Container**: `podman build -t visualvibe-electron .`
- **Run Container**: `podman run -d -p 443:443 -p 8000:8000 --device /dev/fuse:rw visualvibe-electron`
