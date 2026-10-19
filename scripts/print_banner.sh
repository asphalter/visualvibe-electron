#!/bin/bash
# ==============================================================================
# VisualVibe Electron — ASCII Banner
# ==============================================================================

print_visualvibe_banner() {
    local C0=$'\033[0m'
    local CN=$'\033[1;36m'
    local CL=$'\033[1;37m'
    local CG=$'\033[1;32m'

    if [ -f "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh" ]; then
        source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
    elif [ -f /opt/visualvibe/scripts/lib/common.sh ]; then
        source /opt/visualvibe/scripts/lib/common.sh
    fi

    local VV_VERSION=""
    for vpath in "${VV_BASE:-/opt/visualvibe}/VERSION" "$(dirname "${BASH_SOURCE[0]}")/../VERSION"; do
        if [ -f "$vpath" ]; then
            VV_VERSION="$(cat "$vpath" 2>/dev/null | tr -d '[:space:]')"
            [ -n "$VV_VERSION" ] && break
        fi
    done

    cat <<EOF

 ${CN}  ██╗   ██╗██╗███████╗██╗   ██╗ █████╗ ██╗     ██╗   ██╗██╗██████╗ ███████╗${C0}
 ${CN}  ██║   ██║██║██╔════╝██║   ██║██╔══██╗██║     ██║   ██║██║██╔══██╗██╔════╝${C0}
 ${CN}  ██║   ██║██║███████╗██║   ██║███████║██║     ██║   ██║██║██████╔╝█████╗  ${C0}
 ${CN}  ╚██╗ ██╔╝██║╚════██║██║   ██║██╔══██║██║     ╚██╗ ██╔╝██║██╔══██╗██╔══╝  ${C0}
 ${CN}   ╚████╔╝ ██║███████║╚██████╔╝██║  ██║███████╗ ╚████╔╝ ██║██████╔╝███████╗${C0}
 ${CN}    ╚═══╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝  ╚═══╝  ╚═╝╚═════╝ ╚══════╝${C0}

 ${CN} ███████╗██╗     ███████╗ ██████╗████████╗██████╗  ██████╗ ███╗   ██╗${C0}
 ${CN} ██╔════╝██║     ██╔════╝██╔════╝╚══██╔══╝██╔══██╗██╔═══██╗████╗  ██║${C0}
 ${CN} █████╗  ██║     █████╗  ██║        ██║   ██████╔╝██║   ██║██╔██╗ ██║${C0}
 ${CN} ██╔══╝  ██║     ██╔══╝  ██║        ██║   ██╔══██╗██║   ██║██║╚██╗██║${C0}
 ${CN} ███████╗███████╗███████╗╚██████╗   ██║   ██║  ██║╚██████╔╝██║ ╚████║${C0}
 ${CN} ╚══════╝╚══════╝╚══════╝ ╚═════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝${C0}

 ${CL}      V I S U A L V I B E     E L E C T R O N     E N V I R O N M E N T     ${C0}
EOF

    if [ -n "$VV_VERSION" ]; then
        printf "%s\n\n" " ${CG}                         v.${VV_VERSION}${C0}"
    else
        printf "\n"
    fi
}

# If executed directly, run the function
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    print_visualvibe_banner
fi
