import {expect} from "chai";
import * as tmp from "tmp";
import path from "node:path";
import {readFileSync, writeFileSync} from "node:fs";
import {Uri} from "vscode";
import {
    isOverrideableConfigKey,
    OverrideableConfigModel,
} from "./OverrideableConfigModel";

describe("OverrideableConfigModel serverlessVersion", () => {
    const cleanups: Array<() => void> = [];
    afterEach(() => {
        while (cleanups.length) {
            cleanups.pop()!();
        }
    });

    function tempStorageFile(): Uri {
        const dir = tmp.dirSync({unsafeCleanup: true});
        cleanups.push(dir.removeCallback);
        return Uri.file(path.join(dir.name, "vscode.overrides.json"));
    }

    it("treats serverlessVersion as an overrideable key", () => {
        expect(isOverrideableConfigKey("serverlessVersion")).to.equal(true);
    });

    it("persists a serverless version alongside the serverless flag", async () => {
        const file = tempStorageFile();

        await OverrideableConfigModel._write(file, "serverless", "dev", true);
        await OverrideableConfigModel._write(
            file,
            "serverlessVersion",
            "dev",
            "5"
        );

        const data = JSON.parse(readFileSync(file.fsPath, "utf-8"));
        expect(data.serverless).to.equal(true);
        expect(data.serverlessVersion).to.equal("5");
    });

    it("clears the version when written undefined (revert to fallback)", async () => {
        const file = tempStorageFile();
        await OverrideableConfigModel._write(
            file,
            "serverlessVersion",
            "dev",
            "4"
        );

        await OverrideableConfigModel._write(
            file,
            "serverlessVersion",
            "dev",
            undefined
        );

        const data = JSON.parse(readFileSync(file.fsPath, "utf-8"));
        expect(data.serverlessVersion).to.equal(undefined);
    });

    it("leaves a legacy version-less serverless config untouched (backward compatible)", async () => {
        const file = tempStorageFile();
        // A config written by an older extension: serverless on, no version.
        writeFileSync(
            file.fsPath,
            JSON.stringify({serverless: true, clusterId: "abc"})
        );

        // Writing an unrelated key must not fabricate a serverlessVersion.
        await OverrideableConfigModel._write(
            file,
            "authProfile",
            "dev",
            "DEFAULT"
        );

        const data = JSON.parse(readFileSync(file.fsPath, "utf-8"));
        expect(data.serverless).to.equal(true);
        expect(data).to.not.have.property("serverlessVersion");
    });
});
