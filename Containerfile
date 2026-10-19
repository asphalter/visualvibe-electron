FROM almalinux:9

# ==============================================================================
# Component versions & configuration
# ==============================================================================
ARG ZOO_VERSION="3.90.0"
ARG KASMVNC_VERSION="1.3.3"
ARG FILEBROWSER_VERSION="1.5.6-stable"
ARG CADDY_COPR="@caddy/caddy"
ARG CADDY_COPR_CHROOT="epel-9-x86_64"

ENV ZOO_VERSION=${ZOO_VERSION}

# 1. Install base system utilities, locale, build tools, EPEL and CRB
RUN dnf install -y --allowerasing \
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
    && (crb enable || dnf config-manager --set-enabled crb) \
    && dnf clean all

# Environment variables
ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8
ENV LANGUAGE=en_US:en

# 2. Install X11 virtual display stack, Openbox kiosk WM, fonts & media libraries
RUN dnf install -y \
    xorg-x11-server-Xvfb \
    xorg-x11-server-utils \
    xorg-x11-xauth \
    xorg-x11-utils \
    xrandr \
    xset \
    xsetroot \
    xdotool \
    wmctrl \
    openbox \
    fontconfig \
    dejavu-sans-fonts \
    dejavu-sans-mono-fonts \
    liberation-fonts \
    liberation-mono-fonts \
    google-noto-sans-fonts \
    google-noto-emoji-color-fonts \
    google-noto-emoji-fonts \
    libvpx \
    libwebp \
    libjpeg-turbo \
    pixman \
    perl \
    mesa-libGL \
    mesa-dri-drivers \
    mesa-libgbm \
    gtk3 \
    libnotify \
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
    dbus \
    dbus-x11 \
    xdg-utils \
    alsa-lib \
    chromium \
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

# 3. Install VSCodium (native desktop IDE)
RUN rpm --import https://gitlab.com/paulcarroty/vscodium-deb-rpm-repo/-/raw/master/pub.gpg \
    && cat <<'EOF' > /etc/yum.repos.d/vscodium.repo
[gitlab.com_paulcarroty_vscodium_repo]
name=download.vscodium.com
baseurl=https://download.vscodium.com/rpms/
enabled=1
gpgcheck=1
repo_gpgcheck=1
gpgkey=https://gitlab.com/paulcarroty/vscodium-deb-rpm-repo/-/raw/master/pub.gpg
metadata_expire=1h
EOF
RUN dnf install -y codium && dnf clean all \
    && printf '%s\n' \
        '#!/bin/bash' \
        'if [ "$(id -u)" -eq 0 ]; then' \
        '    exec /usr/bin/codium --no-sandbox --user-data-dir /tmp/codium-root "$@"' \
        'else' \
        '    exec /usr/bin/codium "$@"' \
        'fi' > /usr/local/bin/codium \
    && chmod +x /usr/local/bin/codium

# 4. Install KasmVNC Server
RUN curl -fsSL -o /tmp/kasmvnc.rpm \
    "https://github.com/kasmtech/KasmVNC/releases/download/v${KASMVNC_VERSION}/kasmvncserver_oracle_9_${KASMVNC_VERSION}_x86_64.rpm" \
    && (dnf install -y /tmp/kasmvnc.rpm || rpm -ivh --nodeps /tmp/kasmvnc.rpm) \
    && rm -f /tmp/kasmvnc.rpm \
    && printf '%s\n' \
        '#!/bin/bash' \
        'if [ "$1" = "--version" ] || [ "$1" = "-version" ] || [ "$1" = "-v" ]; then' \
        '    exec /usr/bin/Xvnc -version' \
        'else' \
        '    exec /usr/bin/vncserver "$@"' \
        'fi' > /usr/local/bin/kasmvncserver \
    && chmod +x /usr/local/bin/kasmvncserver \
    && dnf clean all

# 5. Install Caddy from official COPR repository (@caddy/caddy)
RUN dnf copr enable -y "${CADDY_COPR}" "${CADDY_COPR_CHROOT}" \
    && dnf install -y caddy \
    && dnf clean all

# 6. Install FileBrowser Quantum for Web-Native File Transfer (Upload/Download)
RUN curl -fsSL -o /usr/local/bin/filebrowser \
    "https://github.com/gtsteffaniak/filebrowser/releases/download/v${FILEBROWSER_VERSION}/linux-amd64-filebrowser" \
    && chmod +x /usr/local/bin/filebrowser

# 7. Configure non-root 'vvelectron' user (UID 1000) and subuid/subgid mapping
RUN useradd -m -u 1000 -s /bin/bash vvelectron \
    && chown -R vvelectron:vvelectron /home/vvelectron \
    && echo "vvelectron ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/vvelectron \
    && chmod 0440 /etc/sudoers.d/vvelectron \
    && echo "vvelectron:100000:65536" > /etc/subuid \
    && echo "vvelectron:100000:65536" > /etc/subgid

# 8. Configure rootless Podman storage defaults
COPY config/containers-storage.conf /etc/containers/storage.conf
RUN chmod 644 /etc/containers/storage.conf

# 9. Copy all VisualVibe assets, scripts, configs, and custom extensions
COPY VERSION /opt/visualvibe/VERSION
COPY config/ /opt/visualvibe/config/
RUN cp -f /opt/visualvibe/config/kasmvnc.yaml /etc/kasmvnc/kasmvnc.yaml
COPY media/ /opt/visualvibe/media/
COPY scripts/ /opt/visualvibe/scripts/
COPY extensions/ /opt/visualvibe/extensions/

# 9b. Install sidebar browser launcher used by the KasmVNC left menu
COPY scripts/open-browser /usr/local/bin/open-browser
RUN chmod 755 /usr/local/bin/open-browser \
    && chmod +x /opt/visualvibe/scripts/open-browser \
    && ln -sf /usr/bin/chromium-browser /usr/local/bin/chromium

# 10. Download and validate Zoo Code VSIX extension
RUN echo "Downloading Zoo Code ${ZOO_VERSION} VSIX extension..." \
    && curl -fsSL -o /opt/visualvibe/extensions/zoo.vsix \
        "https://open-vsx.org/api/ZooCodeOrganization/zoo-code/${ZOO_VERSION}/file/ZooCodeOrganization.zoo-code-${ZOO_VERSION}.vsix" \
    && [ -s /opt/visualvibe/extensions/zoo.vsix ] \
    && [ $(stat -c %s /opt/visualvibe/extensions/zoo.vsix) -gt 10000000 ] \
    && chmod 644 /opt/visualvibe/extensions/zoo.vsix \
    && echo "Zoo Code VSIX ${ZOO_VERSION} downloaded and validated successfully ($(stat -c %s /opt/visualvibe/extensions/zoo.vsix) bytes)."

# 11. Execute build-time scripts and clean up bytecode caches
RUN chmod +x /opt/visualvibe/scripts/build/*.sh /opt/visualvibe/scripts/boot/*.sh \
    && for script in $(ls /opt/visualvibe/scripts/build/*.sh | sort); do \
        echo "Executing build script: $script" && bash "$script"; \
    done \
    && find /opt/visualvibe/scripts -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true \
    && find /opt/visualvibe/scripts -type f \( -name "*.pyc" -o -name "*.pyo" \) -delete 2>/dev/null || true \
    && chown -R vvelectron:vvelectron /home/vvelectron

# 12. Entrypoint and ports
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Ports: only Caddy is exposed externally
#   80   — Plain HTTP redirect to HTTPS
#   443  — Persistent HTTPS (KasmVNC Web/WebSocket root + /filebrowser/ path)
#   8000 — Plain HTTP upstream ingress (Cloudflare Tunnel, reverse proxies)
# Internal services (KasmVNC on 8444, FileBrowser on 8081) bind strictly to 127.0.0.1
EXPOSE 80 443 8000

# 13. Symlink and display build-completion ASCII art banner
RUN ln -sf /opt/visualvibe/scripts/print_banner.sh /usr/local/bin/print_banner.sh \
    && /usr/local/bin/print_banner.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
