import {
    Disposable,
    EventEmitter,
    Event,
    TreeItem,
    TreeItemCollapsibleState,
    ThemeIcon,
    workspace,
    Uri,
    window,
} from "vscode";
import {CliWrapper} from "../cli/CliWrapper";

export class ProjectModel implements Disposable {
    private _onDidChange: EventEmitter<void> = new EventEmitter<void>();
    readonly onDidChange: Event<void> = this._onDidChange.event;
    private disposables: Disposable[] = [];

    public json: any = undefined;
    public overlay: any = undefined;

    private dirty = true;

    constructor(private cli: CliWrapper) {}

    dispose() {
        this.disposables.forEach((e) => e.dispose());
    }

    private async refresh() {
        this.dirty = false;
        this.json = undefined;
        this.overlay = undefined;
        try {
            this.json = await this.cli.validateBundle();
            // TODO: interpolate environment
            const tfStateFile = Uri.joinPath(
                workspace.workspaceFolders![0].uri,
                ".databricks/bundle/development/terraform/terraform.tfstate"
            );

            this.overlay = JSON.parse(
                await (await workspace.fs.readFile(tfStateFile)).toString()
            );
        } catch (e) {
            // TODO
            // eslint-disable-next-line no-console
            console.error(e);
        }
    }

    async scheduleRefresh() {
        this.dirty = true;
        this._onDidChange.fire();
    }

    async run(name: string) {
        const terminal = window.createTerminal("bricks bundle run");
        this.disposables.push(terminal);
        terminal.show();

        terminal.sendText(
            `bricks bundle run ${name}; ; echo "Press any key to close the terminal and continue ..."; read; exit`
        );

        return await new Promise<boolean>((resolve) => {
            this.disposables.push(
                window.onDidCloseTerminal((t) => {
                    if (t === terminal) {
                        resolve(true);
                        this.dispose();
                    }
                })
            );
        });
    }

    async deploy() {
        const terminal = window.createTerminal("bricks bundle deploy");
        this.disposables.push(terminal);
        terminal.show();

        terminal.sendText(
            `bricks bundle deploy; ; echo "Press any key to close the terminal and continue ..."; read; exit`
        );

        await new Promise<boolean>((resolve) => {
            this.disposables.push(
                window.onDidCloseTerminal((t) => {
                    if (t === terminal) {
                        resolve(true);
                        this.dispose();
                    }
                })
            );
        });

        await this.scheduleRefresh();
    }

    watchFiles() {
        const watcher = workspace.createFileSystemWatcher("**/*.{yaml,yml}");
        this.disposables.push(
            watcher,
            watcher.onDidChange(() => {
                this.scheduleRefresh();
            })
        );
    }

    get resources(): Promise<Resource[]> {
        return (async () => {
            if (this.dirty) {
                await this.refresh();
            }

            if (!this.json) {
                return [];
            }

            const root = this.json?.resources;
            if (root) {
                const resources: Resource[] = [];

                resources.push(
                    new GroupResource(
                        this,
                        "Delta Live Tables",
                        root.pipelines || {}
                    ),
                    new GroupResource(this, "Workflows", root.jobs || {})
                );

                return resources;
            } else {
                return [
                    new GroupResource(this, "Delta Live Tables", {}),
                    new GroupResource(this, "Workflows", {}),
                ];
            }
        })();
    }

    get remoteFilePath(): string {
        return this.json?.workspace?.file_path?.workspace || "";
    }
}

export interface Resource {
    getChildren(): Resource[];
    getTreeItem(): TreeItem;
}

export class GroupResource implements Resource {
    constructor(
        private model: ProjectModel,
        readonly type: "Workflows" | "Delta Live Tables" | "generic",
        private node: any
    ) {}

    getChildren(): Resource[] {
        const items = Object.keys(this.node).map((name: any) => {
            switch (this.type) {
                case "Workflows":
                    return new WorkflowResource(
                        this.model,
                        name,
                        this.node[name]
                    );
                case "Delta Live Tables":
                    return new Pipeline(this.model, name, this.node[name]);

                default:
                    return new ResourceProperty(name, this.node[name]);
            }
        });

        return items;
    }

    getTreeItem(): TreeItem {
        return new TreeItem(this.type, TreeItemCollapsibleState.Expanded);
    }
}

export class WorkflowResource implements Resource {
    readonly url: string | undefined;
    readonly id: string | undefined;

    constructor(
        private model: ProjectModel,
        readonly name: string,
        private node: any
    ) {
        const overlay = this.model.overlay?.resources?.filter((r: any) => {
            return r.type === "databricks_job" && r.name === this.name;
        });
        this.url = overlay && overlay[0]?.instances[0]?.attributes?.url;
        this.id = overlay && overlay[0]?.instances[0]?.attributes?.id;
    }

    getChildren(): Resource[] {
        const items: Resource[] = [];
        for (const key of Object.keys(this.node)) {
            if (key === "tasks") {
                items.push(new WorkflowTasks(this.model, this.node[key]));
            } else if (key === "name") {
                continue;
            } else {
                items.push(new ResourceProperty(key, this.node[key]));
            }
        }

        return items;
    }

    getTreeItem(): TreeItem {
        return {
            label: this.name,
            iconPath: new ThemeIcon("checklist"),
            collapsibleState: TreeItemCollapsibleState.Expanded,
            contextValue: "workflow",
        };
    }
}

export class WorkflowTasks implements Resource {
    constructor(private model: ProjectModel, private node: any) {}

    getChildren(): Resource[] {
        const tasks: Resource[] = [];

        for (const task of this.node) {
            tasks.push(new WorkflowTask(this.model, task));
        }
        return tasks;
    }

    getTreeItem(): TreeItem {
        return {
            label: "Tasks",
            iconPath: new ThemeIcon("tasklist"),
            collapsibleState: TreeItemCollapsibleState.Expanded,
        };
    }
}

export class WorkflowTask implements Resource {
    constructor(private model: ProjectModel, private node: any) {}

    getChildren(): Resource[] {
        const items: Resource[] = [];

        for (const name of Object.keys(this.node)) {
            if (name === "task_key") {
                continue;
            } else if (name === "new_cluster") {
                items.push(
                    new ResourceProperty(
                        name,
                        this.node[name],
                        "text",
                        new ThemeIcon("server")
                    )
                );
            } else if (name === "notebook_task") {
                items.push(
                    new Notebook(this.model, this.node[name].notebook_path)
                );
                if (this.node[name].base_parameters) {
                    items.push(
                        new ResourceProperty(
                            "Parameters",
                            this.node[name].base_parameters,
                            "text"
                        )
                    );
                }
            } else {
                items.push(new ResourceProperty(name, this.node[name]));
            }
        }

        return items;
    }

    getTreeItem(): TreeItem {
        return {
            label: this.node.task_key,
            iconPath: new ThemeIcon("tasklist"),
            collapsibleState: TreeItemCollapsibleState.Collapsed,
        };
    }
}

export class Pipeline implements Resource {
    readonly url: string | undefined;
    readonly id: string | undefined;

    constructor(
        private model: ProjectModel,
        readonly name: string,
        private node: any
    ) {
        const overlay = this.model.overlay?.resources?.filter((r: any) => {
            return r.type === "databricks_pipeline" && r.name === this.name;
        });

        this.url = overlay && overlay[0]?.instances[0]?.attributes?.url;
        this.id = overlay && overlay[0]?.instances[0]?.attributes?.id;
    }

    getChildren(): Resource[] {
        const items = Object.keys(this.node).map((name: any) => {
            if (name === "clusters") {
                // TODO can we have more than one cluster?
                return new PipelineCluster(this.node[name][0]);
            } else if (name === "libraries") {
                return new PipelineLibaries(this.model, this.node[name]);
            } else {
                return new ResourceProperty(name, this.node[name]);
            }
        });

        // if (this.url) {
        //     items.push(new ResourceProperty("URL", this.url, "url"));
        // }
        // if (this.id) {
        //     items.push(new ResourceProperty("ID", this.id));
        // }

        return items;
    }

    getTreeItem(): TreeItem {
        return {
            label: this.name,
            iconPath: new ThemeIcon("checklist"),
            collapsibleState: TreeItemCollapsibleState.Expanded,
            contextValue: "pipeline",
        };
    }
}

export class PipelineCluster implements Resource {
    constructor(private node: any) {}

    getChildren(): Resource[] {
        return Object.keys(this.node).map((name: any) => {
            return new ResourceProperty(name, this.node[name]);
        });
    }
    getTreeItem(): TreeItem {
        return {
            label: "Cluster",
            iconPath: new ThemeIcon("server"),
            collapsibleState: TreeItemCollapsibleState.Collapsed,
        };
    }
}

export class PipelineLibaries implements Resource {
    constructor(private model: ProjectModel, private node: any) {}

    getChildren(): Resource[] {
        const libraries: Resource[] = [];

        for (const lib of this.node) {
            if (lib.notebook) {
                libraries.push(new Notebook(this.model, lib.notebook.path));
            }
        }
        return libraries;
    }

    getTreeItem(): TreeItem {
        return {
            label: "Libaries",
            iconPath: new ThemeIcon("library"),
            collapsibleState: TreeItemCollapsibleState.Expanded,
        };
    }
}

export class Notebook implements Resource {
    readonly localPath: string | undefined;

    constructor(private model: ProjectModel, private path: string) {
        this.localPath = this.path.split(this.model.remoteFilePath).pop();
        if (this.localPath) {
            this.localPath = this.localPath.replace(/(\.py)?$/, ".py");
        }
    }

    getChildren(): Resource[] {
        return [];
    }

    getTreeItem(): TreeItem {
        return {
            label: "Notebook",
            description: this.localPath || this.path,
            iconPath: new ThemeIcon("notebook"),
            collapsibleState: TreeItemCollapsibleState.None,
            contextValue: "notebook",
        };
    }
}

export class ResourceProperty implements Resource {
    readonly url: string | undefined;

    constructor(
        private name: string,
        private value: any,
        private type: "text" | "url" = "text",
        private icon?: ThemeIcon
    ) {
        if (type === "url") {
            this.url = value;
        }
    }

    private hasChildren(): boolean {
        return Array.isArray(this.value) || typeof this.value === "object";
    }

    getChildren(): Resource[] {
        if (Array.isArray(this.value)) {
            return this.value.map((v: any, i: number) => {
                return new ResourceProperty(`[${i}]`, v);
            });
        }

        if (typeof this.value === "object") {
            return Object.keys(this.value).map((name: any) => {
                return new ResourceProperty(name, this.value[name]);
            });
        }

        return [];
    }

    getTreeItem(): TreeItem {
        return {
            label: `${this.name}`,
            description: this.hasChildren() ? undefined : this.value.toString(),
            iconPath: this.icon,
            contextValue: this.type === "url" ? "url" : undefined,
            collapsibleState: this.hasChildren()
                ? TreeItemCollapsibleState.Collapsed
                : TreeItemCollapsibleState.None,
        };
    }
}
