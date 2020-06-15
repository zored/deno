#!/usr/bin/env -S deno run --allow-run --allow-env --allow-read --quiet
import { runCommands, sh } from "../mod.ts";

interface ISSHProxy extends IProxy {
  type: "ssh";
  alias: string;
}

interface IDockerProxy extends IProxy {
  type: "docker";
  image: string;
}

interface IMongoProxy extends IProxy {
  type: "mongo";
  uri: string;
  slave?: boolean;
}

interface IProxy {
  type: string;
  flags?: Record<string, string | number | boolean>;
}

interface IConfig extends Record<string, (IProxy & any)[]> {
}

class ProxyRunner {
  constructor(
    private config: IConfig,
    private handlers: ProxyHandler<any>[] = [
      new SSHHandler(),
      new DockerHandler(),
      new MongoHandler(),
    ],
  ) {
  }

  run = async (
    name: string,
    namespace: string,
    separator: string,
    onlyEval: boolean,
  ) => {
    namespace = namespace.replace(/^\//, "");
    namespace = namespace.replace(/\/$/, "") + "/";

    const names = Object.keys(this.config);
    const fullsByAlias: Record<string, Set<string>> = {};
    Array
      .from(namespace.matchAll(/\//g))
      .map(({ index }) => namespace.substring(0, index))
      .forEach((namespace) =>
        names
          .filter((n) => n.indexOf(namespace) === 0)
          .map((n) => [n, n.substring(namespace.length + 1)])
          .forEach(([full, alias]) => {
            if (alias.indexOf("/") > -1) {
              return;
            }
            (fullsByAlias[alias] = fullsByAlias[alias] ?? new Set()).add(full);

            names.push(alias);
          })
      );

    const fulls = fullsByAlias[name] ?? new Set<string>();
    switch (fulls.size) {
      case 0:
        break;
      case 1:
        name = Array.from(fulls)[0];
        break;
      default:
        throw new Error(`Ambiguous ${name} for ${namespace}: ${fulls}`);
    }
    const proxyConfigs = this.config[name];
    if (!proxyConfigs) {
      throw new Error(
        `No config '${name}' found for your namespace '${namespace}'. Use one of: ${
          names.map((n) => `\n${n}`).join("")
        }`,
      );
    }

    const command = proxyConfigs.flatMap((c) => this.createCommand(c));

    const args = Deno.args;
    const start = args.indexOf(separator);
    if (start > -1) {
      const lastProxy = proxyConfigs.slice(-1)[0];
      const lastProxyArgs = args.slice(start + 1);
      const extendedLastProxyArgs = onlyEval
        ? this.getHandler(lastProxy).getEval(lastProxyArgs[0])
        : lastProxyArgs;
      extendedLastProxyArgs
        .map((a) => this.enrichArgument(a, lastProxy))
        .forEach((a) => command.push(proxyConfigs.length > 1 ? `'${a}'` : a));
    }
    await sh(command);
  };

  private createCommand(c: IProxy) {
    const handler = this.getHandler(c);

    const { flags } = c;
    const flagsParsed = Object.entries(flags || {}).reduce(
      (f, [name, value]) => {
        const flagName = `--${name}`;
        if (value === true) {
          f.push(flagName);
          return f;
        }
        if (value === false || value === undefined || value === null) {
          return f;
        }
        f.push(flagName);
        f.push(value.toString());
        return f;
      },
      [] as string[],
    );
    return handler.handle(c).concat(flagsParsed);
  }

  private enrichArgument = (a: string, c: IProxy): string =>
    this.getHandler(c).enrichArgument(a, c);

  private getHandler(c: IProxy): ProxyHandler<any> {
    const handler = this.handlers.find((h) => h.suits(c));
    if (!handler) {
      throw new Error(`No handler found for proxy: ${JSON.stringify(c)}`);
    }
    return handler;
  }

  static fromFile = async (s: string | undefined) => {
    const text = await Deno.readTextFile(s || "no-file");
    return new ProxyRunner(JSON.parse(text));
  };
}

abstract class ProxyHandler<T extends IProxy> {
  abstract handle(c: T): string[];

  abstract suits(c: T): boolean;

  getEval = (command: string) => [command];

  enrichArgument = (a: string, c: T) => a;
}

class SSHHandler extends ProxyHandler<ISSHProxy> {
  handle = (c: ISSHProxy) => ["ssh", "-t", c.alias];
  suits = (c: ISSHProxy) => c.type === "ssh";
}

class DockerHandler extends ProxyHandler<IDockerProxy> {
  handle = (
    c: IDockerProxy,
  ) => ["sudo", "docker", "run", "-it", "--net=host", "--rm", c.image];
  suits = (c: IDockerProxy) => c.type === "docker";
}

class MongoHandler extends ProxyHandler<IMongoProxy> {
  private lastArgument: string = "";
  handle = (c: IMongoProxy) => ["mongo", c.uri, "--quiet"];
  suits = (c: IMongoProxy) => c.type === "mongo";
  enrichArgument = (a: string, c: IMongoProxy) => {
    if (c.slave !== true) {
      return a;
    }
    if (this.lastArgument === "--eval") {
      a = `rs.slaveOk(); ${a}`;
    }
    this.lastArgument = a;
    return a;
  };
  getEval = (c: string) => ["--eval", c];
}

const shellProxy = "i";

const env = (name: string) => Deno.env.get(name);
await runCommands({
  [shellProxy]: async () =>
    (await ProxyRunner.fromFile(env("file")))
      .run(
        env("name") || "",
        env("namespace") || "",
        shellProxy,
        env("eval") === "y",
      ),
});
