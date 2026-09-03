import {expect} from "chai";
import {ConfigurationTarget} from "vscode";
import {PythonEnvironmentSetupMode} from "../../vscode-objs/WorkspaceConfigs";
import {
    PythonSetupOptOutScope,
    PythonSetupOptOutSource,
} from "../../telemetry/constants";
import {
    ManualSetupOptOutDeps,
    optOutOfAutomatedPythonSetup,
} from "./manualSetupOptOut";

/**
 * Build the injected deps with recording spies. `currentMode` and `hasFolder`
 * are configurable; `setManual` fails when `writeError` is set.
 */
function makeDeps(opts: {
    currentMode?: PythonEnvironmentSetupMode;
    hasFolder?: boolean;
    writeError?: Error;
}) {
    const recorded: {
        scope: PythonSetupOptOutScope;
        source: PythonSetupOptOutSource;
    }[] = [];
    const written: ConfigurationTarget[] = [];
    const errors: string[] = [];
    const infos: string[] = [];
    const deps: ManualSetupOptOutDeps = {
        currentMode: () => opts.currentMode ?? "auto",
        hasFolder: () => opts.hasFolder ?? true,
        setManual: async (target) => {
            if (opts.writeError) {
                throw opts.writeError;
            }
            written.push(target);
        },
        recordOptOut: (report) => recorded.push(report),
        showError: async (m) => errors.push(m),
        showInfo: async (m) => infos.push(m),
    };
    return {deps, recorded, written, errors, infos};
}

describe("optOutOfAutomatedPythonSetup", () => {
    it("records the opt-out on a real auto->manual transition (workspace)", async () => {
        const {deps, recorded, written, infos} = makeDeps({
            currentMode: "auto",
            hasFolder: true,
        });

        await optOutOfAutomatedPythonSetup("error_popup", deps);

        expect(written).to.deep.equal([ConfigurationTarget.Workspace]);
        expect(recorded).to.deep.equal([
            {scope: "workspace", source: "error_popup"},
        ]);
        expect(infos[0]).to.contain("for this project");
    });

    it("writes and confirms Global scope when no folder is open", async () => {
        const {deps, recorded, written, infos} = makeDeps({
            currentMode: "auto",
            hasFolder: false,
        });

        await optOutOfAutomatedPythonSetup("command_palette", deps);

        expect(written).to.deep.equal([ConfigurationTarget.Global]);
        expect(recorded).to.deep.equal([
            {scope: "global", source: "command_palette"},
        ]);
        expect(infos[0]).to.contain("globally");
    });

    it("does NOT record when already manual (no transition), but still confirms", async () => {
        const {deps, recorded, written, infos} = makeDeps({
            currentMode: "manual",
            hasFolder: true,
        });

        await optOutOfAutomatedPythonSetup("command_palette", deps);

        // Idempotent write still happens, but no opt-out is counted.
        expect(written).to.deep.equal([ConfigurationTarget.Workspace]);
        expect(recorded).to.have.length(0);
        expect(infos).to.have.length(1);
    });

    it("does NOT record and surfaces the error when the write fails", async () => {
        const {deps, recorded, errors, infos} = makeDeps({
            currentMode: "auto",
            writeError: new Error("EACCES"),
        });

        await optOutOfAutomatedPythonSetup("error_popup", deps);

        expect(recorded).to.have.length(0);
        expect(infos).to.have.length(0);
        expect(errors[0]).to.contain(
            "Could not update databricks.python.environmentSetup"
        );
        expect(errors[0]).to.contain("EACCES");
    });
});
