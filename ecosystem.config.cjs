/**
 * PM2 process file: runs the API + static server on port 3001 (overrides ambient PORT).
 * Run `npm run build` first so `dist/` exists for the SPA.
 */
module.exports = {
  apps: [
    {
      name: 'house-hunter',
      // Point PM2 at tsx's CLI directly. Using `script: 'npx'` with
      // `interpreter: 'none'` causes `spawn EINVAL` on Windows because PM2 can't
      // spawn an extensionless shim. tsx is a Node CLI (.mjs) so PM2's default
      // node interpreter handles it cleanly.
      script: './node_modules/tsx/dist/cli.mjs',
      args: 'server/index.ts',
      cwd: __dirname,
      env: { PORT: '3001', NODE_ENV: 'production' },
      watch: false,
      autorestart: true,
      restart_delay: 3000,
    },
  ],
}
