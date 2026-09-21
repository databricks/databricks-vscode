/* eslint-disable @typescript-eslint/naming-convention */
import {expect} from "chai";
import * as tmp from "tmp";
import path from "node:path";
import {readFileSync, writeFileSync} from "node:fs";
import ini from "ini";
import {instance, mock} from "ts-mockito";
import {saveNewProfile} from "./LoginWizard";
import {DatabricksCliAuthProvider} from "./auth/AuthProvider";
import {CliWrapper} from "../cli/CliWrapper";

describe("saveNewProfile", () => {
    const host = new URL("https://test.cloud.databricks.com/");
    const cliPath = "/path/to/bin/databricks";
    const cleanups: Array<() => void> = [];
    let previousConfigFile: string | undefined;

    beforeEach(() => {
        previousConfigFile = process.env.DATABRICKS_CONFIG_FILE;
    });

    afterEach(() => {
        if (previousConfigFile === undefined) {
            delete process.env.DATABRICKS_CONFIG_FILE;
        } else {
            process.env.DATABRICKS_CONFIG_FILE = previousConfigFile;
        }
        while (cleanups.length) {
            cleanups.pop()!();
        }
    });

    function tempConfigFile(contents?: string): string {
        const dir = tmp.dirSync({unsafeCleanup: true});
        cleanups.push(dir.removeCallback);
        const file = path.join(dir.name, ".databrickscfg");
        if (contents !== undefined) {
            writeFileSync(file, contents);
        }
        process.env.DATABRICKS_CONFIG_FILE = file;
        return file;
    }

    function oauthProvider(profile: string) {
        return new DatabricksCliAuthProvider(
            host,
            cliPath,
            instance(mock(CliWrapper)),
            profile
        );
    }

    function countSections(file: string, name: string): number {
        // ini.parse collapses duplicate sections, so count the raw headers.
        const headerRegex = new RegExp(
            `^\\[${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\s*$`,
            "gm"
        );
        return (readFileSync(file, "utf-8").match(headerRegex) ?? []).length;
    }

    it("does not append a duplicate section when the CLI already wrote the profile", async () => {
        // Simulate the section the Databricks CLI's `auth login --profile`
        // persists during the auth check (databricks-vscode#2129).
        const file = tempConfigFile(
            ini.stringify({
                "dev-profile": {
                    host: host.toString(),
                    auth_type: "databricks-cli",
                },
            })
        );

        await saveNewProfile(
            "dev-profile",
            oauthProvider("dev-profile"),
            instance(mock(CliWrapper))
        );

        expect(countSections(file, "dev-profile")).to.equal(1);
    });

    it("appends the profile when no section exists yet", async () => {
        const file = tempConfigFile(
            ini.stringify({
                other: {host: host.toString(), auth_type: "databricks-cli"},
            })
        );

        await saveNewProfile(
            "dev-profile",
            oauthProvider("dev-profile"),
            instance(mock(CliWrapper))
        );

        expect(countSections(file, "dev-profile")).to.equal(1);
        const parsed = ini.parse(readFileSync(file, "utf-8"));
        expect(parsed).to.have.property("dev-profile");
        expect(parsed).to.have.property("other");
    });
});
