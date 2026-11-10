/**
 * The menu and debugger contract (RUN-03, RUN-11): every menu entry
 * of the old extension is still in the same menu, or is listed here with the
 * reason, and the debuggers are the old ones.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import oldManifest from "./oldManifest.json";

interface MenuItem {
    command?: string;
    submenu?: string;
    when?: string;
}

const manifest = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../../package.json"), "utf-8"),
) as {
    contributes: { menus: Record<string, MenuItem[]>; debuggers: unknown[] };
};

/** Old menu entries that are gone, as `<menu> <command>`, with the reason. */
const REMOVED: Record<string, string> = {
    "commandPalette databricks.call": "The command is removed.",
    "view/title databricks.bundle.variable.openFile":
        "Now an inline button of the Variables group row. Each group's actions sit on its own row, and the Project view's title bar keeps only project-wide actions. The inline buttons show on hover or focus.",
    "view/title databricks.bundle.variable.reset":
        "Now an inline button of the Variables group row. Each group's actions sit on its own row, and the Project view's title bar keeps only project-wide actions. The inline buttons show on hover or focus.",
    "commandPalette databricks.wsfs.createFolder":
        "Only hid it in remote mode; the command's enablement does that now.",
    "commandPalette databricks.wsfs.refresh":
        "Only hid it in remote mode; the command's enablement does that now.",
    "view/item/context databricks.connection.configureLogin":
        "The Auth Type row's sign-in buttons; the row is gone, and the Connection view's workspace row signs in when clicked.",
    "view/item/context databricks.configuration.copyAuthType":
        "The command is removed with the Auth Type row.",
    "commandPalette databricks.configuration.copyAuthType":
        "The command is removed with the Auth Type row.",
};

const entries = (menus: Record<string, MenuItem[]>) =>
    Object.entries(menus).flatMap(([menu, items]) =>
        items.map((i) => `${menu} ${i.command ?? i.submenu}`),
    );

describe("menus and debuggers", () => {
    const current = new Set(entries(manifest.contributes.menus));
    const old = entries(oldManifest.menus as Record<string, MenuItem[]>);

    it("keeps each old menu entry in its menu, or lists it as removed", () => {
        expect(old.filter((e) => !current.has(e) && !(e in REMOVED))).toEqual([]);
    });

    it("lists only entries that are gone", () => {
        for (const entry of Object.keys(REMOVED)) {
            expect(old, entry).toContain(entry);
            expect(current.has(entry), entry).toBe(false);
        }
    });

    it("contributes the old debuggers, unchanged", () => {
        expect(manifest.contributes.debuggers).toEqual(oldManifest.debuggers);
    });
});
