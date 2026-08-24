import {expect} from "chai";
import {buildSetupLocalArgs, SetupLocalInvocation} from "./setupLocalArgs";

describe("buildSetupLocalArgs", () => {
    it("builds a default serverless invocation with JSON output", () => {
        const inv: SetupLocalInvocation = {
            mode: "default",
            compute: {kind: "serverless", version: "5"},
        };
        expect(buildSetupLocalArgs(inv)).to.deep.equal([
            "environments",
            "setup-local",
            "--serverless-version",
            "5",
            "--output",
            "json",
        ]);
    });

    it("uses --cluster-id for a cluster target", () => {
        const args = buildSetupLocalArgs({
            mode: "default",
            compute: {kind: "cluster", clusterId: "0710-abc"},
        });
        const i = args.indexOf("--cluster-id");
        expect(i).to.be.greaterThan(-1);
        expect(args[i + 1]).to.equal("0710-abc");
        expect(args).to.not.include("--serverless-version");
    });

    it("adds --constraints-only in constraints-only mode", () => {
        const args = buildSetupLocalArgs({
            mode: "constraints-only",
            compute: {kind: "serverless", version: "5"},
        });
        expect(args).to.include("--constraints-only");
    });

    it("omits --constraints-only in default mode", () => {
        const args = buildSetupLocalArgs({
            mode: "default",
            compute: {kind: "serverless", version: "5"},
        });
        expect(args).to.not.include("--constraints-only");
    });

    it("never passes --profile (auth is forwarded via the environment)", () => {
        const args = buildSetupLocalArgs({
            mode: "default",
            compute: {kind: "serverless", version: "5"},
        });
        expect(args).to.not.include("--profile");
    });

    it("passes the hidden --constraint-source-url when provided", () => {
        const args = buildSetupLocalArgs({
            mode: "default",
            compute: {kind: "serverless", version: "5"},
            constraintSourceUrl: "http://localhost:8077",
        });
        const i = args.indexOf("--constraint-source-url");
        expect(i).to.be.greaterThan(-1);
        expect(args[i + 1]).to.equal("http://localhost:8077");
    });

    it("always ends with --output json", () => {
        const args = buildSetupLocalArgs({
            mode: "constraints-only",
            compute: {kind: "cluster", clusterId: "c"},
            constraintSourceUrl: "u",
        });
        expect(args.slice(-2)).to.deep.equal(["--output", "json"]);
    });

    it("adds --dry-run when the invocation is a dry run", () => {
        const args = buildSetupLocalArgs({
            mode: "default",
            compute: {kind: "serverless", version: "5"},
            dryRun: true,
        });
        expect(args).to.include("--dry-run");
        // Still requests machine-readable output last.
        expect(args.slice(-2)).to.deep.equal(["--output", "json"]);
    });

    it("omits --dry-run by default", () => {
        const args = buildSetupLocalArgs({
            mode: "default",
            compute: {kind: "serverless", version: "5"},
        });
        expect(args).to.not.include("--dry-run");
    });
});
