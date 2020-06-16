export type Flags = Record<string, string | number | boolean>;

export interface ProxyConfig {
  globalAlias?: string;
  pathAlias?: string;
  type: string;
  flags?: Flags;
  children?: ProxyConfigs;
}

export type ProxyConfigs = ProxyConfig | ProxyConfig[];
