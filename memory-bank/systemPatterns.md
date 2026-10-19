# System Patterns — visualvibe-electron

## Architecture

VisualVibe Electron adotta un'architettura **Remote Desktop via Web** per garantire la completa persistenza dei task AI:

```
[ Browser Client ]
       │ HTTPS / WebSocket
       ▼
[ Caddy Reverse Proxy (:443 / :8000) ]
       ├─────────────────────────────────┐
       │ /* (WebSocket streaming)        │ /filebrowser/*
       ▼                                 ▼
[ KasmVNC (:8444) ]            [ FileBrowser Quantum (:8081) ]
       │ Framebuffer capture
       ▼
[ Xvfb (:1 Display + RANDR) ]
       │
       ├─► [ Openbox Kiosk WM ]
       │
       └─► [ VSCodium (Native Desktop GUI) ]
                 │
                 ├─► [ Zoo Code Extension (VSIX) ]
                 └─► [ Nested Podman Container Runtime ]
```

### Principi Chiave
1. **Disaccoppiamento Sessione / Client**: VSCodium, i processi di background e i task di Zoo Code girano all'interno del display server X11 locale (`:1`). La disconnessione del client web o il refresh del browser non interrompe in alcun modo i processi dell'IDE.
2. **Dynamic Resizing Senza Scaling Raster**: Xvfb con estensione RandR consente a KasmVNC di ridimensionare dinamicamente il display X11 in base alla viewport esatta del client, eliminando lo scaling bitmap sfocato e preservando font nativi nitidi.
3. **Zero Monkey-Patching**: Eliminata la necessità di patchare i bundle JavaScript/CSS del workbench di code-server. Le estensioni e la configurazione dell'IDE utilizzano i percorsi e le CLI native di VSCodium.

### Estensioni Custom VSCodium
- [`extensions/vv-project-picker/`](extensions/vv-project-picker/): Switcher rapido dei progetti workspace all'interno di VSCodium.
- [`extensions/vv-update-checker/`](extensions/vv-update-checker/): Verifica e notifica della presenza di nuove versioni/tag dell'immagine VisualVibe.
- *Nota*: La precedente estensione `vv-nav-button` (pulsante FileBrowser su status bar) è stata deprecata e rimossa: l'accesso a FileBrowser è integrato direttamente nel pannello laterale KasmVNC.
