/**
 * PM2 ecosystem — Clochette Nails
 * À placer à la racine du repo (clochette-nails/ecosystem.config.js)
 *
 * Démarrage :
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup  # une fois — suivre les instructions affichées
 *
 * Reload après deploy :
 *   pm2 reload ecosystem.config.js --update-env
 */

module.exports = {
  apps: [
    {
      name: 'clochette-nails',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      cwd: '/var/www/clochette-nails',
      instances: 1,                // Mono-process (mono-tenant, low traffic)
      exec_mode: 'fork',           // 'cluster' pour multi-instances si CPU bottleneck
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',    // Restart si Next.js dépasse 1 GB (memory leak protection)

      // Env (le reste vient de .env.local lu par Next.js)
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        // Override possible des autres vars via .env.local
      },

      // Logs
      out_file: '/var/log/clochette/clochette-nails-out.log',
      error_file: '/var/log/clochette/clochette-nails-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Restart policy
      min_uptime: '30s',           // Process considéré "stable" après 30s
      max_restarts: 10,            // Max 10 restarts en 1 min avant arrêt
      restart_delay: 5000,         // 5s entre restarts

      // Kill signal handling (graceful shutdown)
      kill_timeout: 5000,          // 5s pour finir les requêtes en cours
      wait_ready: true,            // Attend process.send('ready') avant marquer "online"
      listen_timeout: 30000,       // 30s pour démarrer
    },
  ],
};
