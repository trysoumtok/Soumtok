#!/usr/bin/env bash
# Legacy URL — routes to macOS or Linux installer
set -euo pipefail
case "$(uname -s)" in
  Darwin) exec bash -c "$(curl -fsSL https://soumtok.com/install/cli-macos.sh)" ;;
  Linux) exec bash -c "$(curl -fsSL https://soumtok.com/install/cli-linux.sh)" ;;
  *) echo "Use https://soumtok.com/download#terminal for your platform." >&2; exit 1 ;;
esac
