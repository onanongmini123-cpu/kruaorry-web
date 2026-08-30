#!/usr/bin/env bash
# Decrypts a backup downloaded from the "Database backup" GitHub Action
# (Actions tab -> that workflow run -> Artifacts) and restores it into a
# Postgres database.
#
# Usage:
#   ./scripts/restore-db-backup.sh backup.dump.gpg "postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres"
#
# The target is almost never the live production database — restore into a
# fresh local Postgres, a Supabase branch, or a new project first, verify
# the data, and only then decide how (or whether) to apply it to production.
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: $0 <encrypted-backup-file> <postgres-connection-string>" >&2
  exit 1
fi

ENCRYPTED_FILE="$1"
TARGET_DB="$2"
DECRYPTED_FILE="${ENCRYPTED_FILE%.gpg}"

echo "Decrypting $ENCRYPTED_FILE ..."
gpg --batch --yes --decrypt -o "$DECRYPTED_FILE" "$ENCRYPTED_FILE"

echo "Restoring into $TARGET_DB ..."
pg_restore --no-owner --no-privileges --clean --if-exists -d "$TARGET_DB" "$DECRYPTED_FILE"

echo "Done. Decrypted dump left at $DECRYPTED_FILE — delete it once you've confirmed the restore."
