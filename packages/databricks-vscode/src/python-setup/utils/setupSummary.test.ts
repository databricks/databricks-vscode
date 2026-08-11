import {expect} from "chai";
import {formatSetupSummary} from "./setupSummary";
import {PythonSetupResult} from "../models/PythonSetupResult";
import {
    SUCCESS_DEFAULT,
    SUCCESS_CONSTRAINTS_ONLY,
    SUCCESS_REAL_RUN,
} from "../models/fixtures/setupLocalResults";

describe("formatSetupSummary", () => {
    it("titles a default-mode run for Databricks Connect", () => {
        const {title} = formatSetupSummary(SUCCESS_DEFAULT);
        expect(title).to.equal(
            "Python environment ready for Databricks Connect"
        );
    });

    it("lists the resolved python and databricks-connect versions", () => {
        const {detail} = formatSetupSummary(SUCCESS_DEFAULT);
        expect(detail).to.contain("Python 3.12 · databricks-connect 17.2.0");
    });

    it("names the serverless compute", () => {
        const {detail} = formatSetupSummary(SUCCESS_DEFAULT);
        expect(detail).to.contain("Compute: serverless v4");
    });

    it("itemizes the constraints, uv sync and interpreter steps", () => {
        const {detail} = formatSetupSummary(SUCCESS_DEFAULT);
        expect(detail).to.contain(
            "✓ Added matching Databricks constraints to pyproject.toml"
        );
        expect(detail).to.contain(
            "✓ Built the virtual environment with uv sync"
        );
        expect(detail).to.contain(
            "✓ Selected .venv as the workspace interpreter"
        );
    });

    it("says packages were downloaded when artifacts came from the network", () => {
        const {detail} = formatSetupSummary(SUCCESS_DEFAULT);
        expect(detail).to.contain("✓ Downloaded Databricks packages");
    });

    it("says packages were reused when artifacts came from cache", () => {
        const cached: PythonSetupResult = {
            ...SUCCESS_DEFAULT,
            resolved: {...SUCCESS_DEFAULT.resolved!, artifactSource: "cache"},
        };
        const {detail} = formatSetupSummary(cached);
        expect(detail).to.contain("✓ Reused cached Databricks packages");
        expect(detail).to.not.contain("Downloaded");
    });

    it("drops the databricks-connect clause in constraints-only mode", () => {
        const {title, detail} = formatSetupSummary(SUCCESS_CONSTRAINTS_ONLY);
        expect(title).to.equal(
            "Python environment ready — constraints applied"
        );
        expect(detail).to.contain("Python 3.12");
        expect(detail).to.not.contain("databricks-connect");
    });

    it("shows the backup line and venv path on a real run that backed up", () => {
        const {detail} = formatSetupSummary(SUCCESS_REAL_RUN);
        expect(detail).to.contain(
            "✓ Backed up your previous pyproject.toml (pyproject.toml.bak)"
        );
        expect(detail).to.contain(
            "Virtual environment: /home/user/project/.venv"
        );
    });

    it("omits the backup line when nothing was backed up", () => {
        const noBackup: PythonSetupResult = {
            ...SUCCESS_REAL_RUN,
            backupPath: undefined,
        };
        const {detail} = formatSetupSummary(noBackup);
        expect(detail).to.not.contain("Backed up");
    });

    it("names a cluster target when a cluster was used", () => {
        const cluster: PythonSetupResult = {
            ...SUCCESS_REAL_RUN,
            compute: {
                source: "cluster",
                clusterId: "0717-abc",
                envKey: "cluster/0717-abc",
            },
        };
        const {detail} = formatSetupSummary(cluster);
        expect(detail).to.contain("Compute: cluster 0717-abc");
    });

    it("appends a warnings section when warnings are present", () => {
        const warned: PythonSetupResult = {
            ...SUCCESS_DEFAULT,
            warnings: [{code: "W_X", message: "pinned an older wheel"}],
        };
        const {detail} = formatSetupSummary(warned);
        expect(detail).to.contain("⚠ Warnings");
        expect(detail).to.contain("pinned an older wheel");
    });
});
