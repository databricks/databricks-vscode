export type FirstRunSurface = { kind: "whatsNew"; notes: string } | { kind: "none" };

interface MajorMinor {
    major: number;
    minor: number;
}

function parseVersion(version: string | undefined): MajorMinor | undefined {
    const match = /^(\d+)\.(\d+)\.\d+/.exec(version ?? "");
    if (match === null) {
        return undefined;
    }
    return { major: Number(match[1]), minor: Number(match[2]) };
}

/** The curated notes for `version`, relative to the extension root. */
function whatsNewNotesPath(version: MajorMinor): string {
    return `resources/whats-new/${version.major}.${version.minor}.md`;
}

/**
 * The first-run surface:
 * - an upgrade to a new minor or major version opens What's New, if that
 *   version has curated notes;
 * - anything else, a fresh install, patch releases and downgrades included,
 *   opens nothing. VS Code opens the Quickstart walkthrough on install.
 */
export function chooseFirstRunSurface(input: {
    previousVersion: string | undefined;
    currentVersion: string;
    hasNotes: (relativePath: string) => boolean;
}): FirstRunSurface {
    const previous = parseVersion(input.previousVersion);
    const current = parseVersion(input.currentVersion);
    if (previous === undefined || current === undefined) {
        return { kind: "none" };
    }
    const isNewMinor =
        current.major > previous.major ||
        (current.major === previous.major && current.minor > previous.minor);
    const notes = whatsNewNotesPath(current);
    if (isNewMinor && input.hasNotes(notes)) {
        return { kind: "whatsNew", notes };
    }
    return { kind: "none" };
}
