import { describe, expect, it } from "vitest";
import { sshConnectArgs, sshConnectCommandLine, sshConnectEnv } from "./ssh";

describe("the ssh connect command", () => {
    it("connects to serverless by default", () => {
        expect(sshConnectArgs({ kind: "serverless" }, "vscode")).toEqual([
            "ssh",
            "connect",
            "--ide=vscode",
            "--auto-approve",
        ]);
    });

    it("asks for a GPU accelerator on serverless", () => {
        expect(sshConnectArgs({ kind: "serverless", accelerator: "GPU_8xH100" }, "cursor")).toEqual(
            ["ssh", "connect", "--ide=cursor", "--auto-approve", "--accelerator=GPU_8xH100"],
        );
    });

    it("starts a stopped dedicated cluster", () => {
        expect(sshConnectArgs({ kind: "cluster", clusterId: "0123-abc" }, "vscode")).toEqual([
            "ssh",
            "connect",
            "--ide=vscode",
            "--auto-approve",
            "--cluster=0123-abc",
            "--auto-start-cluster",
        ]);
    });

    it.each([
        [
            "posix",
            "/opt/my ext/databricks",
            "'/opt/my ext/databricks' ssh connect --ide=vscode --auto-approve",
        ],
        [
            "powershell",
            "C:\\ext\\databricks.exe",
            "& 'C:\\ext\\databricks.exe' ssh connect --ide=vscode --auto-approve",
        ],
        [
            "cmd",
            "C:\\ext\\databricks.exe",
            '"C:\\ext\\databricks.exe" ssh connect --ide=vscode --auto-approve',
        ],
    ] as const)("quotes the CLI for %s", (kind, cli, line) => {
        expect(sshConnectCommandLine(cli, { kind: "serverless" }, "vscode", kind)).toBe(line);
    });

    it("asks the CLI for text output", () => {
        expect(
            sshConnectEnv({
                DATABRICKS_OUTPUT_FORMAT: "json",
                DATABRICKS_CONFIG_PROFILE: "DEFAULT",
            }),
        ).toEqual({
            DATABRICKS_OUTPUT_FORMAT: "text",
            DATABRICKS_CONFIG_PROFILE: "DEFAULT",
        });
    });

    it("passes the editor's command only when it was found", () => {
        const childEnv = { DATABRICKS_OUTPUT_FORMAT: "json" };
        expect(sshConnectEnv(childEnv, "/opt/editor/bin/code")).toEqual({
            DATABRICKS_OUTPUT_FORMAT: "text",
            DATABRICKS_SSH_IDE_COMMAND: "/opt/editor/bin/code",
        });
        expect(sshConnectEnv(childEnv)).not.toHaveProperty("DATABRICKS_SSH_IDE_COMMAND");
    });
});
