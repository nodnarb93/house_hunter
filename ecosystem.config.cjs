/**
 * PM2 process file: runs the API + static server on port 3001 (overrides ambient PORT).
 * Run `npm run build` first so `dist/` exists for the SPA.
 */
module.exports = {
  apps: [
    {
      name: 'house-hunter',
      script: 'npx',
      args: 'tsx server/index.ts',
      cwd: __dirname,
      interpreter: 'none',
      env: { PORT: '3001', NODE_ENV: 'production' },
      watch: false,
      autorestart: true,
      restart_delay: 3000,
    },
  ],
}
