#!/usr/bin/env bash
# Run on the Oracle Cloud server (from the nammane repo root).
# Used by GitHub Actions after each push to main, or manually:
#   ./scripts/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Syncing to origin/main"
git fetch origin
git reset --hard origin/main

echo "==> Activating venv"
if [[ ! -f "$ROOT/venv/bin/activate" ]]; then
  echo "ERROR: venv not found at $ROOT/venv. Create with: python3 -m venv venv" >&2
  exit 1
fi
# shellcheck disable=SC1091
source "$ROOT/venv/bin/activate"

echo "==> Installing dependencies (no-op if already satisfied)"
pip install -r requirements.txt

echo "==> Restarting nammane"
sudo systemctl restart nammane
sudo systemctl --no-pager --full status nammane || true

echo "==> Deploy complete"
