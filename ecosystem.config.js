// https://pm2.keymetrics.io/docs/usage/application-declaration/

const c = getConfig(process.argv);
const cfg = `--zored-deno=${c.config} --zored-deno-merge=${c.jira}`;
const run = `run -A ${c.cert ? `--cert=${c.cert}` : ''}`
console.log({ cfg });

module.exports = {
  apps: [{
    name: "Jira Cache update",
    interpreter: "deno",
    interpreterArgs: run,
    script: "src/jira.ts",
    args: `cache ${cfg} --daemon-interval 5m`,
    restart_delay: 10000,
    time: true,
  }, {
    name: "Jira Cookie Listener",
    interpreter: "deno",
    interpreterArgs: run,
    script: "src/jira.ts",
    args: `listenCookies ${cfg} 11536 ${c.jira}`,
    restart_delay: 10000,
    time: true,
  }, {
    name: "Flow status server",
    interpreter: "deno",
    interpreterArgs: `${run} --unstable`,
    script: "src/flow.ts",
    args: `statusServe ${cfg}`,
    restart_delay: 10000,
    time: true,
  }],
};

function getConfig(argv) {
  const c = argv.reduce((o, a) =>
    Object.entries(o).reduce((o, [k, v]) => {
      const prefix = `--${k}=`;
      if (!a.startsWith(prefix)) {
        return o;
      }
      o[k] = a.substring(prefix.length);
      return o;
    }, o), { config: "", jira: "", cert: "" });
  if (!c.config || !c.jira) {
    console.error(`Specify parameters: ${JSON.stringify(c)}`);
    process.exit(1);
  }
  return c;
}
