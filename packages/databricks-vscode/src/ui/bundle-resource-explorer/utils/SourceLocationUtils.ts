import {Location, Position, Uri} from "vscode";
import {BundleRemoteState} from "../../../bundle/models/BundleRemoteStateModel";

export function getSourceLocation(
    locations: BundleRemoteState["__locations"] | undefined,
    projectRoot: Uri,
    resourceKey: string
): Location | undefined {
    if (
        !locations ||
        !locations.locations ||
        !locations.files ||
        locations.version !== 1
    ) {
        return undefined;
    }

    const location = locations.locations[`resources.${resourceKey}`]?.[0];
    if (!Array.isArray(location) || location.length !== 3) {
        return undefined;
    }

    const file = locations.files[location[0]];
    if (!file) {
        return undefined;
    }

    const path = Uri.joinPath(projectRoot, file);
    const position = new Position(location[1] - 1, location[2] - 1);
    return new Location(path, position);
}
