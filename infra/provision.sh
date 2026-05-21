#!/usr/bin/env bash
# ============================================================
# Clochette Nails — VPS provisioning (Hostinger KVM2)
# Ubuntu 24.04 LTS · Node 22 · Postgres 16 · Nginx · PM2
# ============================================================
#
# USAGE :
#   1. Éditer les variables ci-dessous (ADMIN_USER, ADMIN_SSH_KEY...)
#   2. scp provision.sh root@<IP_VPS>:/root/
#   3. ssh root@<IP_VPS>
#   4. bash /root/provision.sh 2>&1 | tee /var/log/provision.log
#
# Idempotent : peut être relancé sans casser l'existant.
# ============================================================

set -euo pipefail

# ────────────────────────────────────────────────────────────
# VARIABLES — À REMPLIR AVANT LANCEMENT
# ────────────────────────────────────────────────────────────

ADMIN_USER="clochette"
ADMIN_SSH_KEY="ssh-ed25519 AAAA... damien@clochette-nails"  # ← coller ta clé publique ici
EMAIL_ADMIN="contact@clochette-nails.fr"
TIMEZONE="Europe/Paris"

# Ne pas modifier ci-dessous sauf si tu sais ce que tu fais
NODE_MAJOR="22"
POSTGRES_MAJOR="16"

# ────────────────────────────────────────────────────────────
# HELPERS
# ────────────────────────────────────────────────────────────

log()  { printf "\n\033[1;34m▶ %s\033[0m\n" "$*"; }
ok()   { printf "  \033[1;32m✓\033[0m %s\n" "$*"; }
warn() { printf "  \033[1;33m⚠\033[0m %s\n" "$*"; }
die()  { printf "\n\033[1;31m✗ %s\033[0m\n" "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Ce script doit être lancé en root."
[[ "$ADMIN_SSH_KEY" == ssh-* ]] || die "ADMIN_SSH_KEY doit commencer par 'ssh-' (clé publique attendue)."

# Détection système
. /etc/os-release
[[ "$ID" == "ubuntu" ]] || die "Ubuntu requis (détecté : $ID)."
[[ "${VERSION_ID%%.*}" -ge 22 ]] || die "Ubuntu 22.04+ requis (détecté : $VERSION_ID)."

# ────────────────────────────────────────────────────────────
# 1. Système — mises à jour + outils de base
# ────────────────────────────────────────────────────────────

log "1/12 Système : mises à jour + outils de base"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
    curl wget git ca-certificates gnupg lsb-release \
    build-essential ufw fail2ban unattended-upgrades \
    htop ncdu jq unzip vim \
    libvips-dev  # pour Sharp (compression images)
ok "système à jour, outils installés"

# Timezone
timedatectl set-timezone "$TIMEZONE"
ok "timezone : $TIMEZONE"

# ────────────────────────────────────────────────────────────
# 2. Création utilisateur admin
# ────────────────────────────────────────────────────────────

log "2/12 Utilisateur admin : $ADMIN_USER"
if id "$ADMIN_USER" &>/dev/null; then
    ok "user $ADMIN_USER existe déjà"
else
    adduser --disabled-password --gecos "" "$ADMIN_USER"
    usermod -aG sudo "$ADMIN_USER"
    ok "user $ADMIN_USER créé + sudo"
fi

# SSH key
USER_HOME="/home/$ADMIN_USER"
mkdir -p "$USER_HOME/.ssh"
chmod 700 "$USER_HOME/.ssh"
if ! grep -qF "$ADMIN_SSH_KEY" "$USER_HOME/.ssh/authorized_keys" 2>/dev/null; then
    echo "$ADMIN_SSH_KEY" >> "$USER_HOME/.ssh/authorized_keys"
fi
chmod 600 "$USER_HOME/.ssh/authorized_keys"
chown -R "$ADMIN_USER:$ADMIN_USER" "$USER_HOME/.ssh"
ok "clé SSH installée"

# Sudo sans password (optionnel, pour scripts) :
echo "$ADMIN_USER ALL=(ALL) NOPASSWD: ALL" > "/etc/sudoers.d/$ADMIN_USER"
chmod 0440 "/etc/sudoers.d/$ADMIN_USER"
ok "sudo sans password pour $ADMIN_USER"

# ────────────────────────────────────────────────────────────
# 3. Durcissement SSH
# ────────────────────────────────────────────────────────────

log "3/12 SSH hardening"
SSHD_CONF="/etc/ssh/sshd_config"
SSHD_HARDEN="/etc/ssh/sshd_config.d/99-hardening.conf"

cat > "$SSHD_HARDEN" <<'EOF'
# Hardening — chargé après sshd_config principal
PermitRootLogin no
PasswordAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
KbdInteractiveAuthentication no
UsePAM yes
X11Forwarding no
PrintMotd no
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
EOF

# Vérifier que le user admin peut se connecter AVANT de reload
if ! grep -q "^AllowUsers" "$SSHD_CONF" 2>/dev/null; then
    echo "AllowUsers $ADMIN_USER" >> "$SSHD_HARDEN"
fi

sshd -t || die "Config SSH invalide — pas de reload pour éviter de te lock out"
systemctl reload ssh || systemctl reload sshd
ok "SSH durci, root login désactivé"
warn "Garde une session SSH ouverte avant de tester la reconnexion en tant que $ADMIN_USER"

# ────────────────────────────────────────────────────────────
# 4. Firewall UFW
# ────────────────────────────────────────────────────────────

log "4/12 Firewall UFW"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable
ok "UFW actif : 22, 80, 443 ouverts"

# ────────────────────────────────────────────────────────────
# 5. fail2ban
# ────────────────────────────────────────────────────────────

log "5/12 fail2ban"
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port = ssh
logpath = %(sshd_log)s
backend = systemd
EOF
systemctl enable --now fail2ban
ok "fail2ban actif sur SSH"

# ────────────────────────────────────────────────────────────
# 6. Unattended upgrades (sécurité auto)
# ────────────────────────────────────────────────────────────

log "6/12 Unattended security upgrades"
cat > /etc/apt/apt.conf.d/50unattended-upgrades <<'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
EOF
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
ok "unattended-upgrades actif"

# ────────────────────────────────────────────────────────────
# 7. Node.js 22 + pnpm via corepack
# ────────────────────────────────────────────────────────────

log "7/12 Node.js $NODE_MAJOR + pnpm"
if ! command -v node &>/dev/null || [[ "$(node -v | sed 's/v//;s/\..*//')" != "$NODE_MAJOR" ]]; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt-get install -y -qq nodejs
fi
ok "Node $(node -v)"

corepack enable
corepack prepare pnpm@latest --activate
ok "pnpm $(pnpm -v)"

# ────────────────────────────────────────────────────────────
# 8. PostgreSQL 16 + tuning 8 GB RAM
# ────────────────────────────────────────────────────────────

log "8/12 PostgreSQL $POSTGRES_MAJOR"
if ! command -v psql &>/dev/null; then
    install -d /usr/share/postgresql-common/pgdg
    curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
        --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc
    sh -c "echo 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main' > /etc/apt/sources.list.d/pgdg.list"
    apt-get update -qq
    apt-get install -y -qq "postgresql-$POSTGRES_MAJOR" "postgresql-contrib-$POSTGRES_MAJOR"
fi
ok "Postgres $(psql --version | awk '{print $3}')"

# Tuning pour 8 GB RAM
PG_CONF="/etc/postgresql/$POSTGRES_MAJOR/main/postgresql.conf"
if ! grep -q "# Clochette tuning" "$PG_CONF"; then
    cat >> "$PG_CONF" <<'EOF'

# ── Clochette tuning (8 GB RAM VPS) ──
listen_addresses = 'localhost'
shared_buffers = 2GB
effective_cache_size = 4GB
maintenance_work_mem = 256MB
work_mem = 16MB
max_connections = 100
random_page_cost = 1.1
effective_io_concurrency = 200
wal_buffers = 16MB
min_wal_size = 1GB
max_wal_size = 4GB
checkpoint_completion_target = 0.9
EOF
    systemctl restart postgresql
    ok "Postgres tuné pour 8 GB RAM + listen localhost"
else
    ok "tuning déjà appliqué"
fi

systemctl enable postgresql

# ────────────────────────────────────────────────────────────
# 9. Nginx
# ────────────────────────────────────────────────────────────

log "9/12 Nginx"
apt-get install -y -qq nginx
systemctl enable --now nginx

# Cleanup default
rm -f /etc/nginx/sites-enabled/default

# Snippet sécurité réutilisable
mkdir -p /etc/nginx/snippets
cat > /etc/nginx/snippets/security-headers.conf <<'EOF'
# Headers de sécurité standard
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=(self)" always;
# CSP : à personnaliser par app, défaut restrictif
add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline' https://js.stripe.com https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; frame-src https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com; connect-src 'self' https://api.stripe.com" always;
EOF

# Compression Brotli + gzip
cat > /etc/nginx/conf.d/compression.conf <<'EOF'
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_min_length 256;
gzip_types
    application/javascript application/json application/xml
    text/css text/javascript text/plain text/xml
    image/svg+xml font/woff2;
EOF

nginx -t && systemctl reload nginx
ok "Nginx prêt, snippets installés"

# ────────────────────────────────────────────────────────────
# 10. Certbot (Let's Encrypt)
# ────────────────────────────────────────────────────────────

log "10/12 Certbot"
apt-get install -y -qq certbot python3-certbot-nginx
ok "Certbot installé"
warn "Lancer manuellement après config DNS : sudo certbot --nginx -d clochette-nails.fr -d www.clochette-nails.fr --email $EMAIL_ADMIN --agree-tos --redirect"

# ────────────────────────────────────────────────────────────
# 11. PM2 (process manager)
# ────────────────────────────────────────────────────────────

log "11/12 PM2"
npm install -g pm2
sudo -u "$ADMIN_USER" pm2 install pm2-logrotate
sudo -u "$ADMIN_USER" pm2 set pm2-logrotate:max_size 10M
sudo -u "$ADMIN_USER" pm2 set pm2-logrotate:retain 14
sudo -u "$ADMIN_USER" pm2 set pm2-logrotate:compress true
ok "PM2 installé + logrotate"
warn "Lancer manuellement en tant que $ADMIN_USER : pm2 startup → suivre les instructions → pm2 save"

# ────────────────────────────────────────────────────────────
# 12. Arborescence /var/www + /var/backups + /var/log
# ────────────────────────────────────────────────────────────

log "12/12 Arborescence applicative"
mkdir -p /var/www
chown -R "$ADMIN_USER:$ADMIN_USER" /var/www

mkdir -p /var/backups/postgres /var/backups/uploads
chown -R "$ADMIN_USER:$ADMIN_USER" /var/backups

mkdir -p /var/log/clochette
chown -R "$ADMIN_USER:$ADMIN_USER" /var/log/clochette
ok "/var/www, /var/backups, /var/log/clochette prêts"

# ────────────────────────────────────────────────────────────
# Fin
# ────────────────────────────────────────────────────────────

log "✓ Provisioning terminé"
cat <<EOF

Prochaines étapes :

1. Tester la connexion en tant que $ADMIN_USER depuis une AUTRE session :
   ssh -i ~/.ssh/clochette_vps $ADMIN_USER@$(hostname -I | awk '{print $1}')

2. Si la connexion fonctionne, fermer la session root et continuer avec $ADMIN_USER.

3. Lancer postgres-setup.sh pour créer les 3 DBs :
   sudo bash /root/postgres-setup.sh

4. Configurer DNS Cloudflare → IP de ce VPS : $(hostname -I | awk '{print $1}')

5. Une fois DNS propagé, obtenir SSL :
   sudo certbot --nginx -d clochette-nails.fr -d www.clochette-nails.fr \\
       --email $EMAIL_ADMIN --agree-tos --redirect

6. Cloner le repo Clochette dans /var/www, configurer .env.local, déployer.

7. Configurer le cron de backups :
   sudo cp /root/backup.sh /usr/local/bin/clochette-backup
   sudo chmod +x /usr/local/bin/clochette-backup
   echo "0 3 * * * /usr/local/bin/clochette-backup" | sudo crontab -

Logs du provisioning : /var/log/provision.log
EOF
