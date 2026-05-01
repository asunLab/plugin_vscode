#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# ASUN VS Code 插件 — 跨平台构建脚本
#
# Usage:
#   ./scripts/build.sh              # Build all platforms
#   ./scripts/build.sh current      # Build current platform only, install into VS Code, and reload
#   ./scripts/build.sh darwin-arm64  # Build specified platform
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LSP_DIR="$(cd "$PLUGIN_DIR/../lsp-asun" && pwd)"
SERVER_DIR="$PLUGIN_DIR/server"
CODE_BIN="${CODE_BIN:-code}"

if [[ ! -d "$LSP_DIR" ]]; then
    git clone --depth 1 https://github.com/asunLab/lsp-asun.git "$LSP_DIR"
    if [[ ! -d "$LSP_DIR" ]]; then
        echo "Error: LSP directory not found at $LSP_DIR" >&2
        exit 1
    fi
fi

# ── Platform definitions ─────────────────────────────────────────────────────────
# Format: "vscode-target:zig-target:binary-suffix"
ALL_TARGETS=(
    "darwin-arm64:aarch64-macos:"
    "darwin-x64:x86_64-macos:"
    "linux-x64:x86_64-linux:"
    "linux-arm64:aarch64-linux:"
    "win32-x64:x86_64-windows:.exe"
    "win32-arm64:aarch64-windows:.exe"
)

# ── Helper functions ─────────────────────────────────────────────────────────────

log() { echo -e "\033[1;34m→\033[0m $*"; }
ok()  { echo -e "\033[1;32m✓\033[0m $*"; }
err() { echo -e "\033[1;31m✗\033[0m $*" >&2; }

detect_current_target() {
    local os arch
    os="$(uname -s | tr '[:upper:]' '[:lower:]')"
    arch="$(uname -m)"

    case "$os" in
        darwin) os="darwin" ;;
        linux)  os="linux"  ;;
        *)      err "Unsupported OS: $os"; exit 1 ;;
    esac

    case "$arch" in
        x86_64|amd64) arch="x64" ;;
        arm64|aarch64) arch="arm64" ;;
        *)             err "Unsupported arch: $arch"; exit 1 ;;
    esac

    echo "${os}-${arch}"
}

# ── compile lsp-asun ────────────────────────────────────────────────────────

build_lsp() {
    local zig_target="$1" suffix="$2"
    local output="$SERVER_DIR/lsp-asun${suffix}"
    local prefix="$LSP_DIR/zig-out-${zig_target}"

    log "Compiling lsp-asun for ${zig_target} ..."
    mkdir -p "$SERVER_DIR"

    (
        cd "$LSP_DIR"
        zig build -Dtarget="${zig_target}" --release=small -p "$prefix"
    )

    cp "$prefix/bin/lsp-asun${suffix}" "$output"
    rm -rf "$prefix"

    ok "Built: $output ($(du -h "$output" | awk '{print $1}'))"
}

# ── package vsix ─────────────────────────────────────────────────────────────────

package_vsix() {
    local target="$1"

    log "Packaging VSIX for target: ${target} ..."
    (
        cd "$PLUGIN_DIR"
        npx vsce package --target "$target" --no-git-tag-version
    )
    ok "Packaged: ${target}"
}

find_latest_vsix() {
    local latest="" file
    for file in "$PLUGIN_DIR"/*.vsix; do
        [[ -e "$file" ]] || continue
        if [[ -z "$latest" || "$file" -nt "$latest" ]]; then
            latest="$file"
        fi
    done
    echo "$latest"
}

install_current_vsix() {
    local vsix="$1"

    if [[ -z "$vsix" || ! -f "$vsix" ]]; then
        err "No VSIX package found to install."
        exit 1
    fi

    if ! command -v "$CODE_BIN" >/dev/null 2>&1; then
        err "VS Code CLI not found: $CODE_BIN"
        err "Install the 'code' command in PATH or set CODE_BIN=/path/to/code."
        exit 1
    fi

    log "Installing VSIX into VS Code: $(basename "$vsix")"
    "$CODE_BIN" --install-extension "$vsix" --force
    ok "Installed into VS Code."

    log "Please reload VS Code to activate the new extension. "
    log ""
    log "------------------> Press Ctrl+Shift+P and select 'Reload Window' <-----------------"
}

# ── compile TypeScript ──────────────────────────────────────────────────────────

compile_ts() {
    log "Installing npm dependencies ..."
    (cd "$PLUGIN_DIR" && npm install --silent)
    log "Compiling TypeScript ..."
    (cd "$PLUGIN_DIR" && npm run compile)
    ok "TypeScript compiled."
}

# ── clean ──────────────────────────────────────────────────────────────────────

clean_server() {
    rm -rf "$SERVER_DIR"
}

# ── main ───────────────────────────────────────────────────────────────────────

main() {
    local mode="${1:-all}"
    local built=0

    echo ""
    echo "╔═══════════════════════════════════════════════════╗"
    echo "║    ASUN VS Code Extension — Build Script          ║"
    echo "╚═══════════════════════════════════════════════════╝"
    echo ""

    # Compile TypeScript (only once)
    compile_ts

    rm -f "$PLUGIN_DIR"/*.vsix 2>/dev/null

    if [[ "$mode" == "current" ]]; then
        # Build for current platform only
        local current
        local current_vsix
        current="$(detect_current_target)"
        log "Building for current platform: ${current}"

        for entry in "${ALL_TARGETS[@]}"; do
            IFS=':' read -r target zig_target suffix <<< "$entry"
            if [[ "$target" == "$current" ]]; then
                clean_server
                build_lsp "$zig_target" "$suffix"
                package_vsix "$target"
                current_vsix="$(find_latest_vsix)"
                install_current_vsix "$current_vsix"
                built=1
                break
            fi
        done

        if [[ $built -eq 0 ]]; then
            err "No matching target for: ${current}"
            exit 1
        fi

    elif [[ "$mode" == "all" ]]; then
        # Build for all platforms
        for entry in "${ALL_TARGETS[@]}"; do
            IFS=':' read -r target zig_target suffix <<< "$entry"
            clean_server
            build_lsp "$zig_target" "$suffix"
            package_vsix "$target"
            built=$((built + 1))
        done

    else
        # Build for specified platform
        for entry in "${ALL_TARGETS[@]}"; do
            IFS=':' read -r target zig_target suffix <<< "$entry"
            if [[ "$target" == "$mode" ]]; then
                clean_server
                build_lsp "$zig_target" "$suffix"
                package_vsix "$target"
                built=1
                break
            fi
        done

        if [[ $built -eq 0 ]]; then
            err "Unknown target: ${mode}"
            echo "Available targets:"
            for entry in "${ALL_TARGETS[@]}"; do
                IFS=':' read -r target _ _ <<< "$entry"
                echo "  - $target"
            done
            exit 1
        fi
    fi

    # clean the last server/ directory
    clean_server

    echo ""
    ok "Done! Generated .vsix files:"
    ls -lh "$PLUGIN_DIR"/*.vsix 2>/dev/null || echo "  (none found)"
    echo ""
}

main "$@"
