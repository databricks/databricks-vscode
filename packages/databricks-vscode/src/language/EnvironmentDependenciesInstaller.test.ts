import {TelemetryReporter} from "@vscode/extension-telemetry";
import {expect} from "chai";
import {anything, capture, instance, mock, when} from "ts-mockito";
import {Telemetry} from "../telemetry";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";
import {EnvironmentDependenciesInstaller} from "./EnvironmentDependenciesInstaller";

describe(__filename, () => {
    let reporter: TelemetryReporter;
    let telemetry: Telemetry;

    beforeEach(() => {
        reporter = mock(TelemetryReporter);
        telemetry = new Telemetry(instance(reporter));
    });

    // The installer's package installs run `onInstall`; uninstalls resolve to
    // no-ops. connectionManager is only read by getSuggestedVersion(), which
    // install() skips when handed an explicit version, so it is never touched.
    function makeInstaller(onInstall: () => Promise<void>) {
        const pythonExtension = mock(MsPythonExtensionWrapper);
        when(
            pythonExtension.uninstallPackageFromEnvironment(
                anything(),
                anything()
            )
        ).thenResolve();
        when(
            pythonExtension.installPackageInEnvironment(
                anything(),
                anything(),
                anything()
            )
        ).thenCall(onInstall);
        return new EnvironmentDependenciesInstaller(
            instance(mock(ConnectionManager)),
            instance(pythonExtension),
            telemetry
        );
    }

    it("records a successful databricks-connect install as outcome ok", async () => {
        const installer = makeInstaller(async () => {});

        await installer.install("1.2.3");

        const [eventName, props, metrics] = capture(
            reporter.sendTelemetryEvent
        ).last();
        expect(eventName).to.equal("python_env.dbconnect_install");
        expect(props?.["event.outcome"]).to.equal("ok");
        expect(metrics?.["event.duration"]).to.be.a("number");
        expect(metrics?.["event.duration"]).to.be.at.least(0);
    });

    it("records a failed databricks-connect install as outcome failed", async () => {
        const installer = makeInstaller(async () => {
            throw new Error("pip failed");
        });

        await installer.install("1.2.3");

        const [eventName, props] = capture(reporter.sendTelemetryEvent).last();
        expect(eventName).to.equal("python_env.dbconnect_install");
        expect(props?.["event.outcome"]).to.equal("failed");
    });
});
