import { ProxyRunner, RunResult, ShCommands } from "./ProxyRunner.ts";
import { assertEquals } from "../../../deps.ts";
import { stub } from "../../../deps.dev.ts";
import { MongoConfig } from "./ProxyHandler/MongoHandler.ts";
import { DockerConfig } from "./ProxyHandler/DockerHandler.ts";
import { Flags, ProxyConfig } from "./ProxyConfigs.ts";
import { ProxyHandler } from "./ProxyHandler.ts";
import { SSHConfig } from "./ProxyHandler/SSHHandler.ts";
import { Runner } from "../command.ts";
import { K8SParams, Pod } from "./ProxyHandler/K8SHandler.ts";
import { PostgresParams } from "./ProxyHandler/PostgresHandler.ts";

const { test } = Deno;

interface CustomConfig extends ProxyConfig {
  type: "custom";
  command: string;
}

class CustomHandler extends ProxyHandler<CustomConfig> {
  getBase = (c: CustomConfig) => [c.command];
  suits = (c: CustomConfig) => c.type === "custom";
}

test("test eval", async () => {
  const shRunner = new Runner();
  const runner = () =>
    new ProxyRunner(
      [
        {
          type: "k8s",
        },
        {
          type: "ssh",
          pathAlias: "dev",
          sshAlias: "kek",
          children: [
            {
              type: "docker",
              image: "some:1.2.3",
              flags: { "custom": "flag" } as Flags,
              children: [
                {
                  globalAlias: "pg",
                  type: "postgres",
                  uri: "postgresql://localhost:5432/public",
                },
                {
                  type: "mongo",
                  slave: true,
                  uri: "mongo://example",
                } as MongoConfig,
                {
                  globalAlias: "custom_cmd",
                  type: "custom",
                  command: "hi",
                } as CustomConfig,
              ],
            } as DockerConfig,
          ],
        } as SSHConfig,
      ],
      false,
      false,
      [new CustomHandler()],
      shRunner,
    );

  const assertCommands = async (
    expected: ShCommands,
    cs: Promise<RunResult>,
  ) =>
    assertEquals(
      ((await cs) as string[]).join(" "),
      expected.join(" "),
    );

  const docker = "sudo docker run -it --net=host --rm some:1.2.3 --custom flag";
  const ssh = "ssh -t kek";

  await assertCommands(
    [
      ssh,
      docker,
      "'mongo' 'mongo://example' '--quiet' '--eval' 'rs.slaveOk(); db.people .find()'",
    ],
    runner().run(
      "/dev/docker/mongo",
      ["db.people", ".find()"],
      true,
      false,
      {},
      true,
    ),
  );

  await assertCommands(
    [
      ssh,
      docker,
      "hi '--some' 'value'",
    ],
    runner().run(
      "custom_cmd",
      ["--some", "value"],
      false,
      false,
      { "value": "custom.sh" },
      true,
    ),
  );

  const pgParams: PostgresParams = {
    schema: "public",
  };
  await assertCommands(
    [
      ssh,
      docker,
      `'psql' 'postgresql://localhost:5432/public' '--no-psqlrc' '--pset=pager=off' '--quiet' '--command' 'set search_path to \"public\"; select 'hi' from \"table\" where id = 1;'`,
    ],
    runner().run(
      "pg",
      [`select 'hi' from "table" where id = 1;`],
      true,
      false,
      pgParams,
      true,
    ),
  );
  await assertCommands(
    [
      ssh,
      docker,
      `'psql' 'postgresql://localhost:5432/public' '--no-psqlrc' '--pset=pager=off' '--quiet' '--command' 'set search_path to \"public\"; select json_agg(_zored_deno_jsonEverything) from (select * from pg_catalog.pg_tables where schemaname != 'pg_catalog' and schemaname = 'public') _zored_deno_jsonEverything;' '--no-align' '--tuples-only'`,
    ],
    runner().run(
      "pg",
      [`j t`],
      true,
      false,
      pgParams,
      true,
    ),
  );
  await assertCommands(
    [
      ssh,
      docker,
      `'psql' 'postgresql://localhost:5432/public' '--no-psqlrc' '--pset=pager=off' '--quiet' '--command' 'set search_path to \"public\"; select json_agg(_zored_deno_jsonEverything) from (select table_schema, table_name, column_name, data_type from information_schema.columns where table_name IN ('one','two') order by table_name, ordinal_position) _zored_deno_jsonEverything;' '--no-align' '--tuples-only'`,
    ],
    runner().run(
      "pg",
      [`j t one two`],
      true,
      false,
      pgParams,
      true,
    ),
  );
  await assertCommands(
    [
      ssh,
      docker,
      `'psql' 'postgresql://localhost:5432/public' '--no-psqlrc' '--pset=pager=off' '--quiet' '--command' 'set search_path to \"public\"; select * from \"three\" limit 1'`,
    ],
    runner().run(
      "pg",
      [`f three`],
      true,
      false,
      pgParams,
      true,
    ),
  );
  await assertCommands(
    [
      ssh,
      docker,
      `'psql' 'postgresql://localhost:5432/public' '--no-psqlrc' '--pset=pager=off' '--quiet' '--command' 'set search_path to \"public\"; select COUNT(1) from \"four\"'`,
    ],
    runner().run(
      "pg",
      [`c four`],
      true,
      false,
      pgParams,
      true,
    ),
  );

  const shRunnerOutputs: any[] = [];

  stub(shRunner, "output", async () => shRunnerOutputs.pop());

  shRunnerOutputs.push([JSON.stringify({
    items: [{
      metadata: {
        name: "postgres-1",
      },
      status: {
        phase: "Running",
      },
      spec: {
        containers: [],
      },
    } as Pod],
  })]);
  const k8sFinds: K8SParams = {
    finds: ["post", "gres"],
  };
  await assertCommands(
    [`kubectl exec -it postgres-1 -- pwd`],
    runner().run(
      "/k8s",
      ["e", "pwd"],
      true,
      false,
      k8sFinds,
      true,
    ),
  );

  const pod: Pod = {
    metadata: {
      name: "web-1",
    },
    status: {
      phase: "Running",
    },
    spec: {
      containers: [{
        ports: [{ containerPort: 80, name: "web" }],
      }],
    },
  };
  shRunnerOutputs.push([JSON.stringify({ items: [pod] })]);
  shRunnerOutputs.push([JSON.stringify(pod)]);
  shRunnerOutputs.push([JSON.stringify({ items: [pod] })]);

  const k8sPfaFinds: K8SParams = {
    finds: ["web"],
    ports: { 80: 123 },
  };
  await assertCommands(
    [`kubectl port-forward web-1 123:80 `],
    runner().run(
      "/k8s",
      ["pfa"],
      true,
      false,
      k8sPfaFinds,
      true,
    ),
  );
});
