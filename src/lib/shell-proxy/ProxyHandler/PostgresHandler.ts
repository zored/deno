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
            this.expandAlias(argument, schema).replace(/;\s*$/, "")
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
      "--pset=pager=off",
      "--quiet",
      ...this.getFlags(c),
      ...args,
    ];
  };

  private expandAlias(argument: string, schema?: string): string {
    const [head, ...tail] = argument.split(" ");
    argument = tail.join(" ");

    switch (head) {
      case "t":
      case "table":
      case "tables":
        switch (tail.length) {
          case 0:
            const schemaCond = schema
              ? `= '${schema}'`
              : "!= 'information_schema'";
            return `select * from pg_catalog.pg_tables where schemaname != 'pg_catalog' and schemaname ${schemaCond};`;
          default:
            const tables = tail.map((t) => `'${t}'`).join(",");
            return `select table_schema, table_name, column_name, data_type from information_schema.columns where table_name IN (${tables}) order by table_name, ordinal_position;`;
        }

      case "a":
      case "all":
      case "f":
      case "first":
        switch (tail.length) {
          case 1:
            let limit = "";
            if (head === "f" || head === "first") {
              limit = "limit 1";
            }
            return tail.map((t) => `select * from "${t}" ${limit}`).join(";");
          default:
            throw new Error("Use one table name.");
        }
      case "c":
      case "count":
        switch (tail.length) {
          case 1:
            return tail.map((t) => `select COUNT(1) from "${t}"`).join(";");
          default:
            throw new Error("Use one table name.");
        }

      default:
        return (head + " " + argument).trim();
    }
    return argument;
  }
}
