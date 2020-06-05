// https://pm2.keymetrics.io/docs/usage/application-declaration/
module.exports = {
  apps: [{
    name: 'Jira Cache update',
    interpreter: 'deno',
    interpreterArgs: 'run --allow-net --allow-read --allow-env --allow-write',
    script: 'src/jira.ts',
    args: 'cache --daemon-interval 5m',
    restart_delay: 10000,
    time: true,
  }],
};