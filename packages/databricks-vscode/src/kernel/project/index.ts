import { select } from "../../platform/reactive";
import type { ProjectConnectionSource } from "../connection/ConnectionService";
import type { Project, ProjectService } from "./ProjectService";

export * from "./ProjectService";
export * from "./TargetFiles";

declare module "../../platform/commands" {
    interface Scopes {
        /** An active bundle project. */
        project: Project;
    }
}

/** What the connection needs from the project: the target's host, profile and saved choice. */
export function projectConnectionSource(
    project: ProjectService,
): ProjectConnectionSource & { dispose(): void } {
    const scope = select(project.snapshot, (s) => {
        if (s.project === undefined) {
            return { initialized: s.initialized };
        }
        const target = s.project.config.targets.find((t) => t.name === s.target);
        return {
            initialized: s.initialized,
            project: {
                root: s.project.root,
                target: target?.name,
                host: target?.host,
                workspaceProfile: target?.profile,
                savedProfile: s.overrides?.authProfile,
                signedOut: s.overrides?.signedOut === true,
            },
        };
    });
    return {
        scope,
        saveProfile: (profile) => project.saveOverride("authProfile", profile),
        saveSignedOut: (signedOut) =>
            project.saveOverride("signedOut", signedOut ? true : undefined),
        dispose: () => scope.dispose(),
    };
}
