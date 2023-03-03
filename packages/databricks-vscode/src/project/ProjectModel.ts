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

    public json: any = {};
    public overlay: any = {};

    constructor(private cli: CliWrapper) {}

    dispose() {
        this.disposables.forEach((e) => e.dispose());
    }

    async refresh() {
        try {
            this.json = {};
            this.json = await this.cli.validateBundle();
            // TODO: interpolate environment
            const tfStateFile = Uri.joinPath(
                workspace.workspaceFolders![0].uri,
                ".databricks/bundle/development/terraform/terraform.tfstate"
            );

            this.overlay = {};
            this.overlay = JSON.parse(
                await (await workspace.fs.readFile(tfStateFile)).toString()
            );
        } catch (e) {
            // TODO
            // eslint-disable-next-line no-console
            console.error(e);
        }

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

        await this.refresh();
    }

    watchFiles() {
        const watcher = workspace.createFileSystemWatcher("**/*.{yaml,yml}");
        this.disposables.push(
            watcher,
            watcher.onDidChange(() => {
                this.refresh();
            })
        );
    }

    get resources(): Resource[] {
        const root = this.json.resources;
        if (root) {
            const resources: Resource[] = [];

            for (const key of Object.keys(root)) {
                if (key === "pipelines") {
                    resources.push(
                        new GroupResource(
                            this,
                            "Delta Live Tables",
                            root.pipelines
                        )
                    );
                } else if (key === "jobs") {
                    resources.push(
                        new GroupResource(this, "Workflows", root.jobs)
                    );
                } else {
                    resources.push(new ResourceProperty(key, root[key]));
                }
            }

            return resources;
        } else {
            return [];
        }
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
        readonly type:
            | "cluster"
            | "Workflows"
            | "notebook"
            | "Delta Live Tables"
            | "generic",
        private node: any
    ) {}

    getChildren(): Resource[] {
        const items = Object.keys(this.node).map((name: any) => {
            switch (this.type) {
                // case "cluster":
                // return new ClusterResource(
                //     this.model,
                //     name,
                //     this.node[name]
                // );
                case "Workflows":
                    return new WorkflowResource(
                        this.model,
                        name,
                        this.node[name]
                    );
                // case "notebook":
                //     return new NotebookResource(
                //         this.model,
                //         name,
                //         this.node[name]
                //     );
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
        const items = Object.keys(this.node).map((name: any) => {
            if (name === "tasks") {
                return new WorkflowTasks(this.model, this.node[name]);
            } else {
                return new ResourceProperty(name, this.node[name]);
            }
        });

        if (this.url) {
            items.push(new ResourceProperty("URL", this.url, "url"));
        }
        if (this.id) {
            items.push(new ResourceProperty("ID", this.id));
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

        // const items = Object.keys(this.node)
        //     .filter((name: any) => {
        //         return name !== "task_key";
        //     })
        //     .map((name: any) => {
        //         if (name === "new_cluster") {
        //             return new ResourceProperty(
        //                 name,
        //                 this.node[name],
        //                 "text",
        //                 new ThemeIcon("server")
        //             );
        //         } else if (name === "notebook_task") {
        //             return new ResourceProperty(
        //                 name,
        //                 this.node[name],
        //                 "text",
        //                 new ThemeIcon("notebook")
        //             );
        //         } else {
        //             return new ResourceProperty(name, this.node[name]);
        //         }
        //     });

        return items;
    }

    getTreeItem(): TreeItem {
        return {
            label: this.node.task_key,
            iconPath: new ThemeIcon("tasklist"),
            collapsibleState: TreeItemCollapsibleState.Expanded,
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

        if (this.url) {
            items.push(new ResourceProperty("URL", this.url, "url"));
        }
        if (this.id) {
            items.push(new ResourceProperty("ID", this.id));
        }

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
            this.localPath = this.localPath + ".py";
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
            return this.value.map((v: any) => {
                return new ResourceProperty(this.name, v);
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
