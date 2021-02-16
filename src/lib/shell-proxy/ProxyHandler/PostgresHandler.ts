import { ProxyHandler } from "../ProxyHandler.ts";
import type { ProxyConfig } from "../ProxyConfigs.ts";
import type { ShCommands } from "../ProxyRunner.ts";
import { Params } from "../ProxyRunner.ts";

export interface PostgresConfig extends ProxyConfig {
  type: "postgres";
  uri: string;
  slave?: boolean;
}

export type PostgresParams = {
  schema?: string;
} | undefined;

const commandArgument = "--command";
const jsonSpecificName = "_zored_deno_jsonEverything";

export class PostgresHandler extends ProxyHandler<PostgresConfig> {
  private lastArgument = "";
  private json = false;

  suits = (c: PostgresConfig) => c.type === "postgres";

  getChainBase = () => [];
  getBase = () => [];
  getTty = (c: PostgresConfig) => this.psql(c);
  getEval = async (cs: ShCommands, c: PostgresConfig) =>
    this.psql(c, [commandArgument, cs.join(" ")]);

  enrichArgument = (
    argument: string,
    c: PostgresConfig,
    params: Params,
  ): string[] => {
    let json = false;
    if (this.lastArgument === commandArgument) {
      const p = params as PostgresParams;

      if (!p) {
        return [argument];
      }

      const schema = p.schema;
      const [head, ...tail] = argument.split(" ");
      argument = tail.join(" ");
      switch (head) {
        case "j":
          json = true;
          argument = `select json_agg(${jsonSpecificName}) from (${
            this.expandAlias(argument, schema)
          }) ${jsonSpecificName};`;
          break;
        default:
          argument = (head + " " + argument).trim();
          break;
      }

      argument = this.expandAlias(argument, schema);

      if (schema) {
        argument = `set search_path to "${schema}"; ${argument}`;
      }
    }
    this.lastArgument = argument;

    if (json) {
      return [
        argument,
        "--no-align",
        "--tuples-only",
      ];
    }
    return [argument];
  };

  private psql = (
    c: PostgresConfig,
    args: ShCommands = [],
  ) => {
    return [
      "psql",
      c.uri,
      "--no-psqlrc",
      "--quiet",
      ...this.getFlags(c),
      ...args,
    ];
  };

  private expandAlias(argument: string, schema?: string): string {
    switch (argument) {
      case "t":
      case "tables":
        const schemaCond = schema ? `= '${schema}'` : "!= 'information_schema'";
        return `select * from pg_catalog.pg_tables where schemaname != 'pg_catalog' and schemaname ${schemaCond}`;
    }
    return argument;
  }
}
