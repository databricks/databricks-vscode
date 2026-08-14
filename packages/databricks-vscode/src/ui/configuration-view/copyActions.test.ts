import {expect} from "chai";
import * as fs from "fs";
import * as path from "path";
import {
    COPY_COMMAND_IDS,
    COPY_KINDS,
    copyCommandId,
    stampCopyKind,
} from "./copyActions";
import {ConfigurationTreeItem} from "./types";

function item(props: Partial<ConfigurationTreeItem>): ConfigurationTreeItem {
    return {...props} as ConfigurationTreeItem;
}

describe("stampCopyKind", () => {
    it("stamps every mapped label with its copy=<kind> suffix", () => {
        // Guards the label -> kind coupling: each COPY_KINDS entry must yield
        // exactly the suffix the package.json `when` clause matches.
        for (const [label, kind] of Object.entries(COPY_KINDS)) {
            const element = item({label, description: "some value"});
            stampCopyKind(element);
            expect(element.contextValue, `label "${label}"`).to.equal(
                `databricks.configuration.copy=${kind}`
            );
        }
    });

    it("appends the suffix to a pre-existing contextValue", () => {
        const element = item({
            label: "Cluster",
            description: "my-cluster",
            contextValue: "databricks.configuration.cluster.running.has-url",
        });
        stampCopyKind(element);
        expect(element.contextValue).to.equal(
            "databricks.configuration.cluster.running.has-url.copy=clusterName"
        );
    });

    it("resolves the label from a TreeItemLabel object", () => {
        const element = item({
            label: {label: "Target"} as any,
            description: "dev",
        });
        stampCopyKind(element);
        expect(element.contextValue).to.equal(
            "databricks.configuration.copy=target"
        );
    });

    it("keeps confusable kinds distinct", () => {
        // The menu `when` clauses are end-anchored (/\.copy=state$/ etc.), so
        // the stamped kinds for these look-alike labels must not collide.
        const cases: Array<[string, string]> = [
            ["State", "state"],
            ["Sync State", "syncState"],
            ["Mode", "mode"],
            ["Access Mode", "accessMode"],
            ["Cluster", "clusterName"],
            ["Cluster ID", "clusterId"],
        ];
        for (const [label, kind] of cases) {
            const element = item({label, description: "x"});
            stampCopyKind(element);
            expect(element.contextValue).to.equal(
                `databricks.configuration.copy=${kind}`
            );
        }
    });

    it("does not stamp unmapped labels (headers / buttons / prompts)", () => {
        for (const label of [
            "Python Environment",
            "Install AI tools",
            "Select compute",
            "Serverless",
            "Agents",
            "AI tools",
        ]) {
            const element = item({label, description: "whatever"});
            stampCopyKind(element);
            expect(element.contextValue, `label "${label}"`).to.be.undefined;
        }
    });

    it("does not stamp a mapped label without a textual description", () => {
        const missing = item({label: "Host"});
        stampCopyKind(missing);
        expect(missing.contextValue).to.be.undefined;

        const empty = item({label: "Host", description: ""});
        stampCopyKind(empty);
        expect(empty.contextValue).to.be.undefined;

        const boolean = item({label: "Host", description: true});
        stampCopyKind(boolean);
        expect(boolean.contextValue).to.be.undefined;
    });

    it("is idempotent across repeated calls", () => {
        const element = item({label: "Cluster ID", description: "1234-5678"});
        stampCopyKind(element);
        stampCopyKind(element);
        expect(element.contextValue).to.equal(
            "databricks.configuration.copy=clusterId"
        );
    });
});

interface Contribution {
    command: string;
    title?: string;
    when?: string;
}

/**
 * The copy "kind" set lives in three places that must agree: COPY_KINDS
 * (source of truth), the extension.ts registrations (derived via
 * COPY_COMMAND_IDS), and package.json (commands / menus / palette, declared by
 * hand). These tests fail loudly if any of them drifts out of lock-step.
 */
describe("copy command wiring (COPY_KINDS <-> package.json)", () => {
    // __dirname is out/ui/configuration-view at runtime; package.json is three
    // levels up (the extension package root), the same depth as src/.
    const pkg = JSON.parse(
        fs.readFileSync(
            path.join(__dirname, "..", "..", "..", "package.json"),
            "utf8"
        )
    ) as {
        contributes: {
            commands: Contribution[];
            menus: Record<string, Contribution[]>;
        };
    };
    const PREFIX = "databricks.configuration.copy";
    const expected = new Set(COPY_COMMAND_IDS);
    const isCopy = (c: Contribution) => c.command.startsWith(PREFIX);

    it("derives one command id per distinct kind", () => {
        expect(COPY_COMMAND_IDS).to.have.length(
            new Set(Object.values(COPY_KINDS)).size
        );
    });

    it("declares exactly the derived copy commands in contributes.commands", () => {
        const declared = pkg.contributes.commands
            .filter(isCopy)
            .map((c) => c.command);
        // length check first so a duplicate entry (which the Set would hide)
        // still fails.
        expect(declared).to.have.length(expected.size);
        expect(new Set(declared)).to.deep.equal(expected);
    });

    it("titles every copy command 'Copy …'", () => {
        for (const c of pkg.contributes.commands.filter(isCopy)) {
            expect(c.title, c.command).to.match(/^Copy /);
        }
    });

    it("wires a view/item/context menu for each kind, gated on copy=<kind>", () => {
        const menus = pkg.contributes.menus["view/item/context"].filter(isCopy);
        expect(menus).to.have.length(expected.size);
        expect(new Set(menus.map((m) => m.command))).to.deep.equal(expected);
        for (const kind of new Set(Object.values(COPY_KINDS))) {
            const menu = menus.find((m) => m.command === copyCommandId(kind));
            expect(menu, `menu for kind "${kind}"`).to.not.be.undefined;
            expect(menu!.when).to.equal(
                `view == configurationView && viewItem =~ /\\.copy=${kind}$/`
            );
        }
    });

    it("hides every copy command from the command palette", () => {
        const palette = pkg.contributes.menus.commandPalette.filter(isCopy);
        expect(palette).to.have.length(expected.size);
        expect(new Set(palette.map((m) => m.command))).to.deep.equal(expected);
        for (const m of palette) {
            expect(m.when, `palette entry ${m.command}`).to.equal("false");
        }
    });
});
