#!/usr/bin/env bash
set -euo pipefail
ROOT="${SOUMTOK_CLI_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || true)}"
if [[ -z "$ROOT" || ! -f "$ROOT/cli/bin/soumtok.mjs" ]]; then
  echo "Clone https://github.com/trysoumtok/Soumtok and re-run, or set SOUMTOK_CLI_ROOT." >&2
  exit 1
fi
BIN="$ROOT/cli/bin/soumtok.mjs"
SHIM_DIR="$HOME/.local/bin"
mkdir -p "$SHIM_DIR"
cat > "$SHIM_DIR/soumtok" <<EOF
#!/usr/bin/env bash
exec node "$BIN" "\$@"
EOF
chmod +x "$SHIM_DIR/soumtok"
PATH_LINE='export PATH="$HOME/.local/bin:$PATH"'
if [[ ":$PATH:" != *":$SHIM_DIR:"* ]]; then
  rc="$HOME/.bashrc"
  if [[ -f "$rc" ]] && ! grep -qF '.local/bin' "$rc" 2>/dev/null; then
    printf '\n# Soumtok CLI\n%s\n' "$PATH_LINE" >> "$rc"
    echo "Added ~/.local/bin to ~/.bashrc"
  else
    echo "Add to PATH: $PATH_LINE"
  fi
fi
echo "Soumtok CLI installed. Open a new terminal and run: soumtok login"
