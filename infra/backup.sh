#!/usr/bin/env bash
# ============================================================
# Clochette Nails — Backup script
# pg_dump des 3 DBs + rsync uploads + rétention
# À placer dans /usr/local/bin/clochette-backup (chmod +x)
# Cron : 0 3 * * * /usr/local/bin/clochette-backup
# ============================================================

set -euo pipefail

# ────────────────────────────────────────────────────────────
# CONFIG
# ────────────────────────────────────────────────────────────

BACKUP_DIR="/var/backups"
PG_DIR="$BACKUP_DIR/postgres"
UPLOADS_DIR="$BACKUP_DIR/uploads"
LOG_FILE="/var/log/clochette/backup.log"

DATE=$(date +%Y-%m-%d)
DBS=(clochette_db academy_db management_db)

# Rétention : 7 daily + 4 weekly + 6 monthly
RETENTION_DAILY=7
RETENTION_WEEKLY=4
RETENTION_MONTHLY=6

# ────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────

mkdir -p "$PG_DIR/daily" "$PG_DIR/weekly" "$PG_DIR/monthly"
mkdir -p "$UPLOADS_DIR/daily" "$UPLOADS_DIR/weekly" "$UPLOADS_DIR/monthly"
mkdir -p "$(dirname "$LOG_FILE")"

log() { printf "[%s] %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG_FILE"; }

DAY_OF_WEEK=$(date +%u)   # 1 = lundi, 7 = dimanche
DAY_OF_MONTH=$(date +%d)

# ────────────────────────────────────────────────────────────
# 1. pg_dump des 3 DBs
# ────────────────────────────────────────────────────────────

log "▶ Backup Postgres"

for db in "${DBS[@]}"; do
    # Vérifier que la DB existe avant de dumper
    if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" 2>/dev/null | grep -q 1; then
        log "  ⚠ DB $db inexistante, skip"
        continue
    fi

    DUMP_FILE="$PG_DIR/daily/${db}-${DATE}.sql.gz"
    sudo -u postgres pg_dump -Fc "$db" 2>/dev/null | gzip -9 > "$DUMP_FILE"
    SIZE=$(du -h "$DUMP_FILE" | cut -f1)
    log "  ✓ $db dumpé ($SIZE) → $DUMP_FILE"

    # Copie weekly (le dimanche)
    [[ "$DAY_OF_WEEK" == "7" ]] && cp "$DUMP_FILE" "$PG_DIR/weekly/${db}-${DATE}.sql.gz"
    # Copie monthly (le 1er du mois)
    [[ "$DAY_OF_MONTH" == "01" ]] && cp "$DUMP_FILE" "$PG_DIR/monthly/${db}-${DATE}.sql.gz"
done

# ────────────────────────────────────────────────────────────
# 2. Rsync des uploads (incrémental)
# ────────────────────────────────────────────────────────────

log "▶ Backup uploads"

UPLOADS_SRC="/var/www/clochette-nails/public/uploads"
if [[ -d "$UPLOADS_SRC" ]]; then
    rsync -a --delete "$UPLOADS_SRC/" "$UPLOADS_DIR/daily/clochette-nails/"
    SIZE=$(du -sh "$UPLOADS_DIR/daily/clochette-nails/" | cut -f1)
    log "  ✓ Clochette uploads synced ($SIZE)"

    # Snapshot weekly et monthly (full copy archivé)
    if [[ "$DAY_OF_WEEK" == "7" ]]; then
        tar -czf "$UPLOADS_DIR/weekly/clochette-uploads-${DATE}.tar.gz" -C "$UPLOADS_DIR/daily" clochette-nails 2>/dev/null
        log "  ✓ snapshot weekly créé"
    fi
    if [[ "$DAY_OF_MONTH" == "01" ]]; then
        tar -czf "$UPLOADS_DIR/monthly/clochette-uploads-${DATE}.tar.gz" -C "$UPLOADS_DIR/daily" clochette-nails 2>/dev/null
        log "  ✓ snapshot monthly créé"
    fi
fi

# Idem pour academy + management si déployés
for app in nails-academy nails-management; do
    SRC="/var/www/$app/public/uploads"
    if [[ -d "$SRC" ]]; then
        rsync -a --delete "$SRC/" "$UPLOADS_DIR/daily/$app/"
        log "  ✓ $app uploads synced"
    fi
done

# ────────────────────────────────────────────────────────────
# 3. Rétention — clean old backups
# ────────────────────────────────────────────────────────────

log "▶ Rétention"

# Postgres
find "$PG_DIR/daily" -name "*.sql.gz" -mtime +"$RETENTION_DAILY" -delete -print | while read f; do log "  - daily: $(basename $f)"; done
find "$PG_DIR/weekly" -name "*.sql.gz" -mtime +"$((RETENTION_WEEKLY * 7))" -delete -print | while read f; do log "  - weekly: $(basename $f)"; done
find "$PG_DIR/monthly" -name "*.sql.gz" -mtime +"$((RETENTION_MONTHLY * 31))" -delete -print | while read f; do log "  - monthly: $(basename $f)"; done

# Uploads weekly + monthly archives
find "$UPLOADS_DIR/weekly" -name "*.tar.gz" -mtime +"$((RETENTION_WEEKLY * 7))" -delete -print | while read f; do log "  - uploads weekly: $(basename $f)"; done
find "$UPLOADS_DIR/monthly" -name "*.tar.gz" -mtime +"$((RETENTION_MONTHLY * 31))" -delete -print | while read f; do log "  - uploads monthly: $(basename $f)"; done

# ────────────────────────────────────────────────────────────
# 4. Sanity check : taille totale + espace dispo
# ────────────────────────────────────────────────────────────

TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
FREE_SPACE=$(df -h "$BACKUP_DIR" | awk 'NR==2 {print $4}')
log "▶ Taille totale backups : $TOTAL_SIZE — espace libre disque : $FREE_SPACE"

# Alerte si moins de 5 GB libre
FREE_BYTES=$(df -B1 "$BACKUP_DIR" | awk 'NR==2 {print $4}')
if [[ "$FREE_BYTES" -lt $((5 * 1024 * 1024 * 1024)) ]]; then
    log "  ⚠ ATTENTION : moins de 5 GB libres sur le disque !"
    # TODO : envoyer un email d'alerte via mailx ou Resend API
fi

log "✓ Backup terminé"
echo ""
