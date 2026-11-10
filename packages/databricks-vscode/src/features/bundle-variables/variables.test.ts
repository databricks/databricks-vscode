import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseBundleYaml } from "../../kernel/bundle/BundleFiles";
import { localBundleConfig } from "../../kernel/bundle/LocalBundleConfig";
import { validateOutput } from "../../kernel/cli/commands/bundle";
import type { TreeNode } from "../../platform/ui/tree";
import { formatValue, VariableNode } from "./nodes";

const FIXTURES = path.join(
    __dirname,
    "..",
    "..",
    "kernel",
    "cli",
    "commands",
    "fixtures",
    "bundle",
);
const read = (name: string) => fs.readFileSync(path.join(FIXTURES, name), "utf-8");

/** The rows the view shows for a fixture bundle and target. */
async function rows(bundle: string, target: string) {
    const config = validateOutput.parse(JSON.parse(read(`${bundle}.${target}.validate.json`)));
    const definitions = localBundleConfig([
        parseBundleYaml(read(`${bundle}.databricks.yml`)),
    ]).variables;
    const nodes = Object.entries(config.variables ?? {}).map(
        ([name, v]) => new VariableNode(name, v, definitions[name]),
    );
    const render = async (n: TreeNode) => {
        const item = await n.getTreeItem();
        const children = (await n.getChildren?.()) ?? [];
        return {
            label: item.label,
            description: item.description,
            children: await Promise.all(
                children.map(async (c) => {
                    const ci = await c.getTreeItem();
                    return `${typeof ci.label === "string" ? ci.label : ci.label?.label}: ${String(ci.description)}`;
                }),
            ),
        };
    };
    return Promise.all(nodes.map(render));
}

describe("the bundle variables group", () => {
    it("shows each variable's value for the target, with the default below it", async () => {
        expect(await rows("variables", "dev_test")).toEqual([
            { label: "catalog", description: "dev_catalog", children: ["Default: main"] },
            { label: "warehouse", description: "small", children: ["Default: small"] },
        ]);
    });

    it("shows a complex value as compact JSON", async () => {
        expect(await rows("complex-variable", "dev_test")).toEqual([
            {
                label: "cluster",
                description: '{"num_workers":1,"spark_version":"13.3.x-scala2.12"}',
                children: ['Default: {"spark_version":"13.3.x-scala2.12","num_workers":1}'],
            },
        ]);
    });

    it("shows the value of the selected target", async () => {
        expect((await rows("two-targets", "dev_test"))[0]?.description).toBe("hello");
        expect(await rows("two-targets", "dev_test2")).toEqual([
            { label: "greeting", description: "bonjour", children: ["Default: hello"] },
        ]);
    });

    it("shows a lookup by what it looks up", async () => {
        const node = new VariableNode("cluster_id", {
            lookup: { cluster: "shared" },
            value: "0123-abc",
        });
        expect(node.getTreeItem()).toMatchObject({ label: "cluster_id", description: "shared" });
        expect(node.getChildren().map((c) => c.getTreeItem())).toMatchObject([
            { label: "cluster", description: "0123-abc" },
        ]);
    });

    it("formats values", () => {
        expect(formatValue(undefined)).toBe("");
        expect(formatValue(3)).toBe("3");
        expect(formatValue({ a: 1 })).toBe('{"a":1}');
    });
});
