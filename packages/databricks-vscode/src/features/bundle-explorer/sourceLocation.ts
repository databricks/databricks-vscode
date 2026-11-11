import { Location, Position, Uri } from "vscode";
import type { BundleLocations } from "../../kernel/cli/commands/bundle";

/**
 * Where `resources.<resourceKey>` is declared, from `bundle summary
 * --include-locations`. Ported from the old `SourceLocationUtils.ts`.
 */
export function getSourceLocation(
    locations: BundleLocations | undefined,
    projectRoot: string,
    resourceKey: string,
): Location | undefined {
    if (!locations || !locations.locations || !locations.files || locations.version !== 1) {
        return undefined;
    }
    const location = locations.locations[`resources.${resourceKey}`]?.[0];
    if (!Array.isArray(location) || location.length !== 3) {
        return undefined;
    }
    const file = locations.files[location[0]!];
    if (!file) {
        return undefined;
    }
    return new Location(
        Uri.joinPath(Uri.file(projectRoot), file),
        new Position(location[1]! - 1, location[2]! - 1),
    );
}
