import {expect} from "chai";
import {buildSetupLocalArgs, SetupLocalInvocation} from "./setupLocalArgs";

describe("buildSetupLocalArgs", () => {
    it("builds a default serverless invocation with JSON output", () => {
        const inv: SetupLocalInvocation = {
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
            compute: {kind: "cluster", clusterId: "0710-abc"},
        });
        const i = args.indexOf("--cluster-id");
        expect(i).to.be.greaterThan(-1);
        expect(args[i + 1]).to.equal("0710-abc");
        expect(args).to.not.include("--serverless-version");
    });

    it("adds --no-constraints when constraints are skipped", () => {
        const args = buildSetupLocalArgs({
            skipConstraints: true,
            compute: {kind: "serverless", version: "5"},
        });
        expect(args).to.include("--no-constraints");
        expect(args).to.not.include("--no-dbconnect");
    });

    it("adds --no-dbconnect when databricks-connect is skipped", () => {
        const args = buildSetupLocalArgs({
            skipDbconnect: true,
            compute: {kind: "serverless", version: "5"},
        });
        expect(args).to.include("--no-dbconnect");
        expect(args).to.not.include("--no-constraints");
    });

    it("adds both negative flags when both are skipped, --no-constraints first", () => {
        const args = buildSetupLocalArgs({
            skipConstraints: true,
            skipDbconnect: true,
            compute: {kind: "serverless", version: "5"},
        });
        const c = args.indexOf("--no-constraints");
        const d = args.indexOf("--no-dbconnect");
        expect(c).to.be.greaterThan(-1);
        expect(d).to.be.greaterThan(-1);
        expect(c).to.be.lessThan(d);
    });

    it("emits no behavioral flags for the default (full) invocation", () => {
        const args = buildSetupLocalArgs({
            compute: {kind: "serverless", version: "5"},
        });
        expect(args).to.not.include("--no-constraints");
        expect(args).to.not.include("--no-dbconnect");
    });

    it("never emits the deprecated --constraints-only flag", () => {
        const args = buildSetupLocalArgs({
            skipConstraints: true,
            skipDbconnect: true,
            compute: {kind: "cluster", clusterId: "c"},
        });
        expect(args).to.not.include("--constraints-only");
    });

    it("never passes --profile (auth is forwarded via the environment)", () => {
        const args = buildSetupLocalArgs({
            compute: {kind: "serverless", version: "5"},
        });
        expect(args).to.not.include("--profile");
    });

    it("passes the hidden --constraint-source-url when provided", () => {
        const args = buildSetupLocalArgs({
            compute: {kind: "serverless", version: "5"},
            constraintSourceUrl: "http://localhost:8077",
        });
        const i = args.indexOf("--constraint-source-url");
        expect(i).to.be.greaterThan(-1);
        expect(args[i + 1]).to.equal("http://localhost:8077");
    });

    it("always ends with --output json", () => {
        const args = buildSetupLocalArgs({
            skipConstraints: true,
            skipDbconnect: true,
            compute: {kind: "cluster", clusterId: "c"},
            constraintSourceUrl: "u",
        });
        expect(args.slice(-2)).to.deep.equal(["--output", "json"]);
    });

    it("adds --dry-run when the invocation is a dry run", () => {
        const args = buildSetupLocalArgs({
            compute: {kind: "serverless", version: "5"},
            dryRun: true,
        });
        expect(args).to.include("--dry-run");
        // Still requests machine-readable output last.
        expect(args.slice(-2)).to.deep.equal(["--output", "json"]);
    });

    it("omits --dry-run by default", () => {
        const args = buildSetupLocalArgs({
            compute: {kind: "serverless", version: "5"},
        });
        expect(args).to.not.include("--dry-run");
    });
});
