import {ExtensionContext, Uri, commands, window} from "vscode";
import {PackageJsonUtils} from "./utils";
import {logging} from "@databricks/databricks-sdk";
import {Loggers} from "./logger";
import {WorkspaceStateManager} from "./vscode-objs/WorkspaceState";
import path from "path";
import {exists} from "fs-extra";

interface SemvVer {
    major: number;
    minor: number;
    patch: number;
}

function parseSemvVer(version?: string) {
    if (version === undefined) {
        return undefined;
    }

    try {
        const [major, minor, patch] = version.split(".");
        return {
            major: parseInt(major),
            minor: parseInt(minor),
            patch: parseInt(patch),
        };
    } catch (e: unknown) {
        logging.NamedLogger.getOrCreate(Loggers.Extension).error(
            "Failed to parse version",
            e
        );
        return undefined;
    }
}

function compare(a: SemvVer, b: SemvVer) {
    if (a.major !== b.major) {
        return a.major > b.major ? 1 : -1;
    }

    if (a.minor !== b.minor) {
        return a.minor > b.minor ? 1 : -1;
    }

    if (a.patch !== b.patch) {
        return a.patch > b.patch ? 1 : -1;
    }

    return 0;
}

async function findFileFowWhatsNew(
    context: ExtensionContext,
    previousVersion: SemvVer,
    currentVersion: SemvVer
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
        compare(currentVersion, previousVersion) > 0 &&
        (await exists(markdownFile))
    ) {
        return markdownFile;
    }

    return context.asAbsolutePath("CHANGELOG.md");
}

export async function showWhatsNewPopup(
    context: ExtensionContext,
    workspaceState: WorkspaceStateManager
) {
    const packageJsonMetadata = await PackageJsonUtils.getMetadata(context);
    const currentVersion = parseSemvVer(packageJsonMetadata.version);
    if (currentVersion === undefined) {
        return;
    }

    const previousVersion = parseSemvVer(
        workspaceState.lastInstalledExtensionVersion
    ) ?? {major: 0, minor: 0, patch: 0};

    // if the extension is downgraded, we do not want to show the popup
    if (compare(currentVersion, previousVersion) <= 0) {
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
