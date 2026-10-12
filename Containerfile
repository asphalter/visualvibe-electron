# ==============================================================================
# Pinned component versions — update these when new releases come out.
# ==============================================================================
ARG ALMALINUX_VERSION=10
ARG CADDY_COPR=@caddy/caddy
ARG CADDY_COPR_CHROOT=epel-10-x86_64
ARG CODE_SERVER_VERSION=4.140.0
ARG FILEBROWSER_VERSION=1.5.6-stable

FROM almalinux:${ALMALINUX_VERSION}

# Re-declare build arguments needed in build steps (scope resets after FROM)
ARG CADDY_COPR
ARG CADDY_COPR_CHROOT
ARG CODE_SERVER_VERSION
ARG FILEBROWSER_VERSION

# Environment variables
ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8
ENV LANGUAGE=en_US:en

# 1. Install base system utilities, locale, build tools, EPEL and CRB
RUN dnf install -y \
    ca-certificates \
    curl \
    wget \
    gnupg2 \
    glibc-langpack-en \
    sudo \
    procps-ng \
    bash \
    git \
    nano \
    tar \
    gzip \
    xz \
    openssl \
    python3 \
    python3-pip \
    gcc \
    gcc-c++ \
    make \
    dnf-plugins-core \
    epel-release \
    && crb enable \
    && dnf clean all

# 2. Install Chromium headless runtime dependencies and Podman-in-Podman
RUN dnf install -y \
    chromium \
    mesa-libGL \
    mesa-dri-drivers \
    mesa-libgbm \
    dbus \
    xdg-utils \
    alsa-lib \
    libsecret \
    nss \
    at-spi2-atk \
    cups-libs \
    libdrm \
    libXcomposite \
    libXdamage \
    libXfixes \
    libXrandr \
    libxshmfence \
    libxkbfile \
    podman \
    netavark \
    aardvark-dns \
    catatonit \
    fuse-overlayfs \
    slirp4netns \
    shadow-utils \
    python3-pillow \
    && dnf clean all \
    && mkdir -p /etc/chromium \
    && echo 'CHROMIUM_FLAGS="--no-sandbox --test-type --no-first-run --no-default-browser-check --disable-dev-shm-usage --disable-gpu --password-store=basic"' > /etc/chromium/chromium.conf

# 3. Install Caddy from official COPR repository (@caddy/caddy)
RUN dnf copr enable -y "${CADDY_COPR}" "${CADDY_COPR_CHROOT}" \
    && dnf install -y caddy \
    && dnf clean all

# 4. Install code-server (VS Code in the browser via official install script, pinned version)
RUN curl -fsSL https://code-server.dev/install.sh | sh -s -- --version "${CODE_SERVER_VERSION}"

# Remove any bundled Copilot extensions (core workbench.panel.chat is hidden via patch)
RUN rm -rf /usr/lib/code-server/lib/vscode/extensions/*copilot*

# 5. Install FileBrowser Quantum for Web-Native File Transfer (Upload/Download)
RUN curl -fsSL -o /usr/local/bin/filebrowser \
    "https://github.com/gtsteffaniak/filebrowser/releases/download/v${FILEBROWSER_VERSION}/linux-amd64-filebrowser" \
    && chmod +x /usr/local/bin/filebrowser

# 6. Configure non-root 'vvelectron' user (UID 1000) and subuid/subgid mapping
RUN useradd -m -u 1000 -s /bin/bash vvelectron \
    && chown -R vvelectron:vvelectron /home/vvelectron \
    && echo "vvelectron ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/vvelectron \
    && chmod 0440 /etc/sudoers.d/vvelectron \
    && echo "vvelectron:100000:65536" > /etc/subuid \
    && echo "vvelectron:100000:65536" > /etc/subgid

# 7. Pre-install Zoo Code extension into code-server and stage in /opt/visualvibe/extensions
RUN runuser -u vvelectron -- code-server --install-extension ZooCodeOrganization.zoo-code \
    && mkdir -p /opt/visualvibe/extensions \
    && cp -a /home/vvelectron/.local/share/code-server/extensions/* /opt/visualvibe/extensions/

# 8. Stage configuration, media assets, scripts, and the entrypoint.
#    COPY'd here (before the build scripts) so scripts/build/* is available for them.
RUN mkdir -p /opt/visualvibe /opt/visualvibe/config /opt/visualvibe/media /opt/visualvibe/scripts
COPY config/  /opt/visualvibe/config/
COPY media/   /opt/visualvibe/media/
COPY scripts/ /opt/visualvibe/scripts/
COPY VERSION /opt/visualvibe/VERSION
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh \
    && chmod -R +x /opt/visualvibe/scripts/ \
    && ln -sf /usr/bin/chromium-browser /usr/local/bin/chromium 2>/dev/null || \
       ln -sf /usr/bin/chromium /usr/local/bin/chromium 2>/dev/null || true

# 9. Stage custom VisualVibe extensions (copy + rename to publisher.name-version)
COPY extensions/ /opt/visualvibe/extensions/
RUN bash /opt/visualvibe/scripts/build/002_stage-custom-extensions.sh

# 10. Pre-seed code-server settings.json and keybindings.json
RUN bash /opt/visualvibe/scripts/build/003_code-server-settings.sh

# 11. Default nested Podman configuration
RUN mkdir -p /etc/containers \
    && printf '[containers]\ncgroups = "disabled"\n\n[engine]\ncgroup_manager = "cgroupfs"\n' \
       > /etc/containers/containers.conf \
    && printf 'unqualified-search-registries = ["docker.io"]\n' \
       > /etc/containers/registries.conf

# 12. Apply VisualVibe branding (favicons + PWA icons + manifest + workbench icon/CSS)
RUN bash /opt/visualvibe/scripts/build/004_branding.sh

# 13. Expose public ports (Caddy reverse proxy: 80 HTTP redirect, 443 HTTPS, 8000 plain HTTP)
EXPOSE 80 443 8000

# Working directory
WORKDIR /home/vvelectron

# 14. Display VisualVibe Electron banner upon compilation completion
ARG BANNER_CACHEBUST=""
RUN bash /opt/visualvibe/scripts/print_banner.sh

# Entrypoint (catatonit as PID 1 init for signal forwarding and zombie reaping)
ENTRYPOINT ["/usr/libexec/catatonit/catatonit", "--", "/usr/local/bin/entrypoint.sh"]
