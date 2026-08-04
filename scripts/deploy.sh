#!/usr/bin/env bash
# Run on the Oracle Cloud server (from the nammane repo root).
# Used by GitHub Actions after each push to main, or manually:
#   ./scripts/deploy.sh
#
# When READ_PIN, WRITE_PIN, SPREADSHEET_ID, and DRIVE_ROOT_FOLDER_ID are set
# (as from GitHub Actions secrets), this script rewrites .env before restart.
# When none are set (manual server run), the existing .env is left alone.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Syncing to origin/main"
git fetch origin
git reset --hard origin/main

write_dotenv_from_env() {
  local required=(READ_PIN WRITE_PIN SPREADSHEET_ID DRIVE_ROOT_FOLDER_ID)
  local present=0
  local missing=()
  local name

  for name in "${required[@]}"; do
    if [[ -n "${!name:-}" ]]; then
      present=$((present + 1))
    else
      missing+=("$name")
    fi
  done

  if (( present == 0 )); then
    echo "==> Skipping .env write (no app secrets in environment; keeping existing .env)"
    return 0
  fi

  if (( ${#missing[@]} > 0 )); then
    echo "ERROR: partial app secrets — set all of: ${required[*]}" >&2
    echo "       missing: ${missing[*]}" >&2
    exit 1
  fi

  echo "==> Writing .env from environment"
  local tmp
  tmp="$(mktemp "$ROOT/.env.tmp.XXXXXX")"
  # Restrict permissions before writing secrets
  chmod 600 "$tmp"
  {
    printf 'READ_PIN=%s\n' "$READ_PIN"
    printf 'WRITE_PIN=%s\n' "$WRITE_PIN"
    printf 'SPREADSHEET_ID=%s\n' "$SPREADSHEET_ID"
    printf 'DRIVE_ROOT_FOLDER_ID=%s\n' "$DRIVE_ROOT_FOLDER_ID"
  } >"$tmp"
  mv "$tmp" "$ROOT/.env"
  chmod 600 "$ROOT/.env"
}

write_dotenv_from_env

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
