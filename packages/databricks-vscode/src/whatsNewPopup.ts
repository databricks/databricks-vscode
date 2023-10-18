import {ExtensionContext, Uri, commands, window} from "vscode";
import {PackageJsonUtils} from "./utils";
import {StateStorage} from "./vscode-objs/StateStorage";
import path from "path";
import {exists} from "fs-extra";
import * as semver from "semver";

export async function findFileFowWhatsNew(
    context: ExtensionContext,
    previousVersion: semver.SemVer,
    currentVersion: semver.SemVer
) {
    const markdownFile = context.asAbsolutePath(
        path.join(
            "resources",
            "whats-new",
            `${currentVersion.major}.${currentVersion.minor}.md`
        )
    );

    // To maintain release discipline (prevent too big changes from being released in a patch version)
    // we explicitly do not show the custom message popup for patch versions upgrades.
    currentVersion.patch = 0;
    previousVersion.patch = 0;

    if (
        semver.compare(currentVersion, previousVersion) > 0 &&
        (await exists(markdownFile))
    ) {
        return markdownFile;
    }

    return context.asAbsolutePath("CHANGELOG.md");
}

export async function showWhatsNewPopup(
    context: ExtensionContext,
    storage: StateStorage
) {
    const packageJsonMetadata = await PackageJsonUtils.getMetadata(context);
    const currentVersion = semver.parse(packageJsonMetadata.version);
    if (currentVersion === null) {
        return;
    }

    const previousVersion =
        semver.parse(storage.lastInstalledExtensionVersion) ??
        new semver.SemVer("0.0.0");

    // if the extension is downgraded, we do not want to show the popup
    if (semver.compare(currentVersion, previousVersion) <= 0) {
        return;
    }

    // We try to find a custom markdown file for the current version,
    // if not found, we use the changelog.md in its entirety.
    const markdownFile = await findFileFowWhatsNew(
        context,
        previousVersion,
        currentVersion
    );

    if (window.state.focused) {
        commands.executeCommand("markdown.showPreview", Uri.file(markdownFile));
        return;
    }

    const listener = window.onDidChangeWindowState((e) => {
        if (!e.focused) {
            return;
        }
        commands.executeCommand("markdown.showPreview", Uri.file(markdownFile));
        listener.dispose();
    });
    context.subscriptions.push(listener);
}
