import { ProxyRunner, RunResult, ShCommands } from "./ProxyRunner.ts";
import { assertEquals } from "../../../deps.ts";
import { MongoConfig } from "./ProxyHandler/MongoHandler.ts";
import { DockerConfig } from "./ProxyHandler/DockerHandler.ts";
import { Flags, ProxyConfig } from "./ProxyConfigs.ts";
import { ProxyHandler } from "./ProxyHandler.ts";
import { SSHConfig } from "./ProxyHandler/SSHHandler.ts";

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
  const runner = new ProxyRunner(
    [
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
    runner.run(
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
    runner.run(
      "custom_cmd",
      ["--some", "value"],
      false,
      false,
      { "value": "custom.sh" },
      true,
    ),
  );

  await assertCommands(
    [
      ssh,
      docker,
      `'psql' 'postgresql://localhost:5432/public' '--quiet' '--command' 'select 'hi' from \"table\" where id = 1;'`,
    ],
    runner.run(
      "pg",
      [`select 'hi' from "table" where id = 1;`],
      true,
      false,
      {},
      true,
    ),
  );
});
