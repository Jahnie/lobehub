#!/bin/sh
set -e

# 从本仓库的 Release 下载预编译二进制
REPO="lobehub/lobehub"
BIN_NAME="lh"

# 检测操作系统
case "$(uname -s)" in
  Linux)  OS="linux" ;;
  Darwin) OS="macos" ;;
  *)
    printf 'Error: Unsupported OS: %s\n' "$(uname -s)" >&2
    exit 1
    ;;
esac

# 检测 CPU 架构
case "$(uname -m)" in
  x86_64)        ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *)
    printf 'Error: Unsupported architecture: %s\n' "$(uname -m)" >&2
    exit 1
    ;;
esac

BINARY="lobe-${OS}-${ARCH}"
URL="https://github.com/${REPO}/releases/latest/download/${BINARY}"

printf 'Detected: %s/%s\n' "$OS" "$ARCH"
printf 'Downloading %s...\n' "$BINARY"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$URL" -o "$TMP"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$TMP" "$URL"
else
  printf 'Error: curl or wget is required\n' >&2
  exit 1
fi

chmod +x "$TMP"

# 选择安装目录：优先 /usr/local/bin，否则退回 ~/.local/bin
USE_SUDO=0
if [ -w "/usr/local/bin" ]; then
  INSTALL_DIR="/usr/local/bin"
elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
  INSTALL_DIR="/usr/local/bin"
  USE_SUDO=1
else
  INSTALL_DIR="${HOME}/.local/bin"
  mkdir -p "$INSTALL_DIR"
  printf 'Note: No sudo access. Installing to %s\n' "$INSTALL_DIR"
  printf 'Add the following to your shell profile if needed:\n'
  printf '  export PATH="%s:$PATH"\n' "$INSTALL_DIR"
fi

# 安装二进制并创建 lobe / lobehub 别名
if [ "$USE_SUDO" = "1" ]; then
  sudo cp "$TMP" "${INSTALL_DIR}/${BIN_NAME}"
  sudo chmod +x "${INSTALL_DIR}/${BIN_NAME}"
  sudo ln -sf "${INSTALL_DIR}/${BIN_NAME}" "${INSTALL_DIR}/lobe"
  sudo ln -sf "${INSTALL_DIR}/${BIN_NAME}" "${INSTALL_DIR}/lobehub"
else
  cp "$TMP" "${INSTALL_DIR}/${BIN_NAME}"
  chmod +x "${INSTALL_DIR}/${BIN_NAME}"
  ln -sf "${INSTALL_DIR}/${BIN_NAME}" "${INSTALL_DIR}/lobe"
  ln -sf "${INSTALL_DIR}/${BIN_NAME}" "${INSTALL_DIR}/lobehub"
fi

printf '\nInstalled successfully!\n'
printf '  Binary:   %s/%s\n' "$INSTALL_DIR" "$BIN_NAME"
printf '  Symlinks: lobe, lobehub -> lh\n\n'
"${INSTALL_DIR}/${BIN_NAME}" --version
