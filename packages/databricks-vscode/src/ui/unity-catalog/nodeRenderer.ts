import {
    MarkdownString,
    ThemeColor,
    ThemeIcon,
    TreeItemCollapsibleState,
} from "vscode";
import {UnityCatalogTreeNode, UnityCatalogTreeItem} from "./types";
import {formatTs} from "./utils";

export function buildTreeItem(
    node: UnityCatalogTreeNode,
    exploreUrl: string | undefined
): UnityCatalogTreeItem {
    switch (node.kind) {
        case "error":
            return renderError(node);
        case "empty":
            return renderEmpty(node);
        case "catalog":
            return renderCatalog(node, exploreUrl);
        case "schema":
            return renderSchema(node, exploreUrl);
        case "table":
            return renderTable(node, exploreUrl);
        case "volume":
            return renderVolume(node, exploreUrl);
        case "function":
            return renderFunction(node, exploreUrl);
        case "registeredModel":
            return renderRegisteredModel(node, exploreUrl);
        case "modelVersion":
            return renderModelVersion(node, exploreUrl);
        case "column":
            return renderColumn(node);
    }
}

function renderError(
    node: Extract<UnityCatalogTreeNode, {kind: "error"}>
): UnityCatalogTreeItem {
    return {
        label: node.message,
        iconPath: new ThemeIcon(
            "error",
            new ThemeColor("notificationsErrorIcon.foreground")
        ),
        collapsibleState: TreeItemCollapsibleState.None,
    };
}

function renderEmpty(
    node: Extract<UnityCatalogTreeNode, {kind: "empty"}>
): UnityCatalogTreeItem {
    return {
        label: node.message,
        iconPath: new ThemeIcon(
            "info",
            new ThemeColor("descriptionForeground")
        ),
        collapsibleState: TreeItemCollapsibleState.None,
    };
}

function renderCatalog(
    node: Extract<UnityCatalogTreeNode, {kind: "catalog"}>,
    exploreUrl: string | undefined
): UnityCatalogTreeItem {
    const tt = new MarkdownString(`**${node.fullName}**`);
    if (node.comment) {
        tt.appendMarkdown(`\n\n${node.comment}`);
    }
    return {
        label: node.name,
        description: node.owned ? "yours" : undefined,
        tooltip: tt,
        iconPath: new ThemeIcon(
            "library",
            new ThemeColor("databricks.unityCatalog.catalog")
        ),
        contextValue: exploreUrl
            ? "unityCatalog.catalog.has-url"
            : "unityCatalog.catalog",
        collapsibleState: TreeItemCollapsibleState.Collapsed,
        url: exploreUrl,
        copyText: node.fullName,
    };
}

function renderSchema(
    node: Extract<UnityCatalogTreeNode, {kind: "schema"}>,
    exploreUrl: string | undefined
): UnityCatalogTreeItem {
    const tt = new MarkdownString(`**${node.fullName}**`);
    if (node.comment) {
        tt.appendMarkdown(`\n\n${node.comment}`);
    }
    const baseContextValue = exploreUrl
        ? "unityCatalog.schema.has-url"
        : "unityCatalog.schema";
    let description: string | undefined;
    if (node.pinned && node.owned) {
        description = "★ · yours";
    } else if (node.pinned) {
        description = "★";
    } else if (node.owned) {
        description = "yours";
    }
    return {
        label: node.name,
        description,
        tooltip: tt,
        iconPath: new ThemeIcon(
            "folder-library",
            new ThemeColor("databricks.unityCatalog.schema")
        ),
        contextValue: node.pinned
            ? baseContextValue + ".is-pinned"
            : baseContextValue,
        collapsibleState: TreeItemCollapsibleState.Collapsed,
        url: exploreUrl,
        copyText: node.fullName,
    };
}

function renderTable(
    node: Extract<UnityCatalogTreeNode, {kind: "table"}>,
    exploreUrl: string | undefined
): UnityCatalogTreeItem {
    const typeSuffix =
        node.tableType && node.tableType !== "MANAGED"
            ? ` (${node.tableType})`
            : "";
    const flags = ["unityCatalog.table"];
    if (exploreUrl) {
        flags.push("has-url");
    }
    if (node.storageLocation) {
        flags.push("has-storage");
    }
    const isView =
        node.tableType === "VIEW" || node.tableType === "MATERIALIZED_VIEW";
    if (isView && node.viewDefinition) {
        flags.push("is-view");
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

    const hasColumns = (node.columns?.length ?? 0) > 0;
    return {
        label: `${node.name}${typeSuffix}`,
        description: node.dataSourceFormat,
        tooltip: tt,
        iconPath: new ThemeIcon(
            "table",
            new ThemeColor("databricks.unityCatalog.table")
        ),
        contextValue: flags.join("."),
        collapsibleState: hasColumns
            ? TreeItemCollapsibleState.Collapsed
            : TreeItemCollapsibleState.None,
        url: exploreUrl,
        copyText: node.fullName,
        storageLocation: node.storageLocation,
        viewDefinition: node.viewDefinition,
    };
}

function renderVolume(
    node: Extract<UnityCatalogTreeNode, {kind: "volume"}>,
    exploreUrl: string | undefined
): UnityCatalogTreeItem {
    const isExternal =
        node.volumeType !== undefined && node.volumeType !== "MANAGED";
    const label = isExternal ? `${node.name} (${node.volumeType})` : node.name;
    const flags = ["unityCatalog.volume"];
    if (exploreUrl) {
        flags.push("has-url");
    }
    if (node.storageLocation) {
        flags.push("has-storage");
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
    return {
        label,
        tooltip: tt,
        iconPath: new ThemeIcon(
            "package",
            new ThemeColor("databricks.unityCatalog.volume")
        ),
        contextValue: flags.join("."),
        collapsibleState: TreeItemCollapsibleState.None,
        url: exploreUrl,
        copyText: node.fullName,
        storageLocation: node.storageLocation,
    };
}

function renderFunction(
    node: Extract<UnityCatalogTreeNode, {kind: "function"}>,
    exploreUrl: string | undefined
): UnityCatalogTreeItem {
    return {
        label: node.name,
        tooltip: node.fullName,
        iconPath: new ThemeIcon(
            "symbol-function",
            new ThemeColor("databricks.unityCatalog.function")
        ),
        contextValue: exploreUrl
            ? "unityCatalog.function.has-url"
            : "unityCatalog.function",
        collapsibleState: TreeItemCollapsibleState.None,
        url: exploreUrl,
        copyText: node.fullName,
    };
}

function renderRegisteredModel(
    node: Extract<UnityCatalogTreeNode, {kind: "registeredModel"}>,
    exploreUrl: string | undefined
): UnityCatalogTreeItem {
    const tt = new MarkdownString(`**${node.fullName}**`);
    if (node.owner) {
        tt.appendMarkdown(`\n\n*Owner:* ${node.owner}`);
    }
    if (node.comment) {
        tt.appendMarkdown(`\n\n${node.comment}`);
    }
    if (node.aliases && node.aliases.length > 0) {
        const aliasList = node.aliases
            .filter((a) => a.alias_name)
            .map((a) =>
                a.version_num !== undefined
                    ? `${a.alias_name} → v${a.version_num}`
                    : a.alias_name!
            )
            .join(", ");
        if (aliasList) {
            tt.appendMarkdown(`\n\n*Aliases:* ${aliasList}`);
        }
    }
    const cAt = formatTs(node.createdAt);
    const uAt = formatTs(node.updatedAt);
    if (cAt) {
        tt.appendMarkdown(`\n\n*Created:* ${cAt}`);
    }
    if (uAt) {
        tt.appendMarkdown(`  *Updated:* ${uAt}`);
    }
    return {
        label: node.name,
        tooltip: tt,
        iconPath: new ThemeIcon(
            "beaker",
            new ThemeColor("databricks.unityCatalog.registeredModel")
        ),
        contextValue: exploreUrl
            ? "unityCatalog.registeredModel.has-url"
            : "unityCatalog.registeredModel",
        collapsibleState: TreeItemCollapsibleState.Collapsed,
        url: exploreUrl,
        copyText: node.fullName,
    };
}

function renderModelVersion(
    node: Extract<UnityCatalogTreeNode, {kind: "modelVersion"}>,
    exploreUrl: string | undefined
): UnityCatalogTreeItem {
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
    return {
        label: `v${node.version}`,
        description:
            node.status && node.status !== "READY" ? node.status : undefined,
        tooltip: tt,
        iconPath: new ThemeIcon(
            "tag",
            new ThemeColor("databricks.unityCatalog.modelVersion")
        ),
        contextValue: exploreUrl
            ? "unityCatalog.modelVersion.has-url"
            : "unityCatalog.modelVersion",
        collapsibleState: TreeItemCollapsibleState.None,
        url: exploreUrl,
        copyText: node.fullName,
    };
}

function renderColumn(
    node: Extract<UnityCatalogTreeNode, {kind: "column"}>
): UnityCatalogTreeItem {
    const icon =
        node.nullable === false
            ? new ThemeIcon(
                  "symbol-key",
                  new ThemeColor("databricks.unityCatalog.columnKey")
              )
            : new ThemeIcon(
                  "symbol-field",
                  new ThemeColor("databricks.unityCatalog.column")
              );
    const typeLabel = node.typeText ?? node.typeName ?? "";
    const tt = new MarkdownString(`**${node.name}** \`${typeLabel}\``);
    if (node.nullable === false) {
        tt.appendMarkdown(" *(not null)*");
    }
    if (node.comment) {
        tt.appendMarkdown(`\n\n${node.comment}`);
    }
    return {
        label: node.name,
        description: typeLabel,
        tooltip: tt,
        iconPath: icon,
        contextValue: "unityCatalog.column",
        collapsibleState: TreeItemCollapsibleState.None,
        copyText: node.name,
    };
}
