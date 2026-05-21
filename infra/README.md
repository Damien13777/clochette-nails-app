# Clochette Nails — Infrastructure VPS Hostinger

Kit de provisioning et déploiement pour un VPS Hostinger KVM2 (2 vCPU / 8 GB RAM / 100 GB NVMe / 8 TB BW) hébergeant 3 apps Node.js + Postgres 16 + Nginx + Cloudflare.

---

## Stack cible

| Service | Version | Rôle |
|---|---|---|
| Ubuntu | 24.04 LTS | OS |
| Node.js | 22 LTS | Runtime apps |
| pnpm | 9+ | Package manager (via corepack) |
| PostgreSQL | 16 | DB (3 schémas isolés via 3 DBs séparées) |
| Nginx | 1.24+ | Reverse proxy + static + SSL termination |
| PM2 | 5+ | Process manager Node |
| Certbot | latest | Let's Encrypt SSL |
| UFW | system | Firewall |
| fail2ban | system | SSH brute-force protection |
| Cloudflare | proxy DNS | CDN + WAF + DDoS (gratuit) |

## Apps hébergées

| App | DB | Port (interne) | Sous-domaine |
|---|---|---|---|
| Clochette Nails | `clochette_db` | 3001 | `clochette-nails.fr` |
| Nails Academy | `academy_db` | 3002 | À définir (ex: `academy.tld`) |
| Management | `management_db` | 3003 | À définir (ex: `manage.tld`) |

Nginx fait le routing par hostname et reverse-proxy vers le port local de chaque app.

---

## Prérequis avant de lancer

### Côté Hostinger
1. VPS commandé et accessible (IP publique fournie)
2. Accès SSH root activé (mot de passe ou clé temporaire fournie par Hostinger)
3. Système : **Ubuntu 24.04 LTS** sélectionné à la création

### Côté local (ton Mac)
1. **Clé SSH publique** : si tu n'en as pas
   ```bash
   ssh-keygen -t ed25519 -C "damien@clochette-nails" -f ~/.ssh/clochette_vps
   ```
2. Le contenu de `~/.ssh/clochette_vps.pub` à coller dans le script de provisioning (variable `ADMIN_SSH_KEY`)

### Côté Cloudflare
1. Compte gratuit Cloudflare
2. Domaine `clochette-nails.fr` transféré aux nameservers Cloudflare
3. Enregistrements DNS à créer **après** provisioning (cf. § DNS plus bas)

---

## Étapes de provisioning (ordre)

### 1. Connexion initiale au VPS (en root, depuis ton Mac)
```bash
ssh root@<IP_VPS>
```

### 2. Upload du script de provisioning
Depuis ton Mac :
```bash
scp provision.sh root@<IP_VPS>:/root/
scp postgres-setup.sh root@<IP_VPS>:/root/
```

### 3. Éditer les variables du script
Sur le VPS :
```bash
nano /root/provision.sh
# Remplir : ADMIN_USER, ADMIN_SSH_KEY, EMAIL_ADMIN, TIMEZONE
```

### 4. Lancer le provisioning
```bash
bash /root/provision.sh 2>&1 | tee /var/log/provision.log
```

Le script prend ~10-15 min. Il :
- Met à jour le système
- Crée l'utilisateur admin (`clochette`) avec sudo + clé SSH
- Durcit SSH (port 22, pas de password, pas de root)
- Configure UFW (22, 80, 443)
- Installe fail2ban
- Installe Node 22 + pnpm
- Installe Postgres 16 (configuré pour 8 GB RAM)
- Installe Nginx
- Installe Certbot
- Installe PM2 + autostart
- Installe Sharp deps (libvips)
- Crée la structure `/var/www`, `/var/backups`, `/var/log/clochette`
- Active unattended-upgrades pour les patchs de sécu
- Configure le timezone Europe/Paris

### 5. Reconnexion en tant qu'admin
À partir de maintenant, **ne plus utiliser root** :
```bash
ssh -i ~/.ssh/clochette_vps clochette@<IP_VPS>
```

### 6. Setup Postgres (création des DBs)
```bash
sudo bash /root/postgres-setup.sh
# Génère 3 DBs + 3 users avec passwords aléatoires
# Affiche les connection strings à copier dans les .env de chaque app
```

### 7. Configuration DNS Cloudflare
Dans le dashboard Cloudflare, ajouter ces enregistrements **avec proxy activé (orange cloud)** :

| Type | Nom | Cible | Proxy |
|---|---|---|---|
| A | `@` | `<IP_VPS>` | ✓ Proxied |
| A | `www` | `<IP_VPS>` | ✓ Proxied |
| A | `academy` (futur) | `<IP_VPS>` | ✓ Proxied |
| A | `manage` (futur) | `<IP_VPS>` | ✓ Proxied |

Settings Cloudflare à activer :
- SSL/TLS encryption mode : **Full (strict)** (une fois Certbot configuré)
- Always Use HTTPS : ON
- Auto Minify JS/CSS/HTML : ON
- Brotli : ON
- HSTS : ON (après 1 mois de prod stable)

### 8. Premier site Nginx + SSL
```bash
# Sur le VPS, copier le template
sudo cp /root/nginx-clochette-nails.conf /etc/nginx/sites-available/clochette-nails.fr
sudo ln -s /etc/nginx/sites-available/clochette-nails.fr /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# SSL via Certbot (DNS Cloudflare doit déjà pointer)
sudo certbot --nginx -d clochette-nails.fr -d www.clochette-nails.fr --email contact@clochette-nails.fr --agree-tos --redirect
```

### 9. Premier déploiement de l'app
```bash
# Sur le VPS, en tant que clochette
cd /var/www
git clone https://github.com/Damien13777/clochette-nails.git
cd clochette-nails
cp .env.example .env.local
nano .env.local  # remplir DATABASE_URL, AUTH_SECRET, STRIPE_*, RESEND_API_KEY, etc.

pnpm install --frozen-lockfile
pnpm prisma generate
pnpm prisma db push  # ou migrate deploy si on a des migrations
pnpm build

# Démarrage PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # une fois — suivre les instructions affichées
```

### 10. Backups cron
```bash
sudo cp /root/backup.sh /usr/local/bin/clochette-backup
sudo chmod +x /usr/local/bin/clochette-backup
sudo crontab -e
# Ajouter :
# 0 3 * * * /usr/local/bin/clochette-backup
```

---

## Maintenance courante

### Déployer une nouvelle version de l'app
```bash
ssh clochette@<IP_VPS>
cd /var/www/clochette-nails
bash deploy.sh
```

### Voir les logs en temps réel
```bash
pm2 logs clochette-nails
sudo tail -f /var/log/nginx/clochette-nails-access.log
sudo journalctl -u postgresql -f
```

### Status du système
```bash
pm2 status
sudo systemctl status nginx postgresql fail2ban
df -h        # espace disque
free -h      # RAM
htop         # CPU / processus
```

### Vérifier les backups
```bash
ls -lh /var/backups/postgres/
ls -lh /var/backups/uploads/
```

### Restaurer un backup Postgres
```bash
gunzip < /var/backups/postgres/clochette_db-2026-05-15.sql.gz | sudo -u postgres psql clochette_db
```

---

## Sécurité — récap des couches

| Couche | Implémentation |
|---|---|
| SSH | Port 22, key-only, no root, fail2ban (5 tentatives/10min) |
| Firewall | UFW : 22 (SSH), 80 (Cert renewals + redirect), 443 (HTTPS) |
| Updates auto | unattended-upgrades pour security patches |
| HTTPS | Let's Encrypt via Certbot, renouvellement auto |
| WAF + DDoS | Cloudflare proxy (gratuit) |
| Postgres | listen_addresses=localhost uniquement, users séparés par DB |
| Headers | Strict-Transport-Security, X-Content-Type-Options, X-Frame-Options, CSP, Referrer-Policy |
| App rate-limit | in-memory (cf. décisions Phase 0) |
| Audit | Tous les events Stripe/admin → OutboundEvent + audit DB |

---

## Coûts mensuels estimés

| Service | Coût | Note |
|---|---|---|
| VPS Hostinger KVM2 | ~10-12 €/mois | Selon promo |
| Domain `.fr` | ~1 €/mois | Renouvellement annuel |
| Cloudflare proxy | **0 €** | Gratuit |
| Let's Encrypt SSL | **0 €** | Gratuit |
| Resend email | **0 €** | Free tier 3000 emails/mois |
| Stripe | Variable | 1.4% + 0.25€ par transaction EUR |
| Backups locaux | **0 €** | Sur le disque VPS |
| **Total fixe** | **~11-13 €/mois** | Hors transactions Stripe |

→ Si tu veux des backups offsite (recommandé pour disaster recovery) :
- **Backblaze B2** : ~0.50 €/mois pour 100 GB
- **Cloudflare R2** : 10 GB gratuit, sinon $0.015/GB/mois

---

## Fichiers du kit

| Fichier | Rôle |
|---|---|
| `provision.sh` | Script principal de provisioning (à lancer en root au 1er boot) |
| `postgres-setup.sh` | Crée les 3 DBs Postgres avec users dédiés |
| `nginx-clochette-nails.conf` | Template Nginx site (à copier dans `/etc/nginx/sites-available/`) |
| `pm2-ecosystem.template.js` | Template PM2 (à mettre à la racine du repo Clochette) |
| `deploy.sh` | Script de déploiement (à mettre à la racine du repo Clochette) |
| `backup.sh` | Script de backup (postgres dump + uploads rsync) |

---

## Troubleshooting rapide

| Problème | Solution |
|---|---|
| App ne démarre pas | `pm2 logs clochette-nails` + check `.env.local` |
| 502 Bad Gateway | App down ou wrong port. `pm2 restart all` |
| SSL ne renouvelle pas | `sudo certbot renew --dry-run` |
| Postgres connection refused | `sudo systemctl status postgresql` + check `pg_hba.conf` |
| Espace disque plein | `du -sh /var/* \| sort -h` + cleanup backups anciens |
| Build Next.js OOM | Augmenter swap : `sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` |

---

**Statut** : v1, prêt à dérouler quand le VPS est commandé.
