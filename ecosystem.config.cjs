/**
 * PM2 process file for always-on production runs.
 * Uses `npm start` (Vite build + `tsx server/index.ts`) so behavior matches README.
 *
 * Usage: `pm2 start ecosystem.config.cjs` from the repo root (PM2 installed globally or via npx).
 * Reboot persistence: `pm2 save` then `pm2 startup` (see PM2 docs for your init system).
 */
module.exports = {
  apps: [
    {
      name: 'house-hunter',
      cwd: __dirname,
      script: 'npm',
      args: 'start',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_restarts: 15,
      min_uptime: '10s',
      exp_backoff_restart_delay: 200,
      max_memory_restart: '512M',
      kill_timeout: 10_000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
