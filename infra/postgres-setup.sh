#!/usr/bin/env bash
# ============================================================
# Clochette Nails — Postgres DBs setup
# Crée 3 DBs (clochette_db, academy_db, management_db) avec
# 3 users dédiés (accès strict à leur propre DB)
# ============================================================
#
# USAGE :
#   sudo bash postgres-setup.sh
#
# Affiche les passwords générés + connection strings en clair UNE FOIS.
# Les passwords ne sont pas re-affichables, à copier dans un password
# manager + dans le .env.local de chaque app.
# ============================================================

set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "À lancer avec sudo"; exit 1; }
command -v psql &>/dev/null || { echo "Postgres non installé"; exit 1; }

# Génère un password fort (32 chars alphanumeric)
gen_pw() { tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32; }

# 3 DBs cibles
declare -A DBS=(
    [clochette_db]="clochette_user"
    [academy_db]="academy_user"
    [management_db]="management_user"
)

declare -A PASSWORDS
for db in "${!DBS[@]}"; do
    PASSWORDS[$db]=$(gen_pw)
done

echo "▶ Création des DBs et users Postgres..."

for db in "${!DBS[@]}"; do
    user="${DBS[$db]}"
    pw="${PASSWORDS[$db]}"

    # Idempotent : skip si déjà existant
    if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1; then
        echo "  ⚠ DB $db existe déjà, skip"
        continue
    fi

    sudo -u postgres psql <<EOSQL
CREATE USER $user WITH ENCRYPTED PASSWORD '$pw';
CREATE DATABASE $db WITH OWNER $user ENCODING 'UTF8' LC_COLLATE='fr_FR.UTF-8' LC_CTYPE='fr_FR.UTF-8' TEMPLATE template0;
GRANT ALL PRIVILEGES ON DATABASE $db TO $user;
\c $db
GRANT ALL ON SCHEMA public TO $user;
EOSQL
    echo "  ✓ DB $db + user $user créés"
done

# Vérifier que locale fr_FR.UTF-8 existe sinon fallback en_US
# (déjà géré par le script provision en amont normalement)

# pg_hba.conf : autoriser md5 local pour les users applicatifs
PG_HBA="/etc/postgresql/$(ls /etc/postgresql/ | head -1)/main/pg_hba.conf"
if ! grep -q "# Clochette apps" "$PG_HBA"; then
    cat >> "$PG_HBA" <<EOF

# Clochette apps — auth md5 local uniquement
local   clochette_db    clochette_user                  md5
local   academy_db      academy_user                    md5
local   management_db   management_user                 md5
host    clochette_db    clochette_user  127.0.0.1/32    md5
host    academy_db      academy_user    127.0.0.1/32    md5
host    management_db   management_user 127.0.0.1/32    md5
EOF
    systemctl reload postgresql
    echo "  ✓ pg_hba.conf mis à jour, Postgres reloaded"
fi

# Affichage des connection strings
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  CONNECTION STRINGS — COPIER MAINTENANT"
echo "  (les passwords ne seront plus jamais affichés)"
echo "════════════════════════════════════════════════════════════"
echo ""
for db in "${!DBS[@]}"; do
    user="${DBS[$db]}"
    pw="${PASSWORDS[$db]}"
    if [[ -n "${pw:-}" ]]; then
        echo "  $db :"
        echo "    DATABASE_URL=\"postgresql://$user:$pw@localhost:5432/$db\""
        echo ""
    fi
done
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Prochaines étapes :"
echo "  1. Coller chaque DATABASE_URL dans le .env.local de l'app correspondante"
echo "  2. Stocker les passwords dans un password manager (1Password, Bitwarden)"
echo "  3. Test connection : psql 'postgresql://clochette_user:<pw>@localhost:5432/clochette_db' -c 'SELECT 1'"
