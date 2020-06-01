// Here is example configuration for pm2 that I use.
// https://pm2.keymetrics.io/
// Run with:
//   pm2 starts
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
  }],
};