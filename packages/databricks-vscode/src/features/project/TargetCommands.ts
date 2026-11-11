import { window, type QuickPickItem } from "vscode";
import type { Project, ProjectService } from "../../kernel/project/ProjectService";
import { CancelledError } from "../../platform/errors";

/**
 * The target picker (SHELL-06): every target of the bundle, the current one
 * first, with its mode and host. Ported from the old
 * `ConnectionCommands.selectTarget`. The choice is saved per project.
 */
export async function selectTarget(project: Project, service: ProjectService): Promise<void> {
    const current = service.target.value;
    const items: QuickPickItem[] = project.config.targets
        .map((t) => ({ label: t.name, description: t.mode ?? "dev", detail: t.host }))
        .sort((a, b) => Number(b.label === current) - Number(a.label === current));
    const picked = await window.showQuickPick(items, { title: "Select bundle target" });
    if (picked === undefined) {
        throw new CancelledError();
    }
    await service.selectTarget(picked.label);
}
