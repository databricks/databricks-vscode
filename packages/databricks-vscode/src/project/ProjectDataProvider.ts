import {
    Disposable,
    Event,
    EventEmitter,
    TreeDataProvider,
    TreeItem,
} from "vscode";
import {ProjectModel, Resource} from "./ProjectModel";

export class ProjectDataProvider
    implements TreeDataProvider<Resource>, Disposable
{
    private _onDidChangeTreeData: EventEmitter<void> = new EventEmitter<void>();
    readonly onDidChangeTreeData: Event<void> = this._onDidChangeTreeData.event;

    private disposables: Array<Disposable>;

    constructor(private projectModel: ProjectModel) {
        this.disposables = [
            projectModel.onDidChange(() => {
                this._onDidChangeTreeData.fire();
            }),
        ];
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }

    getTreeItem(element: Resource): TreeItem | Thenable<TreeItem> {
        return element.getTreeItem();
    }

    async getChildren(element?: Resource | undefined): Promise<Resource[]> {
        if (!element) {
            return await this.projectModel.resources;
        } else {
            return element.getChildren();
        }
    }
}
