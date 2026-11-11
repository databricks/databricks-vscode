import {
    MarkdownString,
    ThemeColor,
    ThemeIcon,
    TreeItem,
    TreeItemCollapsibleState,
    Uri,
} from "vscode";
import type { NodeOfKind, UnityCatalogTreeNode } from "./types";

/** An icon of `resources/{dark,light}/unity-catalog/`. */
export type IconPaths = (file: string) => { dark: Uri; light: Uri };

export function iconPaths(asAbsolutePath: (relativePath: string) => string): IconPaths {
    return (file) => ({
        dark: Uri.file(asAbsolutePath(`resources/dark/unity-catalog/${file}`)),
        light: Uri.file(asAbsolutePath(`resources/light/unity-catalog/${file}`)),
    });
}

function formatTs(ms: number | undefined): string | undefined {
    if (ms === undefined) {
        return undefined;
    }
    return new Date(ms).toISOString().replace("T", " ").substring(0, 19) + " UTC";
}

function catalogIconFile(name: string): string {
    switch (name) {
        case "main":
            return "catalog-main.svg";
        case "samples":
            return "catalog-samples.svg";
        case "system":
            return "catalog-system.svg";
        default:
            return "catalog.svg";
    }
}

function pinnedOwnedDescription(isPinned: boolean, owned: boolean | undefined): string | undefined {
    if (isPinned && owned) {
        return "★ · yours";
    }
    if (isPinned) {
        return "★";
    }
    if (owned) {
        return "yours";
    }
    return undefined;
}

function starDescription(isPinned: boolean, detail: string | undefined): string | undefined {
    if (!isPinned) {
        return detail;
    }
    return detail ? `★ · ${detail}` : "★";
}

function withPin(base: string, isPinned: boolean): string {
    return isPinned ? `${base}.is-pinned` : base;
}

function item(
    label: string,
    collapsible: boolean | "expanded",
    fields: Partial<Pick<TreeItem, "description" | "tooltip" | "iconPath" | "contextValue">>,
): TreeItem {
    const state =
        collapsible === "expanded"
            ? TreeItemCollapsibleState.Expanded
            : collapsible
              ? TreeItemCollapsibleState.Collapsed
              : TreeItemCollapsibleState.None;
    const result = new TreeItem(label, state);
    if (fields.description !== undefined) {
        result.description = fields.description;
    }
    if (fields.tooltip !== undefined) {
        result.tooltip = fields.tooltip;
    }
    if (fields.iconPath !== undefined) {
        result.iconPath = fields.iconPath;
    }
    if (fields.contextValue !== undefined) {
        result.contextValue = fields.contextValue;
    }
    return result;
}

/**
 * The old rows: labels, descriptions, tooltips, icons and `contextValue`s,
 * which the menus match (`.has-url`, `.has-storage`, `.is-view`, `.is-pinned`).
 */
export function buildTreeItem(
    node: UnityCatalogTreeNode,
    exploreUrl: string | undefined,
    isPinned: boolean,
    icon: IconPaths,
): TreeItem {
    switch (node.kind) {
        case "error":
            return item(node.message, false, {
                iconPath: new ThemeIcon(
                    "error",
                    new ThemeColor("notificationsErrorIcon.foreground"),
                ),
            });
        case "empty":
            return item(node.message, false, { iconPath: icon("no-data.svg") });
        case "favorites":
            return item("Favorites", "expanded", {
                iconPath: icon("favorites.svg"),
                contextValue: "unityCatalog.favorites",
            });
        case "catalog":
            return renderCatalog(node, exploreUrl, isPinned, icon);
        case "schema":
            return renderSchema(node, exploreUrl, isPinned, icon);
        case "table":
            return renderTable(node, exploreUrl, isPinned, icon);
        case "volume":
            return renderVolume(node, exploreUrl, isPinned, icon);
        case "function":
            return item(node.name, false, {
                description: isPinned ? "★" : undefined,
                tooltip: node.fullName,
                iconPath: icon("function.svg"),
                contextValue: withPin(
                    exploreUrl ? "unityCatalog.function.has-url" : "unityCatalog.function",
                    isPinned,
                ),
            });
        case "registeredModel":
            return renderRegisteredModel(node, exploreUrl, isPinned, icon);
        case "modelVersion":
            return renderModelVersion(node, exploreUrl, isPinned, icon);
        case "column":
            return renderColumn(node, icon);
        case "group":
            return renderGroup(node, icon);
    }
}

function renderCatalog(
    node: NodeOfKind<"catalog">,
    exploreUrl: string | undefined,
    isPinned: boolean,
    icon: IconPaths,
): TreeItem {
    const tt = new MarkdownString(`**${node.fullName}**`);
    if (node.comment) {
        tt.appendMarkdown(`\n\n${node.comment}`);
    }
    return item(node.name, true, {
        description: pinnedOwnedDescription(isPinned, node.owned),
        tooltip: tt,
        iconPath: icon(catalogIconFile(node.name)),
        contextValue: withPin(
            exploreUrl ? "unityCatalog.catalog.has-url" : "unityCatalog.catalog",
            isPinned,
        ),
    });
}

function renderSchema(
    node: NodeOfKind<"schema">,
    exploreUrl: string | undefined,
    isPinned: boolean,
    icon: IconPaths,
): TreeItem {
    const tt = new MarkdownString(`**${node.fullName}**`);
    if (node.comment) {
        tt.appendMarkdown(`\n\n${node.comment}`);
    }
    return item(node.name, true, {
        description: pinnedOwnedDescription(isPinned, node.owned),
        tooltip: tt,
        iconPath: icon("schema.svg"),
        contextValue: withPin(
            exploreUrl ? "unityCatalog.schema.has-url" : "unityCatalog.schema",
            isPinned,
        ),
    });
}

function renderTable(
    node: NodeOfKind<"table">,
    exploreUrl: string | undefined,
    isPinned: boolean,
    icon: IconPaths,
): TreeItem {
    const typeSuffix = node.tableType && node.tableType !== "MANAGED" ? ` (${node.tableType})` : "";
    const flags = ["unityCatalog.table"];
    if (exploreUrl) {
        flags.push("has-url");
    }
    if (node.storageLocation) {
        flags.push("has-storage");
    }
    const isView = node.tableType === "VIEW" || node.tableType === "MATERIALIZED_VIEW";
    if (isView && node.viewDefinition) {
        flags.push("is-view");
    }
    if (isPinned) {
        flags.push("is-pinned");
    }

    const tt = new MarkdownString(`**${node.fullName}**`);
    if (node.tableType) {
        tt.appendMarkdown(`\n\n*Type:* ${node.tableType}`);
    }
    if (node.dataSourceFormat) {
        tt.appendMarkdown(` · *Format:* ${node.dataSourceFormat}`);
    }
    if (node.owner) {
        tt.appendMarkdown(`\n\n*Owner:* ${node.owner}`);
    }
    if (node.createdBy) {
        tt.appendMarkdown(` · *Created by:* ${node.createdBy}`);
    }
    const cAt = formatTs(node.createdAt);
    const uAt = formatTs(node.updatedAt);
    if (cAt) {
        tt.appendMarkdown(`\n\n*Created:* ${cAt}`);
    }
    if (uAt) {
        tt.appendMarkdown(`  *Updated:* ${uAt}`);
    }
    if (node.comment) {
        tt.appendMarkdown(`\n\n${node.comment}`);
    }

    // No columns yet (a favorite) means not fetched: expandable.
    const hasColumns = node.columns === undefined || node.columns.length > 0;
    return item(`${node.name}${typeSuffix}`, hasColumns, {
        description: starDescription(isPinned, node.dataSourceFormat),
        tooltip: tt,
        iconPath: icon("table.svg"),
        contextValue: flags.join("."),
    });
}

function renderVolume(
    node: NodeOfKind<"volume">,
    exploreUrl: string | undefined,
    isPinned: boolean,
    icon: IconPaths,
): TreeItem {
    const isExternal = node.volumeType !== undefined && node.volumeType !== "MANAGED";
    const flags = ["unityCatalog.volume"];
    if (exploreUrl) {
        flags.push("has-url");
    }
    if (node.storageLocation) {
        flags.push("has-storage");
    }
    if (isPinned) {
        flags.push("is-pinned");
    }
    const tt = new MarkdownString(`**${node.fullName}**`);
    if (node.volumeType) {
        tt.appendMarkdown(`\n\n*Type:* ${node.volumeType}`);
    }
    if (node.owner) {
        tt.appendMarkdown(`\n\n*Owner:* ${node.owner}`);
    }
    if (node.comment) {
        tt.appendMarkdown(`\n\n${node.comment}`);
    }
    return item(isExternal ? `${node.name} (${node.volumeType})` : node.name, false, {
        description: isPinned ? "★" : undefined,
        tooltip: tt,
        iconPath: icon("volume.svg"),
        contextValue: flags.join("."),
    });
}

function renderRegisteredModel(
    node: NodeOfKind<"registeredModel">,
    exploreUrl: string | undefined,
    isPinned: boolean,
    icon: IconPaths,
): TreeItem {
    const tt = new MarkdownString(`**${node.fullName}**`);
    if (node.owner) {
        tt.appendMarkdown(`\n\n*Owner:* ${node.owner}`);
    }
    if (node.comment) {
        tt.appendMarkdown(`\n\n${node.comment}`);
    }
    const aliasList = (node.aliases ?? [])
        .filter((a) => a.aliasName)
        .map((a) =>
            a.versionNum !== undefined ? `${a.aliasName} → v${a.versionNum}` : a.aliasName!,
        )
        .join(", ");
    if (aliasList) {
        tt.appendMarkdown(`\n\n*Aliases:* ${aliasList}`);
    }
    const cAt = formatTs(node.createdAt);
    const uAt = formatTs(node.updatedAt);
    if (cAt) {
        tt.appendMarkdown(`\n\n*Created:* ${cAt}`);
    }
    if (uAt) {
        tt.appendMarkdown(`  *Updated:* ${uAt}`);
    }
    return item(node.name, true, {
        description: isPinned ? "★" : undefined,
        tooltip: tt,
        iconPath: icon("registered-model.svg"),
        contextValue: withPin(
            exploreUrl ? "unityCatalog.registeredModel.has-url" : "unityCatalog.registeredModel",
            isPinned,
        ),
    });
}

function renderModelVersion(
    node: NodeOfKind<"modelVersion">,
    exploreUrl: string | undefined,
    isPinned: boolean,
    icon: IconPaths,
): TreeItem {
    const tt = new MarkdownString(`**v${node.version}**`);
    if (node.status) {
        tt.appendMarkdown(`\n\n*Status:* ${node.status}`);
    }
    if (node.comment) {
        tt.appendMarkdown(`\n\n${node.comment}`);
    }
    if (node.createdBy) {
        tt.appendMarkdown(`\n\n*Created by:* ${node.createdBy}`);
    }
    const cAt = formatTs(node.createdAt);
    if (cAt) {
        tt.appendMarkdown(`\n\n*Created:* ${cAt}`);
    }
    const statusDetail = node.status && node.status !== "READY" ? node.status : undefined;
    return item(`v${node.version}`, false, {
        description: starDescription(isPinned, statusDetail),
        tooltip: tt,
        iconPath: icon("model-version.svg"),
        contextValue: withPin(
            exploreUrl ? "unityCatalog.modelVersion.has-url" : "unityCatalog.modelVersion",
            isPinned,
        ),
    });
}

const GROUP_LABELS = {
    tables: "Tables",
    volumes: "Volumes",
    functions: "Functions",
    models: "Models",
};
const GROUP_ICONS = {
    tables: "table.svg",
    volumes: "volume.svg",
    functions: "function.svg",
    models: "registered-model.svg",
};

function renderGroup(node: NodeOfKind<"group">, icon: IconPaths): TreeItem {
    return item(`${GROUP_LABELS[node.groupType]} (${node.count})`, true, {
        iconPath: icon(GROUP_ICONS[node.groupType]),
        contextValue: `unityCatalog.group.${node.groupType}`,
    });
}

function renderColumn(node: NodeOfKind<"column">, icon: IconPaths): TreeItem {
    const typeLabel = node.typeText ?? node.typeName ?? "";
    const tt = new MarkdownString(`**${node.name}** \`${typeLabel}\``);
    if (node.nullable === false) {
        tt.appendMarkdown(" *(not null)*");
    }
    if (node.comment) {
        tt.appendMarkdown(`\n\n${node.comment}`);
    }
    return item(node.name, false, {
        description: typeLabel,
        tooltip: tt,
        iconPath: icon("column.svg"),
        contextValue: "unityCatalog.column",
    });
}
