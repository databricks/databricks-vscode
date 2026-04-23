const vscode =
    typeof acquireVsCodeApi !== "undefined" ? acquireVsCodeApi() : null;

/* ── SVG icon paths per kind ── */
const KIND_SVGS = {
    catalog:
        '<circle cx="12" cy="4" r="2"/><path d="M4 8c0-1.1 3.6-2 8-2s8 .9 8 2v3c0 1.1-3.6 2-8 2s-8-.9-8-2V8z"/><path d="M4 11v5c0 1.1 3.6 2 8 2s8-.9 8-2v-5"/>',
    schema: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    table: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
    volume: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4.03 3-9 3S3 13.66 3 12"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>',
    function:
        '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
    registeredModel:
        '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
    modelVersion:
        '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
};

const COPY_ICON_SVG =
    `<svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;` +
    `stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0">` +
    `<rect x="9" y="9" width="13" height="13" rx="2"/>` +
    `<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

/* ── DOM helpers ── */

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? "";
}

function show(id, visible) {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? "" : "none";
}

function formatDate(ts) {
    if (!ts) return "";
    return new Date(ts).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function addProp(list, label, value, opts = {}) {
    if (value == null || value === "") return;
    const row = document.createElement("div");
    row.className = "prop-row";

    const labelEl = document.createElement("span");
    labelEl.className = "prop-label";
    labelEl.textContent = label;

    const valueEl = document.createElement("span");
    valueEl.className = "prop-value" + (opts.isPath ? " is-path" : "");
    valueEl.textContent = String(value);

    row.appendChild(labelEl);
    row.appendChild(valueEl);
    list.appendChild(row);
}

function makeTypeChip(text) {
    if (!text) return document.createTextNode("");
    const chip = document.createElement("span");
    chip.className = "type-chip";
    chip.textContent = text.toUpperCase();
    return chip;
}

/* ── Table builders ── */

function buildColumns(rows) {
    const tbody = document.getElementById("columns-body");
    tbody.innerHTML = "";
    setText("columns-count", String(rows.length));
    rows.forEach((col, i) => {
        const tr = document.createElement("tr");

        const tdIdx = document.createElement("td");
        tdIdx.style.color = "var(--vscode-descriptionForeground)";
        tdIdx.style.fontSize = "0.8em";
        tdIdx.style.paddingRight = "4px";
        tdIdx.style.width = "28px";
        tdIdx.textContent = String(i + 1);

        const tdName = document.createElement("td");
        tdName.className = "col-name";
        tdName.textContent = col.name ?? "";

        const tdType = document.createElement("td");
        tdType.style.whiteSpace = "nowrap";
        tdType.appendChild(makeTypeChip(col.typeText ?? col.typeName ?? ""));

        const tdComment = document.createElement("td");
        tdComment.className = "col-comment";
        tdComment.textContent = col.comment ?? "";

        tr.append(tdIdx, tdName, tdType, tdComment);
        tbody.appendChild(tr);
    });
}

function buildParams(rows) {
    const tbody = document.getElementById("params-body");
    tbody.innerHTML = "";
    setText("params-count", String(rows.length));
    for (const param of rows) {
        const tr = document.createElement("tr");

        const tdName = document.createElement("td");
        tdName.className = "col-name";
        tdName.textContent = param.name ?? "";

        const tdType = document.createElement("td");
        tdType.appendChild(
            makeTypeChip(param.typeText ?? param.typeName ?? "")
        );

        const tdDefault = document.createElement("td");
        if (param.parameterDefault) {
            const chip = document.createElement("span");
            chip.className = "type-chip";
            chip.style.color = "var(--vscode-descriptionForeground)";
            chip.textContent = param.parameterDefault;
            tdDefault.appendChild(chip);
        }

        const tdComment = document.createElement("td");
        tdComment.className = "col-comment";
        tdComment.textContent = param.comment ?? "";

        tr.append(tdName, tdType, tdDefault, tdComment);
        tbody.appendChild(tr);
    }
}

/* ── Markdown ── */

const md = window.markdownit({html: false, linkify: true, typographer: false});

const defaultLinkOpen =
    md.renderer.rules.link_open ||
    ((tokens, idx, options, _env, self) =>
        self.renderToken(tokens, idx, options));

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const href = tokens[idx].attrGet("href") ?? "";
    if (/^https?:\/\//i.test(href)) {
        tokens[idx].attrSet("target", "_blank");
        tokens[idx].attrSet("rel", "noopener noreferrer");
    } else {
        tokens[idx].attrSet("href", "#");
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
};

function renderMarkdown(text) {
    return text ? md.render(text) : "";
}

/* ── Search / tabs ── */

function filterContent(query) {
    const q = query.toLowerCase().trim();
    const panel = document.querySelector(".tab-panel.active");
    if (!panel) return;

    function filterSection(container, itemSelector) {
        let visible = 0;
        container.querySelectorAll(itemSelector).forEach((el) => {
            const match = !q || el.textContent.toLowerCase().includes(q);
            el.style.display = match ? "" : "none";
            if (match) visible++;
        });
        let empty = container.querySelector(".search-empty");
        if (!empty) {
            empty = document.createElement("div");
            empty.className = "search-empty";
            container.appendChild(empty);
        }
        empty.textContent = `No results for "${query}"`;
        empty.style.display = visible === 0 && q ? "" : "none";
    }

    panel
        .querySelectorAll(".table-wrap")
        .forEach((wrap) => filterSection(wrap, "tbody tr"));
    panel
        .querySelectorAll(".props-list")
        .forEach((list) => filterSection(list, ".prop-row"));

    panel.querySelectorAll(".tag-chip, .constraint-chip").forEach((chip) => {
        chip.style.display =
            !q || chip.textContent.toLowerCase().includes(q) ? "" : "none";
    });
}

function activateTab(tabId) {
    document
        .querySelectorAll(".tab-btn")
        .forEach((btn) =>
            btn.classList.toggle("active", btn.dataset.tab === tabId)
        );
    document
        .querySelectorAll(".tab-panel")
        .forEach((panel) =>
            panel.classList.toggle("active", panel.id === "tab-" + tabId)
        );

    const searchBar = document.getElementById("search-bar");
    if (searchBar)
        searchBar.style.display = tabId === "definition" ? "none" : "";

    const searchInput = document.getElementById("search-input");
    const searchClear = document.getElementById("search-clear");
    if (searchInput) searchInput.value = "";
    if (searchClear) searchClear.style.display = "none";

    if (searchInput) filterContent(searchInput.value);
}

function showTabBtn(tabId, visible) {
    const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (btn) btn.style.display = visible ? "" : "none";
}

function initTabs() {
    document
        .querySelectorAll(".tab-btn")
        .forEach((btn) =>
            btn.addEventListener("click", () => activateTab(btn.dataset.tab))
        );

    const input = document.getElementById("search-input");
    const clearBtn = document.getElementById("search-clear");

    input.addEventListener("input", () => {
        clearBtn.style.display = input.value ? "" : "none";
        filterContent(input.value);
    });

    clearBtn.addEventListener("click", () => {
        input.value = "";
        clearBtn.style.display = "none";
        filterContent("");
        input.focus();
    });
}

/* ── renderNode helpers ── */

function getIconUri(kind, name) {
    const uris = window.UC_ICON_URIS;
    if (!uris) return null;
    const theme = document.body.classList.contains("vscode-light") ? "light" : "dark";
    const themeUris = uris[theme];
    if (!themeUris) return null;
    if (kind === "catalog") {
        const key = "catalog-" + name;
        return themeUris[key] ?? themeUris["catalog"] ?? null;
    }
    return themeUris[kind] ?? null;
}

function renderHeader(data) {
    const img = document.getElementById("header-icon");
    const svg = document.getElementById("header-svg");
    const wrap = document.getElementById("header-icon-wrap");
    const uri = getIconUri(data.kind, data.name);
    if (uri) {
        img.src = uri;
        img.style.display = "";
        svg.style.display = "none";
        wrap.classList.add("has-custom");
    } else {
        svg.innerHTML = KIND_SVGS[data.kind] ?? "";
        svg.style.display = "";
        img.style.display = "none";
        wrap.classList.remove("has-custom");
    }

    setText("header-name", data.name ?? data.fullName ?? "");
    setText("header-kind-badge", data.kind);

    const fullName = data.fullName ?? "";
    const lastDot = fullName.lastIndexOf(".");
    const breadcrumb = lastDot > 0 ? fullName.slice(0, lastDot) : "";
    const breadcrumbEl = document.getElementById("header-breadcrumb");
    breadcrumbEl.textContent = breadcrumb;
    breadcrumbEl.style.display = breadcrumb ? "" : "none";

    const statusBadge = document.getElementById("header-status-badge");
    statusBadge.textContent = data.status ?? "";
    statusBadge.style.display = data.status ? "" : "none";
}

function addCatalogProps(list, data) {
    addProp(list, "Full name", data.fullName, {isPath: true});
    addProp(list, "Owner", data.owner);
    addProp(list, "Type", data.catalogType);
    addProp(list, "Isolation mode", data.isolationMode);
    addProp(list, "Storage location", data.storageLocation, {isPath: true});
    addProp(list, "Connection", data.connectionName);
    addProp(list, "Provider", data.providerName);
    addProp(list, "Share", data.shareName);
    addProp(list, "Created by", data.createdBy);
    addProp(list, "Created at", formatDate(data.createdAt));
    addProp(list, "Updated by", data.updatedBy);
    addProp(list, "Updated at", formatDate(data.updatedAt));
}

function addSchemaProps(list, data) {
    addProp(list, "Full name", data.fullName, {isPath: true});
    addProp(list, "Owner", data.owner);
    addProp(list, "Storage location", data.storageLocation, {isPath: true});
    addProp(list, "Created by", data.createdBy);
    addProp(list, "Created at", formatDate(data.createdAt));
    addProp(list, "Updated by", data.updatedBy);
    addProp(list, "Updated at", formatDate(data.updatedAt));
}

function addTableProps(list, data) {
    addProp(list, "Full name", data.fullName, {isPath: true});
    addProp(list, "Owner", data.owner);
    addProp(list, "Table type", data.tableType);
    addProp(list, "Format", data.dataSourceFormat);
    addProp(list, "Storage location", data.storageLocation, {isPath: true});
    addProp(list, "Created by", data.createdBy);
    addProp(list, "Created at", formatDate(data.createdAt));
    addProp(list, "Updated by", data.updatedBy);
    addProp(list, "Updated at", formatDate(data.updatedAt));
}

function addVolumeProps(list, data) {
    addProp(list, "Full name", data.fullName, {isPath: true});
    addProp(list, "Owner", data.owner);
    addProp(list, "Volume type", data.volumeType);
    addProp(list, "Storage location", data.storageLocation, {isPath: true});
    addProp(list, "Created by", data.createdBy);
    addProp(list, "Created at", formatDate(data.createdAt));
    addProp(list, "Updated by", data.updatedBy);
    addProp(list, "Updated at", formatDate(data.updatedAt));
}

function addFunctionProps(list, data) {
    addProp(list, "Full name", data.fullName, {isPath: true});
    addProp(list, "Owner", data.owner);
    addProp(list, "Return type", data.fullDataType);
    addProp(list, "Routine body", data.routineBody);
    addProp(list, "Language", data.externalLanguage);
    addProp(
        list,
        "Deterministic",
        data.isDeterministic != null
            ? data.isDeterministic
                ? "Yes"
                : "No"
            : undefined
    );
    addProp(list, "Created by", data.createdBy);
    addProp(list, "Created at", formatDate(data.createdAt));
    addProp(list, "Updated by", data.updatedBy);
    addProp(list, "Updated at", formatDate(data.updatedAt));
}

function addModelProps(list, data) {
    addProp(list, "Full name", data.fullName, {isPath: true});
    addProp(list, "Owner", data.owner);
    addProp(list, "Storage location", data.storageLocation, {isPath: true});
    if (data.aliases && data.aliases.length > 0) {
        addProp(
            list,
            "Aliases",
            data.aliases
                .map(
                    (a) =>
                        `${a.alias_name ?? ""}${
                            a.version_num != null
                                ? " (v" + a.version_num + ")"
                                : ""
                        }`
                )
                .join(", ")
        );
    }
    addProp(list, "Created at", formatDate(data.createdAt));
    addProp(list, "Updated at", formatDate(data.updatedAt));
}

function addModelVersionProps(list, data) {
    addProp(list, "Full name", data.fullName, {isPath: true});
    addProp(list, "Version", data.version);
    addProp(list, "Storage location", data.storageLocation, {isPath: true});
    addProp(list, "Created by", data.createdBy);
    addProp(list, "Created at", formatDate(data.createdAt));
}

const KIND_PROPS = {
    catalog: addCatalogProps,
    schema: addSchemaProps,
    table: addTableProps,
    volume: addVolumeProps,
    function: addFunctionProps,
    registeredModel: addModelProps,
    modelVersion: addModelVersionProps,
};

function renderKindProps(list, data) {
    KIND_PROPS[data.kind]?.(list, data);

    const hasColumns = data.kind === "table" && data.columns?.length > 0;
    if (hasColumns) buildColumns(data.columns);
    show("section-columns", hasColumns);

    const hasParams = data.kind === "function" && data.inputParams?.length > 0;
    if (hasParams) buildParams(data.inputParams);
    show("section-params", hasParams);
}

function renderComment(data) {
    show("section-comment", !!data.comment);
    if (data.comment) {
        document.getElementById("comment-text").innerHTML = renderMarkdown(
            data.comment
        );
    }
}

function renderDefinition(data) {
    const definition =
        data.kind === "table"
            ? data.viewDefinition
            : data.kind === "function"
              ? data.routineDefinition
              : undefined;

    if (definition) {
        setText(
            "sql-title",
            data.kind === "function" ? "Routine Definition" : "View Definition"
        );
        setText("sql-body", definition);
        document.getElementById("sql-copy-btn").onclick = () => {
            if (!vscode) return;
            vscode.postMessage({command: "copyText", text: definition});
            const btn = document.getElementById("sql-copy-btn");
            btn.textContent = "Copied!";
            setTimeout(() => {
                btn.textContent = "Copy";
            }, 1500);
        };
    }
    showTabBtn("definition", !!definition);
}

function renderActions(data) {
    const copyBtn = document.getElementById("btn-copy");
    copyBtn.onclick = () => {
        if (!vscode) return;
        vscode.postMessage({
            command: "copyText",
            text: data.fullName ?? data.name ?? "",
        });
        copyBtn.textContent = "Copied!";
        setTimeout(() => {
            copyBtn.innerHTML = COPY_ICON_SVG + "Copy full name";
        }, 1500);
    };

    const linkContainer = document.getElementById("link-external");
    linkContainer.innerHTML = "";
    if (data.exploreUrl) {
        const a = document.createElement("a");
        a.className = "action-btn";
        a.href = data.exploreUrl;
        a.innerHTML =
            `<svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>` +
            `<polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>Open in Databricks`;
        linkContainer.appendChild(a);
    }
}

function resetForNewNode() {
    show("section-tags", false);
    show("section-extra-props", false);
    show("section-constraints", false);
    show("section-children", false);
    showTabBtn("details", true);
    showTabBtn("permissions", false);
    showTabBtn("quality", false);

    const searchInput = document.getElementById("search-input");
    const searchClear = document.getElementById("search-clear");
    if (searchInput) searchInput.value = "";
    if (searchClear) searchClear.style.display = "none";

    activateTab("overview");
}

/* ── renderEnrichments helpers ── */

function renderTags(tags) {
    if (!tags?.length) return;
    const body = document.getElementById("tags-body");
    body.textContent = "";
    for (const tag of tags) {
        const chip = document.createElement("span");
        chip.className = "tag-chip";

        const keySpan = document.createElement("span");
        keySpan.className = "tag-chip-key";
        keySpan.textContent = tag.key;
        chip.appendChild(keySpan);

        if (tag.value) {
            const valSpan = document.createElement("span");
            valSpan.className = "tag-chip-value";
            valSpan.textContent = tag.value;
            chip.append(document.createTextNode(": "), valSpan);
        }
        body.appendChild(chip);
    }
    show("section-tags", true);
}

function renderPermissions(permissions) {
    if (!permissions?.length) return;
    const tbody = document.getElementById("permissions-body");
    tbody.textContent = "";
    setText("permissions-count", String(permissions.length));
    for (const perm of permissions) {
        const tr = document.createElement("tr");
        const tdPrincipal = document.createElement("td");
        tdPrincipal.className = "col-name";
        tdPrincipal.textContent = perm.principal;
        const tdPrivs = document.createElement("td");
        tdPrivs.textContent = perm.privileges.join(", ");
        tr.append(tdPrincipal, tdPrivs);
        tbody.appendChild(tr);
    }
    showTabBtn("permissions", true);
}

function renderMonitor(monitor) {
    if (!monitor) return;
    const body = document.getElementById("monitor-body");
    body.textContent = "";
    const card = document.createElement("div");
    card.className = "monitor-card";

    const statusRow = document.createElement("div");
    statusRow.className = "monitor-status-row";

    const dot = document.createElement("span");
    dot.className = "monitor-status-dot";
    const status = monitor.status ?? "";
    dot.classList.add(
        status.includes("ACTIVE")
            ? "active"
            : status.includes("ERROR") || status.includes("FAILED")
              ? "error"
              : "pending"
    );

    const statusText = document.createElement("span");
    statusText.textContent = status.replace("MONITOR_STATUS_", "");
    statusRow.append(dot, statusText);
    card.appendChild(statusRow);

    const propsList = document.createElement("div");
    propsList.className = "props-list";
    propsList.style.borderRadius = "0";
    propsList.style.border = "none";
    addProp(propsList, "Schedule", monitor.schedule);
    addProp(propsList, "Drift metrics", monitor.driftMetricsTable, {
        isPath: true,
    });
    addProp(propsList, "Profile metrics", monitor.profileMetricsTable, {
        isPath: true,
    });
    addProp(propsList, "Failure", monitor.failureMsg);
    if (propsList.children.length > 0) card.appendChild(propsList);

    body.appendChild(card);
    showTabBtn("quality", true);
}

function renderConstraints(constraints) {
    if (!constraints?.length) return;
    const body = document.getElementById("constraints-body");
    body.textContent = "";
    for (const constraint of constraints) {
        const chip = document.createElement("span");
        chip.className = "constraint-chip";

        const typeLabel = document.createElement("span");
        typeLabel.className = "constraint-chip-label";
        typeLabel.textContent = constraint.type.toUpperCase();
        chip.appendChild(typeLabel);
        chip.appendChild(
            document.createTextNode(constraint.columns.join(", "))
        );

        if (constraint.type === "fk" && constraint.parentTable) {
            chip.appendChild(
                document.createTextNode(" → " + constraint.parentTable)
            );
            if (constraint.parentColumns?.length) {
                chip.appendChild(
                    document.createTextNode(
                        "." + constraint.parentColumns.join(", ")
                    )
                );
            }
        }
        body.appendChild(chip);
    }
    show("section-constraints", true);
    showTabBtn("details", true);
}

function renderChildren(enrichments) {
    const children = enrichments.children;
    if (!children?.length) return;

    const hasSubLabel = children.some((c) => c.subLabel);
    const hasOwner = children.some((c) => c.owner);
    const hasStatus = children.some((c) => c.status);
    const hasCreatedBy = children.some((c) => c.createdBy);
    const hasCreatedAt = children.some((c) => c.createdAt);

    const thead = document.getElementById("children-thead");
    thead.innerHTML = "";
    const headerRow = document.createElement("tr");
    const headers = ["Name"];
    if (hasSubLabel) headers.push("Type");
    if (hasOwner) headers.push("Owner");
    if (hasStatus) headers.push("Status");
    if (hasCreatedBy) headers.push("Created By");
    if (hasCreatedAt) headers.push("Created At");
    headers.forEach((h) => {
        const th = document.createElement("th");
        th.textContent = h;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    const tbody = document.getElementById("children-body");
    tbody.innerHTML = "";
    setText("children-title", enrichments.childrenTitle ?? "Contents");
    setText("children-count", String(children.length));

    for (const child of children) {
        const tr = document.createElement("tr");

        const tdName = document.createElement("td");
        tdName.className = "col-name";
        tdName.textContent = child.label;
        tr.appendChild(tdName);

        if (hasSubLabel) {
            const td = document.createElement("td");
            td.style.whiteSpace = "nowrap";
            if (child.subLabel) td.appendChild(makeTypeChip(child.subLabel));
            tr.appendChild(td);
        }
        if (hasOwner) {
            const td = document.createElement("td");
            td.textContent = child.owner ?? "";
            tr.appendChild(td);
        }
        if (hasStatus) {
            const td = document.createElement("td");
            td.textContent = child.status ?? "";
            tr.appendChild(td);
        }
        if (hasCreatedBy) {
            const td = document.createElement("td");
            td.textContent = child.createdBy ?? "";
            tr.appendChild(td);
        }
        if (hasCreatedAt) {
            const td = document.createElement("td");
            td.textContent = child.createdAt ? formatDate(child.createdAt) : "";
            tr.appendChild(td);
        }

        tbody.appendChild(tr);
    }

    show("section-children", true);
}

function renderCustomProperties(enrichments) {
    const extraList = document.getElementById("extra-props-list");
    if (!extraList) return;
    extraList.innerHTML = "";
    let hasExtra = false;

    if (enrichments.customProperties) {
        for (const [key, value] of Object.entries(
            enrichments.customProperties
        )) {
            addProp(extraList, key, value);
            hasExtra = true;
        }
    }
    if (enrichments.rowFilter) {
        addProp(extraList, "Row filter", enrichments.rowFilter.functionName);
        hasExtra = true;
    }
    if (enrichments.pipelineId) {
        addProp(extraList, "Pipeline", enrichments.pipelineId);
        hasExtra = true;
    }
    if (hasExtra) {
        show("section-extra-props", true);
        showTabBtn("details", true);
    }
}

/* ── Page controller ── */

const page = {
    showLoading() {
        document.body.className = "loading";
    },

    renderNode(data) {
        document.body.className = "content";

        const KIND_LABEL = {
            registeredModel: "model",
            modelVersion: "model version",
        };
        const titleEl = document.getElementById("section-properties-title");
        if (titleEl) {
            titleEl.textContent = `About this ${KIND_LABEL[data.kind] ?? data.kind}`;
        }

        renderHeader(data);

        const propsList = document.getElementById("props-list");
        propsList.innerHTML = "";
        renderKindProps(propsList, data);

        renderComment(data);
        renderDefinition(data);
        resetForNewNode();
        renderActions(data);
    },

    renderEnrichments(enrichments) {
        if (enrichments.columns?.length) {
            buildColumns(enrichments.columns);
            show("section-columns", true);
        }
        renderTags(enrichments.tags);
        renderPermissions(enrichments.permissions);
        renderMonitor(enrichments.monitor);
        renderConstraints(enrichments.constraints);
        renderCustomProperties(enrichments);
        renderChildren(enrichments);
    },
};

document.addEventListener("DOMContentLoaded", initTabs);

window.addEventListener("message", (e) => {
    page[e.data.fn]?.(...e.data.args);
});
