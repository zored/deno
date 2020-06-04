// Here is example configuration for pm2 that I use.
// https://pm2.keymetrics.io/docs/usage/application-declaration/
// Run with:
//   pm2 start
// Autoboot with:
//   pm2 startup
module.exports = {
  apps: [{
    name: "Jira Cache update",
    cron_restart: "*/5 * * * *",
    instances: 1,
    script: "src/jira.ts",
    args: "cache",
    interpreter: "deno",
    interpreterArgs: "run --allow-net --allow-read --allow-env --allow-write",
    watch: false,
    autorestart: false,
    time: true,
  }],
};