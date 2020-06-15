#!/usr/bin/env -S deno run --allow-run --allow-env --allow-read --quiet
import { runCommands, sh, ShCommand, shOut } from "../mod.ts";
import { green, red } from "../deps.ts";

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

interface IScreenProxy extends IProxy {
  type: "screen";
  name: string;
}

interface IK8SProxy extends IProxy {
  type: "k8s";
  pod: string;
}

interface IProxy {
  type: string;
  flags?: Record<string, string | number | boolean>;
}

interface IConfig extends Record<string, (IProxy & any)[]> {
}

type Params = Record<string, any>;
type ShCommands = string[];

class ProxyRunner {
  private handlers: ProxyHandler<any>[] = [
    new SSHHandler(),
    new DockerHandler(),
    new MongoHandler(),
    new ScreenHandler(),
    new K8SHandler(),
  ];
  constructor(
    private config: IConfig,
    handlers: ProxyHandler<any>[] = [],
  ) {
    handlers.forEach((h) => this.handlers.push(h));
  }

  static fromFile = async (s: string | undefined) => {
    const text = await Deno.readTextFile(s || "no-file");
    return new ProxyRunner(JSON.parse(text));
  };

  run = async (
    name: string,
    namespace: string,
    separator: string,
    isEval: boolean,
    params: Params,
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
      console.log(
        `${
          red(`No config '${name}' found`)
        } for your namespace '${namespace}'. Use one of: ${
          names.map((n) => `\n- ${green(n)}`).join("")
        }`,
      );
      Deno.exit(1);
    }

    const shCommands: ShCommands = [];
    for (const config of proxyConfigs) {
      const postfix = await this.createCommand(config, params, shCommands);
      postfix.forEach((c) => shCommands.push(c));
    }

    const args = Deno.args;
    const start = args.indexOf(separator);
    if (start > -1) {
      const lastProxy = proxyConfigs.slice(-1)[0];
      const lastProxyArgs = args.slice(start + 1);
      const lastHandler = this.getHandler(lastProxy);
      const extendedLastProxyArgs = isEval
        ? lastHandler.getEval(lastProxyArgs[0], lastProxy)
        : lastHandler.getTty(lastProxy).concat(lastProxyArgs);

      extendedLastProxyArgs
        .map((a) => this.enrichArgument(a, lastProxy))
        .forEach((a) =>
          shCommands.push(proxyConfigs.length > 1 ? `'${a}'` : a)
        );
    }
    await this.exec(shCommands, false);
  };

  private exec = async (command: ShCommands, out: boolean) => {
    console.log(command.join(" "));
    if (out) {
      return await shOut(command);
    }
    await sh(command);
    return "";
  };

  private createCommand = async (
    c: IProxy,
    params: Params,
    previous: ShCommands,
  ) => {
    const handler = this.getHandler(c);
    await handler.updateConfig(
      c,
      params,
      (cs) => this.exec(previous.concat(cs), true),
    );

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
      [] as ShCommands,
    );
    return handler.handle(c).concat(flagsParsed);
  };

  private enrichArgument = (a: string, c: IProxy): string =>
    this.getHandler(c).enrichArgument(a, c);

  private getHandler(c: IProxy): ProxyHandler<any> {
    const handler = this.handlers.find((h) => h.suits(c));
    if (!handler) {
      throw new Error(`No handler found for proxy: ${JSON.stringify(c)}`);
    }
    return handler;
  }
}

abstract class ProxyHandler<T extends IProxy> {
  abstract handle(c: T): ShCommands;

  abstract suits(c: T): boolean;

  getEval = (command: string, lastProxy: T) => [command];

  enrichArgument = (a: string, c: T) => a;

  getTty = (c: T): ShCommands => [];

  updateConfig = async (
    c: T,
    params: Params,
    exec: ExecSubCommand,
  ): Promise<void> => {};
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

interface IK8SParams {
  podNeedle?: string;
}

type ExecSubCommand = (command: ShCommands) => Promise<string>;

class K8SHandler extends ProxyHandler<IK8SProxy> {
  handle = (
    c: IK8SProxy,
  ) => ["kubectl", "exec", "-it", c.pod];
  suits = (c: IK8SProxy) => c.type === "k8s";
  getTty = () => ["sh"];

  updateConfig = async (c: IK8SProxy, params: Params, exec: ExecSubCommand) => {
    if (c.pod) {
      return;
    }
    const p: IK8SParams | undefined = params[c.type];
    if (p) {
      const { podNeedle } = p;
      if (podNeedle) {
        const output = await exec(["kubectl", "get", "pods", "-o", "json"]);
        const pods: any[] = JSON.parse(output).items;
        const getName = (pod: any) => pod.metadata.name;
        const foundPods = pods.filter((p) =>
          getName(p).indexOf(podNeedle) === 0
        );
        switch (foundPods.length) {
          case 0:
            throw new Error(`No pods found by ${podNeedle}.`);
          case 1:
            c.pod = getName(foundPods[0]);
            break;
          case 2:
            throw new Error(
              `Many pods found by ${podNeedle}: ${pods.map(getName).join("")}`,
            );
        }
      }
    }

    if (!c.pod) {
      throw new Error("No pod criteria set up for K8S.");
    }
  };
}

class ScreenHandler extends ProxyHandler<IScreenProxy> {
  handle = (c: IScreenProxy) => ["screen"];
  suits = (c: IScreenProxy) => c.type === "screen";
  getEval = (
    command: string,
    c: IScreenProxy,
  ) => ["screen", "-S", c.name, "-p", "0", "-X", "stuff", `${command}^M`];
  getTty = (c: IScreenProxy) => ["-r", c.name];
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
  getEval = (command: string, p: IMongoProxy) => ["--eval", command];
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
        ["y", "val", "1"].includes(env("eval") || "n"),
        JSON.parse(env("params") || "{}"),
      ),
});
