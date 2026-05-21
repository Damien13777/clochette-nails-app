#!/usr/bin/env bash
# ============================================================
# Clochette Nails — Deploy script
# À placer à la racine du repo + chmod +x
# Usage : ./deploy.sh
# ============================================================
#
# Suppose que :
#   - Le repo est cloné dans /var/www/clochette-nails
#   - .env.local est déjà rempli
#   - PM2 est installé et a déjà démarré l'app via ecosystem.config.js
#   - On est connecté en tant qu'utilisateur `clochette`
# ============================================================

set -euo pipefail

APP_DIR="/var/www/clochette-nails"
APP_NAME="clochette-nails"
LOG_FILE="/var/log/clochette/deploy.log"

log() { printf "\n\033[1;34m▶ %s\033[0m\n" "$*" | tee -a "$LOG_FILE"; }
ok()  { printf "  \033[1;32m✓\033[0m %s\n" "$*" | tee -a "$LOG_FILE"; }
die() { printf "\n\033[1;31m✗ %s\033[0m\n" "$*" | tee -a "$LOG_FILE" >&2; exit 1; }

cd "$APP_DIR" || die "Répertoire $APP_DIR introuvable"

# Vérifs préalables
[[ -f .env.local ]] || die ".env.local manquant"
command -v pnpm &>/dev/null || die "pnpm non installé"
command -v pm2 &>/dev/null || die "PM2 non installé"

log "1/6 Pull latest from git"
CURRENT_COMMIT=$(git rev-parse HEAD)
git fetch origin
git checkout main
git pull --ff-only origin main
NEW_COMMIT=$(git rev-parse HEAD)
if [[ "$CURRENT_COMMIT" == "$NEW_COMMIT" ]]; then
    ok "déjà à jour ($CURRENT_COMMIT)"
    echo "Rien à déployer. Pour forcer rebuild : ./deploy.sh --force"
    [[ "${1:-}" == "--force" ]] || exit 0
else
    ok "$CURRENT_COMMIT → $NEW_COMMIT"
fi

log "2/6 Install dependencies"
pnpm install --frozen-lockfile
ok "dependencies installées"

log "3/6 Prisma generate + migrate"
pnpm prisma generate
pnpm prisma migrate deploy
# Note : si pas de migrations history, utiliser pnpm prisma db push à la place
# (pattern Academy — voir CLAUDE.md du projet)
ok "Prisma à jour"

log "4/6 Build production"
NODE_ENV=production pnpm build
ok "build OK"

log "5/6 PM2 reload (zero-downtime)"
pm2 reload ecosystem.config.js --update-env
pm2 save
ok "app reloadée"

log "6/6 Healthcheck"
sleep 3
HEALTH_URL="http://localhost:3001/api/v1/health"
if curl -sf "$HEALTH_URL" >/dev/null; then
    ok "healthcheck OK ($HEALTH_URL)"
else
    die "healthcheck KO — vérifier 'pm2 logs $APP_NAME'"
fi

log "✓ Déploiement terminé"
echo "Commit : $NEW_COMMIT"
echo "Logs : pm2 logs $APP_NAME --lines 100"
