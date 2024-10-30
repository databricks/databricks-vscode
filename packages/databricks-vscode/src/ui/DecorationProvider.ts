import {
    Event,
    FileDecoration,
    FileDecorationProvider,
    ProviderResult,
    Uri,
    EventEmitter,
    Disposable,
} from "vscode";
import {BundleResourceExplorerTreeDataProvider} from "./bundle-resource-explorer/BundleResourceExplorerTreeDataProvider";
import {ConfigurationDataProvider} from "./configuration-view/ConfigurationDataProvider";

const SCHEME = "databricks-view-item";
export class TreeItemDecorationProvider implements FileDecorationProvider {
    private readonly disposables: Disposable[] = [];
    private onDidChangeFileDecorationsEmitter: EventEmitter<
        Uri | Uri[] | undefined
    > = new EventEmitter();
    onDidChangeFileDecorations: Event<Uri | Uri[] | undefined> =
        this.onDidChangeFileDecorationsEmitter.event;
    constructor(
        private readonly bundleResourceExplorerTreeDataProvider: BundleResourceExplorerTreeDataProvider,
        private readonly configrationViewTreeDataProvider: ConfigurationDataProvider
    ) {
        this.disposables.push(
            this.bundleResourceExplorerTreeDataProvider.onDidChangeTreeData(
                () => {
                    this.onDidChangeFileDecorationsEmitter.fire(undefined);
                }
            ),
            this.configrationViewTreeDataProvider.onDidChangeTreeData(() => {
                this.onDidChangeFileDecorationsEmitter.fire(undefined);
            })
        );
    }

    provideFileDecoration(uri: Uri): ProviderResult<FileDecoration> {
        if (uri.scheme !== SCHEME) {
            return undefined;
        }
        return uri.query
            ? (JSON.parse(uri.query) as FileDecoration)
            : undefined;
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}

export function asDecorationResourceUri(id: string, data: FileDecoration) {
    return Uri.from({
        scheme: SCHEME,
        path: id,
        query: JSON.stringify(data),
    });
}
