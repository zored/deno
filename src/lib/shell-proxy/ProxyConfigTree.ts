import { ProxyConfig, ProxyConfigs } from "./ProxyConfigs.ts";

export interface IConfig {
  path: string;
  proxy: ProxyConfig;
  parent?: IConfig;
}

type Id = string;

export class ProxyConfigTree {
  constructor(private configs: ProxyConfigs) {
  }

  getBranch = (id: Id): ProxyConfig[] =>
    this
      .getAncestors(this.nodeById(id))
      .map((c) => c.proxy);

  private throwOnUndefined = <T>(t: T | undefined): T => {
    if (t === undefined) {
      throw new Error(`Value is undefined.`);
    }
    return t;
  };

  getRunsById = (runName: string) => {
    const [a, b] = runName.split(":");
    const [runId, nodeId] = b === undefined ? [a] : [b, a];
    const tree = nodeId
      ? new ProxyConfigTree(
        this.throwOnUndefined<IConfig>(this.nodeById(nodeId)).proxy,
      )
      : this;
    return tree.flatMap((c) =>
      Object
        .entries(c.proxy.run || {})
        .filter(([id]) => id === runId)
    );
  };

  private globalRunId = (n: string, c: IConfig) =>
    `${c.proxy.globalAlias}:${n}`;

  private nodeById = (id: string) =>
    this.find((c) => [c.path, c.proxy.globalAlias].includes(id));

  private map = <T>(f: (c: IConfig) => T): T[] => {
    const result: T[] = [];
    this.each((c) => result.push(f(c)));
    return result;
  };

  private filter = (suits: (c: IConfig) => boolean): IConfig[] => {
    const result: IConfig[] = [];
    this.each((c) => {
      if (suits(c)) {
        result.push(c);
      }
    });
    return result;
  };

  private find = (suits: (c: IConfig) => boolean): IConfig | undefined => {
    let result: IConfig | undefined = undefined;
    this.each((c) => {
      if (suits(c)) {
        result = c;
        return false;
      }
    });
    return result;
  };

  private each = (apply: (c: IConfig) => false | any): void => {
    const handleConfigs = (
      proxy: ProxyConfigs,
      path: string,
      depth: number,
      parent?: IConfig,
    ): boolean => {
      if (Array.isArray(proxy)) {
        proxy.every((c) => handleConfigs(c, path, depth + 1, parent));
        return true;
      }
      const name = proxy.pathAlias || proxy.type;
      const proxyPath = `${path}/${name}`;
      const config: IConfig = {
        path: proxyPath,
        proxy: proxy,
        parent,
      };
      if (apply(config) === false) {
        return false;
      }

      const { children } = proxy;
      if (children) {
        handleConfigs(children, proxyPath, depth + 1, config);
      }
      return true;
    };
    handleConfigs(this.configs, "", 0);
  };

  private getAncestors(c: IConfig | undefined): IConfig[] {
    const ancestors: IConfig[] = [];
    while (c) {
      ancestors.push(c);
      c = c.parent;
    }
    return ancestors.reverse();
  }

  getIds = (): Id[] =>
    this
      .flatMap((c) => [c.path, c.proxy.globalAlias])
      .filter((id): id is Id => id !== undefined);

  private flatMap = <T>(f: (c: IConfig) => T[]): T[] =>
    this.map((c) => f(c)).reduce((a, cs) => a.concat(cs), [] as T[]);
}
