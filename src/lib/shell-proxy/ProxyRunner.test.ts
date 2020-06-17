import { ProxyRunner, ShCommands } from "./ProxyRunner.ts";
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
    [new CustomHandler()],
  );

  const assertCommands = async (
    expected: ShCommands,
    cs: Promise<ShCommands>,
  ) =>
    assertEquals(
      (await cs).join(" "),
      expected.join(" "),
    );

  await assertCommands(
    [
      "ssh -t kek",
      "sudo docker run -it --net=host --rm some:1.2.3 --custom flag",
      "'mongo' 'mongo://example' '--quiet' '--eval' 'rs.slaveOk(); db.people .find()'",
    ],
    runner.run(
      "/dev/docker/mongo",
      ["db.people", ".find()"],
      true,
      {},
      true,
    ),
  );

  await assertCommands(
    [
      "ssh -t kek",
      "sudo docker run -it --net=host --rm some:1.2.3 --custom flag",
      "hi '--some' 'value'",
    ],
    runner.run(
      "custom_cmd",
      ["--some", "value"],
      false,
      { "value": "custom.sh" },
      true,
    ),
  );
});
