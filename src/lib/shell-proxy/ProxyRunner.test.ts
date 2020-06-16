import {
  ExecSubCommand,
  Params,
  ProxyRunner,
  ShCommands,
} from "./ProxyRunner.ts";
import { assertEquals } from "../../../deps.ts";

const { test } = Deno;

test("test eval", async () => {
  const runner = new ProxyRunner(
    [
      {
        name: "dev",
        type: "ssh",
        alias: "kek",
        children: [
          {
            type: "docker",
            image: "some:1.2.3",
            flags: {
              "custom": "flag",
            },
            children: [
              {
                aliases: ["dev_db"],
                type: "mongo",
                slave: true,
                uri: "mongo://example",
              },
              {
                aliases: ["custom_cmd"],
                type: "custom",
              },
            ],
          },
        ],
      },
    ],
    false,
    [{
      suits: (c: any) => c.type === "custom",
      handleParams: async (c: any, params: Params, exec: ExecSubCommand) =>
        c.data = params["value"],
      handle: (c: any) => [c.data],
    }],
  );

  const assertCommands = async (
    expected: ShCommands,
    cs: Promise<ShCommands>,
  ) =>
    assertEquals(
      expected.join(" "),
      (await cs).join(" "),
    );

  await assertCommands(
    [
      "ssh -t kek",
      "sudo docker run -it --net=host --rm some:1.2.3 --custom flag",
      "mongo mongo://example --quiet '--eval' 'rs.slaveOk(); db.people .find()'",
    ],
    runner.run(
      "dev/docker/mongo",
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
      "mongo mongo://example --quiet '--eval' 'rs.slaveOk(); db.people .find()'",
    ],
    runner.run(
      "custom_cmd",
      ["db.people", ".find()"],
      true,
      { "value": "custom.sh" },
      true,
    ),
  );
});
