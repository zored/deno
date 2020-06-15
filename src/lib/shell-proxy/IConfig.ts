export interface IProxy {
  type: string;
  flags?: Record<string, string | number | boolean>;
}

export interface IConfig extends Record<string, (IProxy & any)[]> {
}
