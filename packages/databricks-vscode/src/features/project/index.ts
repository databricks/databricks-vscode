import fs from "node:fs";
import path from "node:path";
import type { Feature } from "../../kernel/feature";
import { when } from "../../platform/reactive";
import { LocalFolderSection, SELECT_PROJECT } from "./LocalFolderSection";
import { selectActiveProjectFolder } from "./ProjectCommands";
import { selectTarget } from "./TargetCommands";
import { SELECT_TARGET, TargetSection } from "./TargetSection";
import { BUNDLE_SUB_PROJECTS, EXTENSION_INITIALIZATION, PROJECT_EVENTS } from "./telemetry";
import { INITIALIZED, LEGACY_PROJECT, SUB_PROJECTS_AVAILABLE, TARGET_SET } from "./welcome";

/**
 * The bundle project (SHELL-01 to SHELL-03, SHELL-06): the Local Folder and
 * Target rows, the project and target pickers, and the welcome content while
 * no project is detected, including the legacy-project notice. Project scope.
 */
export const project: Feature = {
    id: "project",
    contextKeys: [INITIALIZED, SUB_PROJECTS_AVAILABLE, TARGET_SET, LEGACY_PROJECT],
    telemetryEvents: PROJECT_EVENTS,
    session: { [SELECT_PROJECT]: "same", [SELECT_TARGET]: "same" },

    register(ctx) {
        const { project: service, contextKeys } = ctx.kernel;
        ctx.commands.register(SELECT_PROJECT, () =>
            selectActiveProjectFolder(ctx.kernel, (count) =>
                ctx.telemetry.record(BUNDLE_SUB_PROJECTS, { count }),
            ),
        );
        ctx.commands.register(SELECT_TARGET, (p) => selectTarget(p, service), { scope: "project" });
        ctx.whileProjectSession((session) => {
            const host = () => ctx.kernel.connection.connection?.host;
            const { targetAccess } = ctx.kernel;
            const added = [
                ctx.sections.add(new LocalFolderSection(session.project)),
                ctx.sections.add(
                    new TargetSection(
                        session,
                        host,
                        () => targetAccess.value,
                        (listener) => targetAccess.onDidChange(() => listener()),
                    ),
                ),
            ];
            return { dispose: () => added.forEach((a) => a.dispose()) };
        });
        const update = () => {
            void contextKeys.set(SUB_PROJECTS_AVAILABLE, service.subProjects.value.length > 0);
            void contextKeys.set(TARGET_SET, service.target.value !== undefined);
            // Last: the views that wait for it (SSH Tunnel) then read the target too.
            void contextKeys.set(INITIALIZED, service.initialized.value);
        };
        // Read only while no project is detected, and after detection: register does no I/O.
        const updateLegacy = async () => {
            const root = service.root.value;
            const legacy =
                service.initialized.value &&
                service.active.value === undefined &&
                root !== undefined &&
                (await fs.promises.access(path.join(root, ".databricks", "project.json")).then(
                    () => true,
                    () => false,
                ));
            void contextKeys.set(LEGACY_PROJECT, legacy);
        };
        ctx.subscriptions.push(
            service.initialized.onDidChange(update),
            service.subProjects.onDidChange(update),
            service.target.onDidChange(update),
            service.initialized.onDidChange(() => void updateLegacy()),
            service.active.onDidChange(() => void updateLegacy()),
            service.root.onDidChange(() => void updateLegacy()),
        );
    },

    start(ctx) {
        const { project: service } = ctx.kernel;
        // Same order as update(), so the SSH views never see a target that isn't set yet.
        void ctx.kernel.contextKeys.set(TARGET_SET, service.target.value !== undefined);
        void ctx.kernel.contextKeys.set(INITIALIZED, service.initialized.value);
        // The first detection pass, as the old activation reported it.
        const record = ctx.telemetry.start(EXTENSION_INITIALIZATION);
        void when(service.initialized, (i) => i).then(() => {
            const detected = service.active.value !== undefined;
            record({ success: true, type: detected ? "dabs" : "unknown" });
            if (!detected && service.root.value !== undefined) {
                ctx.telemetry.record(BUNDLE_SUB_PROJECTS, {
                    count: service.subProjects.value.length,
                });
            }
        });
    },
};
