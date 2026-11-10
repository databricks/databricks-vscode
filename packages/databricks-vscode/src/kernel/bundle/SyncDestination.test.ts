import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    localToRemote,
    localToRemoteNotebook,
    remoteToLocal,
    syncDestination,
    workspacePath,
} from "./SyncDestination";

const destination = {
    localRoot: "/Users/me/notebook-best-practices",
    remoteRoot: "/Workspace/Users/fabian@databricks.com/.bundle/nbp/dev/files",
};
const REMOTE = "/Users/fabian@databricks.com/.bundle/nbp/dev/files";

describe("syncDestination", () => {
    it("is the project's root and validate's workspace.file_path", () => {
        const validated = {
            root: "/p",
            target: "dev",
            host: "https://h",
            config: { workspace: { file_path: "/Workspace/x/files" } },
        };
        expect(syncDestination(validated)).toEqual({
            localRoot: "/p",
            remoteRoot: "/Workspace/x/files",
        });
        expect(syncDestination({ ...validated, config: {} })).toBeUndefined();
        expect(syncDestination(undefined)).toBeUndefined();
    });
});

// The non-Repos cases of the old `SyncDestination.test.ts`.
describe("local to remote", () => {
    it("maps a file", () => {
        expect(localToRemote("/Users/me/notebook-best-practices/hello.py", destination)).toBe(
            `${REMOTE}/hello.py`,
        );
    });

    it("maps notebooks, which lose their extension", () => {
        expect(
            localToRemoteNotebook(
                "/Users/me/notebook-best-practices/notebooks/covid_eda.py",
                destination,
            ),
        ).toBe(`${REMOTE}/notebooks/covid_eda`);
        expect(
            localToRemoteNotebook("/Users/me/notebook-best-practices/a.ipynb", destination),
        ).toBe(`${REMOTE}/a`);
    });

    it("refuses a file outside the project", () => {
        expect(() => localToRemote("/Users/me/other/hello.py", destination)).toThrow(
            /not within the workspace/,
        );
    });

    it.runIf(process.platform === "win32")("processes a Windows path", () => {
        expect(
            localToRemote(path.join("C:\\a\\b\\c", "d"), {
                localRoot: "C:\\a\\b\\c",
                remoteRoot: REMOTE,
            }),
        ).toBe(`${REMOTE}/d`);
    });
});

describe("remote to local", () => {
    const mapping = {
        remoteRoot: "/Workspace/Users/me/.bundle/demo/dev/files",
        localRoot: "/project",
    };

    it("maps the bundle's files to the project, with or without /Workspace", () => {
        expect(remoteToLocal("/Workspace/Users/me/.bundle/demo/dev/files/src/nb", mapping)).toBe(
            path.join("/project", "src", "nb"),
        );
        expect(remoteToLocal("/Users/me/.bundle/demo/dev/files/src/nb", mapping)).toBe(
            path.join("/project", "src", "nb"),
        );
        expect(
            remoteToLocal("/Users/me/.bundle/demo/dev/files", {
                remoteRoot: "/Users/me/.bundle/demo/dev/files/",
                localRoot: "/p",
            }),
        ).toBe(path.join("/p"));
    });

    it("maps nothing outside them", () => {
        expect(remoteToLocal("/Users/me/other/nb", mapping)).toBeUndefined();
        expect(
            remoteToLocal("/Workspace/Users/me/.bundle/demo/dev/files-old/nb", mapping),
        ).toBeUndefined();
    });
});

describe("workspace path", () => {
    it("adds /Workspace once, as code on a cluster sees the file", () => {
        expect(workspacePath(`${REMOTE}/a b/c.py`)).toBe(`/Workspace${REMOTE}/a b/c.py`);
        expect(workspacePath(`/Workspace${REMOTE}/`)).toBe(`/Workspace${REMOTE}`);
    });
});
