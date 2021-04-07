// https://pm2.keymetrics.io/docs/usage/application-declaration/
module.exports = {
  apps: [{
    name: 'Jira Cache update',
    interpreter: 'deno',
    interpreterArgs: 'run -A',
    script: 'src/jira.ts',
    args: 'cache --daemon-interval 5m',
    restart_delay: 10000,
    time: true,
  }, {
    name: 'Jira Cookie Listener',
    interpreter: 'deno',
    interpreterArgs: 'run -A',
    script: 'src/jira.ts',
    args: 'listenCookies 11536',
    restart_delay: 10000,
    time: true,
  }],
};
