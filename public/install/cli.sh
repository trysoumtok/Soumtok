#!/usr/bin/env bash
set -euo pipefail
INSTALL_DIR="${SOUMTOK_CLI_ROOT:-$HOME/Soumtok}"
if [[ ! -f "$INSTALL_DIR/cli/bin/soumtok.mjs" ]]; then
  rm -rf "$INSTALL_DIR"
  git clone --depth 1 https://github.com/trysoumtok/Soumtok.git "$INSTALL_DIR"
fi
export SOUMTOK_CLI_ROOT="$INSTALL_DIR"
bash "$INSTALL_DIR/scripts/install-cli.sh"
