/**
 * A minimal stand-in for the `vscode` module, which exists only inside the
 * extension host. vitest aliases `vscode` to this file. It implements what the
 * code under test touches, and records calls in `host` for assertions. Grow it
 * as features need more; don't model behaviour the tests don't rely on.
 */
import path from "node:path";
import { Emitter } from "../platform/event";

type Callback = (...args: unknown[]) => unknown;

export const host = {
    commands: new Map<string, Callback>(),
    executed: [] as { command: string; args: unknown[] }[],
    treeDataProviders: new Map<string, unknown>(),
    errors: [] as { message: string; actions: string[] }[],
    /** What the next `showErrorMessage` resolves to; a promise holds the choice until the test resolves it. */
    nextErrorChoice: undefined as string | undefined | Promise<string | undefined>,
    opened: [] as string[],
    windowFocused: true,
    windowState: new Emitter<{ focused: boolean }>(),
    /** Every quick pick and input box created, newest last. */
    quickInputs: [] as FakeQuickInput[],
    statusBarItems: [] as FakeStatusBarItem[],
    warnings: [] as { message: string; actions: string[] }[],
    infos: [] as { message: string; actions: string[] }[],
    /** What the next `showWarningMessage` or `showInformationMessage` resolves to. */
    nextMessageChoice: undefined as string | undefined,
    progress: [] as { title?: string; cancellable?: boolean }[],
    /** Progress notifications whose task hasn't settled yet: 0 once every one has closed. */
    progressRunning: 0,
    /** Bumped by `reset()`: a progress started before it doesn't count after it. */
    progressGeneration: 0,
    /** Presses Cancel on every progress notification still running. */
    cancelProgress: () => {},
    /** Picks from `window.showQuickPick`; undefined dismisses it. */
    pickFrom: (_items: { label: string }[]): { label: string } | undefined => undefined,
    shownDocuments: [] as string[],
    clipboard: "",
    /** The workspace folders' paths. Fire `foldersChanged` after changing them. */
    folders: [] as string[],
    foldersChanged: new Emitter<void>(),
    /** What the next `showOpenDialog` resolves to. */
    nextOpenDialog: undefined as string | undefined,
    /** Every terminal created, newest last. Tests close them with `close()`. */
    terminals: [] as FakeTerminal[],
    /** Every diagnostic collection created. */
    diagnostics: [] as FakeDiagnosticCollection[],
    terminalOpened: new Emitter<FakeTerminal>(),
    terminalClosed: new Emitter<FakeTerminal>(),
    /** Fire it to simulate saving a document in an editor. */
    documentSaved: new Emitter<{ uri: Uri }>(),
    /** Every task executed, newest last. */
    tasks: [] as FakeTaskExecution[],
    /** Language model chat providers, by vendor. */
    chatProviders: new Map<string, unknown>(),
    /** Every `lm.selectChatModels` selector, oldest first. */
    chatModelSelections: [] as { vendor?: string }[],
    /** Tree views created with `createTreeView`, by view ID. */
    treeViews: new Map<string, FakeTreeView>(),
    /** Webview panels created with `createWebviewPanel`, oldest first. */
    webviewPanels: [] as FakeWebviewPanel[],
    /** File system providers, by scheme. */
    fileSystemProviders: new Map<string, unknown>(),
    /** Every input box shown with `showInputBox`, newest last. */
    inputBoxes: [] as {
        title?: string;
        value?: string;
        placeHolder?: string;
        validateInput?: (value: string) => unknown;
    }[],
    /** What the next `showInputBox` resolves to; undefined dismisses it. */
    nextInput: undefined as string | undefined,
    /** What the next `showSaveDialog` resolves to. */
    nextSaveDialog: undefined as string | undefined,
    /** Local files that `workspace.fs` reads and writes, by path. */
    files: new Map<string, Uint8Array>(),
    /** Debug adapter factories, by debugger type. */
    debugAdapters: new Map<string, { createDebugAdapterDescriptor(session: unknown): unknown }>(),
    /** The configurations `debug.startDebugging` was called with. */
    debugSessions: [] as {
        configuration: Record<string, unknown>;
        options?: unknown;
        folder?: unknown;
    }[],
    /** Debug configuration providers, by debugger type. */
    debugConfigurationProviders: new Map<string, unknown[]>(),
    /** The active editor's document, and the active notebook's. */
    activeEditor: undefined as Uri | undefined,
    activeNotebook: undefined as Uri | undefined,
    activeEditorChanged: new Emitter<unknown>(),
    activeNotebookChanged: new Emitter<unknown>(),
    /** `workspace.notebookDocuments`; fire `notebookOpened` after adding one. */
    notebooks: [] as { uri: Uri; notebookType: string; isClosed: boolean }[],
    notebookOpened: new Emitter<unknown>(),
    /** Installed extensions, by ID. Fire `extensionsChanged` after changing it. */
    extensions: new Map<
        string,
        {
            isActive: boolean;
            exports: unknown;
            activate(): Promise<unknown>;
            packageJSON?: Record<string, unknown>;
        }
    >(),
    extensionsChanged: new Emitter<void>(),
    /** Output channels created with `createOutputChannel`, with what was appended. */
    outputChannels: [] as { name: string; text: string; shown: number }[],
    /** `workspace.textDocuments`; tests push to it and fire `documentOpened`. */
    textDocuments: [] as { uri: Uri }[],
    documentOpened: new Emitter<{ uri: Uri }>(),
    /** The searches `workspace.findFiles` was asked for, and the paths it finds. */
    searches: [] as { base: string; pattern: string; exclude?: string }[],
    found: [] as string[],
    reset() {
        this.textDocuments.length = 0;
        this.outputChannels.length = 0;
        this.commands.clear();
        this.executed.length = 0;
        this.treeDataProviders.clear();
        this.errors.length = 0;
        this.nextErrorChoice = undefined;
        this.opened.length = 0;
        this.windowFocused = true;
        this.quickInputs.length = 0;
        this.statusBarItems.length = 0;
        this.warnings.length = 0;
        this.infos.length = 0;
        this.nextMessageChoice = undefined;
        this.progress.length = 0;
        this.progressRunning = 0;
        this.progressGeneration++;
        this.cancelProgress = () => {};
        this.pickFrom = () => undefined;
        this.shownDocuments.length = 0;
        this.clipboard = "";
        this.folders = [];
        this.nextOpenDialog = undefined;
        this.terminals.length = 0;
        this.diagnostics.length = 0;
        this.tasks.length = 0;
        this.treeViews.clear();
        this.webviewPanels.length = 0;
        this.fileSystemProviders.clear();
        this.inputBoxes.length = 0;
        this.nextInput = undefined;
        this.nextSaveDialog = undefined;
        this.files.clear();
        this.debugAdapters.clear();
        this.debugSessions.length = 0;
        this.debugConfigurationProviders.clear();
        this.activeEditor = undefined;
        this.activeNotebook = undefined;
        this.notebooks.length = 0;
        this.extensions.clear();
        this.chatProviders.clear();
        this.chatModelSelections.length = 0;
        this.searches.length = 0;
        this.found = [];
    },
};

const disposable = (dispose: () => void = () => {}) => ({ dispose });

export class Uri {
    private constructor(
        readonly scheme: string,
        readonly fsPath: string,
        private readonly raw: string,
        readonly query = "",
    ) {}
    /**
     * As VS Code's: a file URI's path has `/` separators whatever the OS, and
     * on Windows a `/` before the drive (`Uri.file("C:\\x").path` is `/C:/x`).
     */
    get path() {
        if (this.scheme !== "file" || process.platform !== "win32") {
            return this.fsPath;
        }
        const slashes = this.fsPath.replaceAll("\\", "/");
        return /^[A-Za-z]:/.test(slashes) ? `/${slashes}` : slashes;
    }
    static file(p: string) {
        return new Uri("file", p, `file://${p}`);
    }
    static parse(value: string, _strict?: boolean) {
        const scheme = value.split(":")[0] ?? "";
        // A file URI's path, as `Uri.file` writes it.
        const fsPath =
            scheme === "file" && value.startsWith("file://")
                ? decodeURIComponent(value.slice("file://".length))
                : value;
        return new Uri(scheme, fsPath, value);
    }
    static joinPath(base: Uri, ...segments: string[]) {
        return Uri.file(path.join(base.fsPath, ...segments));
    }
    static from(components: { scheme: string; path?: string; query?: string }) {
        const p = components.path ?? "";
        return new Uri(components.scheme, p, `${components.scheme}:${p}`, components.query ?? "");
    }
    with(change: { scheme?: string; fragment?: string }) {
        const scheme = change.scheme ?? this.scheme;
        return new Uri(
            scheme,
            this.fsPath,
            `${scheme}://${this.fsPath}${change.fragment ? `#${change.fragment}` : ""}`,
            this.query,
        );
    }
    toString() {
        return this.raw;
    }
}

export class RelativePattern {
    constructor(
        readonly baseUri: Uri,
        readonly pattern: string,
    ) {}
}

export enum TreeItemCollapsibleState {
    None = 0,
    Collapsed = 1,
    Expanded = 2,
}

export class ThemeIcon {
    constructor(
        readonly id: string,
        readonly color?: ThemeColor,
    ) {}
}

export class TreeItem {
    iconPath?: ThemeIcon;
    description?: string;
    contextValue?: string;
    command?: { command: string; title: string; arguments?: unknown[] };
    constructor(
        readonly label: string,
        readonly collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None,
    ) {}
}

export class EventEmitter<T> extends Emitter<T> {}

export class Position {
    constructor(
        readonly line: number,
        readonly character: number,
    ) {}
}

export class Range {
    readonly start: Position;
    readonly end: Position;
    constructor(
        start: Position | number,
        end: Position | number,
        endLine?: number,
        endCharacter?: number,
    ) {
        if (typeof start === "number" && typeof end === "number") {
            this.start = new Position(start, end);
            this.end = new Position(endLine ?? start, endCharacter ?? end);
        } else {
            this.start = start as Position;
            this.end = end as Position;
        }
    }
}

export class Selection extends Range {}

export class NotebookRange {
    constructor(
        readonly start: number,
        readonly end: number,
    ) {}
}

export enum DiagnosticSeverity {
    Error = 0,
    Warning = 1,
    Information = 2,
    Hint = 3,
}

export class Diagnostic {
    source?: string;
    constructor(
        readonly range: Range,
        readonly message: string,
        readonly severity: DiagnosticSeverity = DiagnosticSeverity.Error,
    ) {}
}

/** A diagnostic collection that keeps its entries, by URI string. */
export class FakeDiagnosticCollection {
    readonly entries = new Map<string, Diagnostic[]>();
    disposed = false;
    constructor(readonly name: string) {}
    set(uri: Uri, diagnostics: Diagnostic[]) {
        this.entries.set(uri.toString(), diagnostics);
    }
    clear() {
        this.entries.clear();
    }
    dispose() {
        this.disposed = true;
    }
}

export class Location {
    readonly range: Range;
    constructor(
        readonly uri: Uri,
        position: Position,
    ) {
        this.range = new Range(position, position);
    }
}

export enum TextEditorRevealType {
    Default = 0,
    InCenter = 1,
}

export class ThemeColor {
    constructor(readonly id: string) {}
}

export class MarkdownString {
    isTrusted?: boolean | { readonly enabledCommands: readonly string[] };
    constructor(public value = "") {}
    appendMarkdown(text: string) {
        this.value += text;
        return this;
    }
}

export enum StatusBarAlignment {
    Left = 1,
    Right = 2,
}

export enum QuickPickItemKind {
    Separator = -1,
    Default = 0,
}

export enum InputBoxValidationSeverity {
    Info = 1,
    Warning = 2,
    Error = 3,
}

export enum ProgressLocation {
    SourceControl = 1,
    Window = 10,
    Notification = 15,
}

export const QuickInputButtons = { Back: { iconPath: new ThemeIcon("arrow-left") } };

/**
 * The label match the fake uses: the typed text as a contiguous substring of
 * the label, ignoring case. A subset of VS Code's default filter
 * (`matchesFuzzy` at release/1.128), which also matches camelCase and word
 * starts. The tests rely only on this subset.
 */
function labelMatches(label: string, typed: string): boolean {
    return label.toLowerCase().includes(typed.toLowerCase());
}

/** A quick pick or input box. Tests drive it with `type`, `accept` and `hide`. */
export class FakeQuickInput {
    title?: string;
    step?: number;
    totalSteps?: number;
    placeholder?: string;
    ignoreFocusOut = false;
    enabled = true;
    busy = false;
    canSelectMany = false;
    matchOnDescription = false;
    matchOnDetail = false;
    password = false;
    validationMessage: unknown;
    buttons: unknown[] = [];
    items: { label: string; [key: string]: unknown }[] = [];
    activeItems: { label: string }[] = [];
    selectedItems: { label: string }[] = [];
    visible = false;
    disposed = false;
    private _value = "";
    private readonly changedValue = new Emitter<string>();
    private readonly changedSelection = new Emitter<{ label: string }[]>();
    private readonly changedActive = new Emitter<{ label: string }[]>();
    private readonly accepted = new Emitter<void>();
    private readonly hidden = new Emitter<void>();
    private readonly triggered = new Emitter<unknown>();
    readonly onDidChangeValue = this.changedValue.event;
    readonly onDidChangeSelection = this.changedSelection.event;
    readonly onDidChangeActive = this.changedActive.event;
    readonly onDidAccept = this.accepted.event;
    readonly onDidHide = this.hidden.event;
    readonly onDidTriggerButton = this.triggered.event;

    constructor(readonly kind: "quickPick" | "inputBox") {}

    get value() {
        return this._value;
    }
    set value(v: string) {
        this._value = v;
    }
    show() {
        this.visible = true;
    }
    hide() {
        this.visible = false;
        this.hidden.fire();
    }
    dispose() {
        this.disposed = true;
        this.visible = false;
    }
    type(value: string) {
        this._value = value;
        this.changedValue.fire(value);
    }
    /**
     * The items the fake shows for the typed value: those flagged `alwaysShow`,
     * and those whose label contains the typed text (see `labelMatches`).
     * Detail is searched only when `matchOnDetail` is on, as it is not by default.
     */
    shownItems() {
        const typed = this._value.trim();
        return this.items.filter(
            (i) =>
                i.alwaysShow === true ||
                typed === "" ||
                labelMatches(i.label, typed) ||
                (this.matchOnDetail &&
                    typeof i.detail === "string" &&
                    labelMatches(i.detail, typed)),
        );
    }

    /** Moves the focus to the item with this label, as the arrow keys do. */
    move(label: string) {
        this.activeItems = this.items.filter((i) => i.label === label);
        this.changedActive.fire(this.activeItems);
    }
    /** Accepts the item with this label, or the active item, or the typed value. */
    accept(label?: string) {
        if (this.kind === "inputBox") {
            this.accepted.fire();
            return;
        }
        const item =
            label !== undefined
                ? this.items.find((i) => i.label === label)
                : (this.activeItems[0] ?? this.items[0]);
        if (item === undefined) {
            throw new Error(`No item "${label}" in ${this.items.map((i) => i.label).join(", ")}`);
        }
        this.selectedItems = [item];
        this.changedSelection.fire([item]);
    }
    /** Accepts what is selected, as Enter does in a multi-select pick. */
    acceptSelection(labels: string[]) {
        this.selectedItems = this.items.filter((i) => labels.includes(i.label));
        this.accepted.fire();
    }
    triggerButton(button: unknown) {
        this.triggered.fire(button);
    }
}

export class FakeStatusBarItem {
    text = "";
    tooltip: unknown;
    command: unknown;
    name?: string;
    backgroundColor: unknown;
    accessibilityInformation: unknown;
    visible = false;
    disposed = false;
    constructor(
        readonly id: string | undefined,
        readonly alignment?: StatusBarAlignment,
        readonly priority?: number,
    ) {}
    show() {
        this.visible = true;
    }
    hide() {
        this.visible = false;
    }
    dispose() {
        this.disposed = true;
    }
}

export enum TerminalLocation {
    Panel = 1,
    Editor = 2,
}

/**
 * A terminal that opens at once and records what is typed into it. A
 * pseudo-terminal's output is recorded in `output`.
 */
export class FakeTerminal {
    readonly sent: string[] = [];
    output = "";
    closed = false;
    shown = 0;
    constructor(
        readonly creationOptions: {
            name?: string;
            env?: Record<string, string>;
            pty?: { onDidWrite: (listener: (data: string) => void) => unknown; close(): void };
            [key: string]: unknown;
        },
    ) {
        creationOptions.pty?.onDidWrite((data) => (this.output += data));
    }
    get name() {
        return this.creationOptions.name ?? "";
    }
    sendText(text: string) {
        this.sent.push(text);
    }
    show() {
        this.shown++;
    }
    /** As if the shell exited. */
    close() {
        this.closed = true;
        host.terminalClosed.fire(this);
    }
    /** As if the user closed the terminal: a pseudo-terminal is told. */
    closeByUser() {
        this.creationOptions.pty?.close();
        this.close();
    }
    dispose() {
        this.close();
    }
}

export enum TaskScope {
    Global = 1,
    Workspace = 2,
}

export enum TaskRevealKind {
    Always = 1,
    Silent = 2,
    Never = 3,
}

export class TaskGroup {
    static readonly Build = new TaskGroup("build");
    private constructor(readonly id: string) {}
}

type FakePty = {
    onDidWrite: (listener: (data: string) => void) => unknown;
    onDidClose?: (listener: (code?: number) => void) => unknown;
    open(dimensions: undefined): void;
    close(): void;
};

export class CustomExecution {
    constructor(readonly callback: (resolvedDefinition: unknown) => Promise<FakePty>) {}
}

export class Task {
    isBackground = false;
    detail?: string;
    group?: TaskGroup;
    presentationOptions: Record<string, unknown> = {};
    problemMatchers: string[] = [];
    constructor(
        readonly definition: { type: string; [key: string]: unknown },
        readonly scope: TaskScope,
        readonly name: string,
        readonly source: string,
        readonly execution: CustomExecution,
    ) {}
}

/**
 * A running custom-execution task: VS Code opens the pseudo-terminal, and
 * terminating it closes the pseudo-terminal. The task ends when the
 * pseudo-terminal closes itself, or is terminated.
 */
export class FakeTaskExecution {
    output = "";
    ended = false;
    exitCode?: number;
    private pty?: FakePty;
    constructor(readonly task: Task) {}
    async run() {
        this.pty = await this.task.execution.callback(this.task.definition);
        this.pty.onDidWrite((data) => (this.output += data));
        this.pty.onDidClose?.((code) => {
            this.ended = true;
            this.exitCode = code;
        });
        this.pty.open(undefined);
    }
    terminate() {
        if (!this.ended) {
            this.ended = true;
            this.pty?.close();
        }
    }
}

export enum TreeItemCheckboxState {
    Unchecked = 0,
    Checked = 1,
}

/** A tree view whose selection tests set; `select` also fires the selection event. */
export class FakeTreeView {
    selection: unknown[] = [];
    disposed = false;
    visible = true;
    /** The line of text above the rows. */
    message?: string;
    private readonly selectionChanged = new Emitter<{ selection: unknown[] }>();
    readonly onDidChangeSelection = this.selectionChanged.event;
    private readonly checkboxChanged = new Emitter<{ items: [unknown, TreeItemCheckboxState][] }>();
    readonly onDidChangeCheckboxState = this.checkboxChanged.event;
    private readonly visibilityChanged = new Emitter<{ visible: boolean }>();
    readonly onDidChangeVisibility = this.visibilityChanged.event;
    private readonly expandChanged = new Emitter<{ element: unknown }>();
    readonly onDidExpandElement = this.expandChanged.event;
    private readonly collapseChanged = new Emitter<{ element: unknown }>();
    readonly onDidCollapseElement = this.collapseChanged.event;
    /** Expands or collapses a row, as clicking its arrow does. */
    toggle(element: unknown, expanded: boolean) {
        (expanded ? this.expandChanged : this.collapseChanged).fire({ element });
    }
    /** Checks or unchecks a row, as clicking its checkbox does. */
    check(item: unknown, checked: boolean) {
        this.checkboxChanged.fire({
            items: [
                [item, checked ? TreeItemCheckboxState.Checked : TreeItemCheckboxState.Unchecked],
            ],
        });
    }
    setVisible(visible: boolean) {
        this.visible = visible;
        this.visibilityChanged.fire({ visible });
    }
    constructor(readonly treeDataProvider: unknown) {}
    select(...selection: unknown[]) {
        this.selection = selection;
        this.selectionChanged.fire({ selection });
    }
    dispose() {
        this.disposed = true;
    }
}

export enum ViewColumn {
    Active = -1,
    Beside = -2,
    One = 1,
}

/** A webview panel: what the extension set and posted, and the page's messages, which tests send. */
export class FakeWebviewPanel {
    readonly posted: unknown[] = [];
    disposed = false;
    revealed = 0;
    private readonly received = new Emitter<unknown>();
    private readonly disposedEmitter = new Emitter<void>();
    readonly onDidDispose = this.disposedEmitter.event;
    readonly webview = {
        cspSource: "vscode-webview://fake",
        html: "",
        asWebviewUri: (uri: Uri) => Uri.parse(`vscode-webview://fake${uri.fsPath}`),
        postMessage: async (message: unknown) => {
            this.posted.push(message);
            return true;
        },
        onDidReceiveMessage: this.received.event,
    };
    constructor(
        readonly viewType: string,
        public title: string,
        readonly showOptions: unknown,
        readonly options: { localResourceRoots?: Uri[]; enableScripts?: boolean },
    ) {}
    get html() {
        return this.webview.html;
    }
    /** A message from the page. */
    receive(message: unknown) {
        this.received.fire(message);
    }
    reveal() {
        this.revealed++;
    }
    /** Closed by the user, or by the extension. */
    dispose() {
        if (!this.disposed) {
            this.disposed = true;
            this.disposedEmitter.fire();
        }
    }
}

export enum FileType {
    Unknown = 0,
    File = 1,
    Directory = 2,
    SymbolicLink = 64,
}

export enum FileChangeType {
    Changed = 1,
    Created = 2,
    Deleted = 3,
}

export class FileSystemError extends Error {
    private constructor(
        message: string,
        readonly code: string,
    ) {
        super(message);
        this.name = `${code} (FileSystemError)`;
    }
    private static of(code: string, target?: Uri | string) {
        return new FileSystemError(target === undefined ? code : String(target), code);
    }
    static FileNotFound(target?: Uri | string) {
        return FileSystemError.of("FileNotFound", target);
    }
    static FileExists(target?: Uri | string) {
        return FileSystemError.of("FileExists", target);
    }
    static FileIsADirectory(target?: Uri | string) {
        return FileSystemError.of("FileIsADirectory", target);
    }
    static FileNotADirectory(target?: Uri | string) {
        return FileSystemError.of("FileNotADirectory", target);
    }
    static NoPermissions(target?: Uri | string) {
        return FileSystemError.of("NoPermissions", target);
    }
    static Unavailable(target?: Uri | string) {
        return FileSystemError.of("Unavailable", target);
    }
}

export const tasks = {
    async executeTask(task: Task) {
        const execution = new FakeTaskExecution(task);
        host.tasks.push(execution);
        await execution.run();
        return execution;
    },
};

export enum ConfigurationTarget {
    Global = 1,
    Workspace = 2,
    WorkspaceFolder = 3,
}

export const commands = {
    registerCommand(id: string, callback: Callback) {
        if (host.commands.has(id)) {
            throw new Error(`command '${id}' already exists`);
        }
        host.commands.set(id, callback);
        return disposable(() => host.commands.delete(id));
    },
    async executeCommand(command: string, ...args: unknown[]) {
        host.executed.push({ command, args });
        const handler = host.commands.get(command);
        // Another extension's command exists only while that extension is installed and enabled.
        const owner = Object.entries(EXTENSION_COMMANDS).find(([prefix]) =>
            command.startsWith(prefix),
        )?.[1];
        if (handler === undefined && owner !== undefined && !host.extensions.has(owner)) {
            throw new Error(`command '${command}' not found`);
        }
        return handler?.(...args);
    },
};

/** The command prefixes of the extension pack's members, and the extension each belongs to. */
const EXTENSION_COMMANDS: Record<string, string> = {
    "python.": "ms-python.python",
    "jupyter.": "ms-toolsai.jupyter",
};

/** `vscode.DebugAdapterInlineImplementation`: holds the adapter. */
export class DebugAdapterInlineImplementation {
    constructor(readonly implementation: unknown) {}
}

export const debug = {
    registerDebugAdapterDescriptorFactory(
        type: string,
        factory: { createDebugAdapterDescriptor(session: unknown): unknown },
    ) {
        host.debugAdapters.set(type, factory);
        return disposable(() => host.debugAdapters.delete(type));
    },
    registerDebugConfigurationProvider(type: string, provider: unknown) {
        const providers = host.debugConfigurationProviders.get(type) ?? [];
        providers.push(provider);
        host.debugConfigurationProviders.set(type, providers);
        return disposable(() => providers.splice(providers.indexOf(provider), 1));
    },
    async startDebugging(
        folder: unknown,
        configuration: Record<string, unknown>,
        options?: unknown,
    ) {
        // VS Code says "Configured debug type 'debugpy' is not supported." and starts nothing.
        if (configuration.type === "debugpy" && !host.extensions.has("ms-python.debugpy")) {
            return false;
        }
        host.debugSessions.push({ configuration, options, folder });
        return true;
    },
};

export const window = {
    get activeTextEditor() {
        return host.activeEditor === undefined
            ? undefined
            : { document: { uri: host.activeEditor } };
    },
    get activeNotebookEditor() {
        return host.activeNotebook === undefined
            ? undefined
            : { notebook: { uri: host.activeNotebook } };
    },
    onDidChangeActiveTextEditor: host.activeEditorChanged.event,
    onDidChangeActiveNotebookEditor: host.activeNotebookChanged.event,
    get state() {
        return { focused: host.windowFocused };
    },
    onDidChangeWindowState: host.windowState.event,
    registerTreeDataProvider(id: string, provider: unknown) {
        host.treeDataProviders.set(id, provider);
        return disposable(() => host.treeDataProviders.delete(id));
    },
    createWebviewPanel(
        viewType: string,
        title: string,
        showOptions: unknown,
        options: FakeWebviewPanel["options"],
    ) {
        const panel = new FakeWebviewPanel(viewType, title, showOptions, options);
        host.webviewPanels.push(panel);
        return panel;
    },
    createTreeView(id: string, options: { treeDataProvider: unknown }) {
        const view = new FakeTreeView(options.treeDataProvider);
        host.treeDataProviders.set(id, options.treeDataProvider);
        host.treeViews.set(id, view);
        return view;
    },
    async showInputBox(options: (typeof host.inputBoxes)[number]) {
        host.inputBoxes.push(options);
        return host.nextInput;
    },
    async showSaveDialog(_options: unknown) {
        return host.nextSaveDialog === undefined ? undefined : Uri.file(host.nextSaveDialog);
    },
    registerFileDecorationProvider(_provider: unknown) {
        return disposable();
    },
    async showErrorMessage(message: string, ...actions: string[]) {
        host.errors.push({ message, actions });
        return host.nextErrorChoice;
    },
    createQuickPick() {
        const input = new FakeQuickInput("quickPick");
        host.quickInputs.push(input);
        return input;
    },
    createInputBox() {
        const input = new FakeQuickInput("inputBox");
        host.quickInputs.push(input);
        return input;
    },
    createStatusBarItem(id?: string, alignment?: StatusBarAlignment, priority?: number) {
        const item = new FakeStatusBarItem(id, alignment, priority);
        host.statusBarItems.push(item);
        return item;
    },
    async showWarningMessage(message: string, ...actions: unknown[]) {
        host.warnings.push({
            message,
            actions: actions.filter((a): a is string => typeof a === "string"),
        });
        return host.nextMessageChoice;
    },
    async showInformationMessage(message: string, ...actions: unknown[]) {
        host.infos.push({
            message,
            actions: actions.filter((a): a is string => typeof a === "string"),
        });
        return host.nextMessageChoice;
    },
    async withProgress<R>(
        options: { title?: string; cancellable?: boolean },
        task: (
            progress: { report(): void },
            token: { isCancellationRequested: boolean; onCancellationRequested: unknown },
        ) => Promise<R>,
    ) {
        host.progress.push({ title: options.title, cancellable: options.cancellable });
        const cancelled = new Emitter<void>();
        const token = { isCancellationRequested: false, onCancellationRequested: cancelled.event };
        const previous = host.cancelProgress;
        host.cancelProgress = () => {
            previous();
            token.isCancellationRequested = true;
            cancelled.fire();
        };
        const generation = host.progressGeneration;
        host.progressRunning++;
        // VS Code disposes the token's source when the task settles.
        return task({ report: () => {} }, token).finally(() => {
            if (host.progressGeneration === generation) {
                host.progressRunning--;
            }
            cancelled.dispose();
        });
    },
    async showQuickPick<T extends { label: string }>(items: T[]) {
        return host.pickFrom(items) as T | undefined;
    },
    async showOpenDialog() {
        return host.nextOpenDialog === undefined ? undefined : [Uri.file(host.nextOpenDialog)];
    },
    async showTextDocument(doc: { uri: Uri }) {
        host.shownDocuments.push(doc.uri.fsPath);
        return { selection: undefined as unknown, revealRange: (_range: unknown) => {} };
    },
    createTerminal(options: FakeTerminal["creationOptions"]) {
        const terminal = new FakeTerminal(options);
        host.terminals.push(terminal);
        setImmediate(() => host.terminalOpened.fire(terminal));
        return terminal;
    },
    get terminals() {
        return host.terminals.filter((t) => !t.closed);
    },
    onDidOpenTerminal: host.terminalOpened.event,
    onDidCloseTerminal: host.terminalClosed.event,
    createOutputChannel(name: string) {
        const noop = () => {};
        const channel = { name, text: "", shown: 0 };
        host.outputChannels.push(channel);
        return {
            trace: noop,
            debug: noop,
            info: noop,
            warn: noop,
            error: noop,
            append: (text: string) => void (channel.text += text),
            clear: () => void (channel.text = ""),
            appendLine: (text: string) => void (channel.text += text + "\n"),
            show: () => void channel.shown++,
            dispose: noop,
        };
    },
};

const folderOf = (p: string) => {
    const folder = host.folders.find((f) => p === f || p.startsWith(f + path.sep));
    return folder === undefined
        ? undefined
        : { uri: Uri.file(folder), name: path.basename(folder), index: 0 };
};

export const workspace = {
    get workspaceFolders() {
        return host.folders.length === 0 ? undefined : host.folders.map((f) => folderOf(f)!);
    },
    getWorkspaceFolder(uri: Uri) {
        return folderOf(uri.fsPath);
    },
    /** VS Code's rule: relative inside a folder, the input itself for a folder root or outside. */
    asRelativePath(uri: Uri) {
        const folder = host.folders.find((f) => uri.fsPath.startsWith(f + path.sep));
        return folder === undefined ? uri.fsPath : path.relative(folder, uri.fsPath);
    },
    async openTextDocument(uri: Uri) {
        return { uri };
    },
    getConfiguration() {
        return { get: () => undefined, inspect: () => undefined, update: async () => {} };
    },
    onDidChangeConfiguration: () => disposable(),
    onDidChangeWorkspaceFolders: host.foldersChanged.event,
    onDidSaveTextDocument: host.documentSaved.event,
    get textDocuments() {
        return host.textDocuments;
    },
    onDidOpenTextDocument: host.documentOpened.event,
    get notebookDocuments() {
        return host.notebooks;
    },
    onDidOpenNotebookDocument: host.notebookOpened.event,
    async findFiles(include: RelativePattern, exclude?: string) {
        host.searches.push({ base: include.baseUri.fsPath, pattern: include.pattern, exclude });
        return host.found.map((p) => Uri.file(p));
    },
    registerFileSystemProvider(scheme: string, provider: unknown, _options?: unknown) {
        host.fileSystemProviders.set(scheme, provider);
        return disposable(() => host.fileSystemProviders.delete(scheme));
    },
    fs: {
        async readFile(uri: Uri) {
            const content = host.files.get(uri.fsPath);
            if (content === undefined) {
                throw FileSystemError.FileNotFound(uri);
            }
            return content;
        },
        async writeFile(uri: Uri, content: Uint8Array) {
            host.files.set(uri.fsPath, content);
        },
    },
};

export enum ExtensionMode {
    Production = 1,
    Development = 2,
    Test = 3,
}

export const extensions = {
    getExtension(id: string) {
        return host.extensions.get(id);
    },
    onDidChange: host.extensionsChanged.event,
};

export const languages = {
    createDiagnosticCollection(name: string) {
        const collection = new FakeDiagnosticCollection(name);
        host.diagnostics.push(collection);
        return collection;
    },
};

export enum LanguageModelChatMessageRole {
    User = 1,
    Assistant = 2,
}

export enum LanguageModelChatToolMode {
    Auto = 1,
    Required = 2,
}

export class LanguageModelTextPart {
    constructor(public value: string) {}
}

export class LanguageModelChatMessage {
    static User(content: string | unknown[], name?: string) {
        return new LanguageModelChatMessage(LanguageModelChatMessageRole.User, content, name);
    }
    static Assistant(content: string | unknown[], name?: string) {
        return new LanguageModelChatMessage(LanguageModelChatMessageRole.Assistant, content, name);
    }
    content: unknown[];
    constructor(
        public role: LanguageModelChatMessageRole,
        content: string | unknown[],
        public name?: string,
    ) {
        this.content = typeof content === "string" ? [new LanguageModelTextPart(content)] : content;
    }
}

export class LanguageModelToolCallPart {
    constructor(
        public callId: string,
        public name: string,
        public input: object,
    ) {}
}

export class LanguageModelToolResultPart {
    constructor(
        public callId: string,
        public content: unknown[],
    ) {}
}

export class LanguageModelPromptTsxPart {
    constructor(public value: unknown) {}
}

export class LanguageModelDataPart {
    constructor(
        public data: Uint8Array,
        public mimeType: string,
    ) {}
    static json(value: unknown, mime = "text/x-json") {
        return new LanguageModelDataPart(new TextEncoder().encode(JSON.stringify(value)), mime);
    }
    static text(value: string, mime = "text/plain") {
        return new LanguageModelDataPart(new TextEncoder().encode(value), mime);
    }
    static image(data: Uint8Array, mime: string) {
        return new LanguageModelDataPart(data, mime);
    }
}

/** As VS Code's: the code is the factory's name. */
export class LanguageModelError extends Error {
    static NoPermissions(message?: string) {
        return new LanguageModelError(message, "NoPermissions");
    }
    static Blocked(message?: string) {
        return new LanguageModelError(message, "Blocked");
    }
    static NotFound(message?: string) {
        return new LanguageModelError(message, "NotFound");
    }
    constructor(
        message?: string,
        readonly code = "",
    ) {
        super(message);
        this.name = "LanguageModelError";
    }
}

export class CancellationError extends Error {
    constructor() {
        super("Canceled");
        this.name = "Canceled";
    }
}

export class CancellationTokenSource {
    private readonly cancelled = new Emitter<void>();
    readonly token = {
        isCancellationRequested: false,
        onCancellationRequested: this.cancelled.event,
    };
    cancel() {
        if (!this.token.isCancellationRequested) {
            this.token.isCancellationRequested = true;
            this.cancelled.fire();
        }
    }
    dispose() {
        this.cancelled.dispose();
    }
}

export const lm = {
    registerLanguageModelChatProvider(vendor: string, provider: unknown) {
        if (host.chatProviders.has(vendor)) {
            throw new Error(`Chat model provider for vendor ${vendor} is already registered.`);
        }
        host.chatProviders.set(vendor, provider);
        return disposable(() => host.chatProviders.delete(vendor));
    },
    async selectChatModels(selector?: { vendor?: string }) {
        host.chatModelSelections.push(selector ?? {});
        return [];
    },
};

export const env = {
    shell: "/bin/bash",
    clipboard: {
        async writeText(text: string) {
            host.clipboard = text;
        },
    },
    uriScheme: "vscode",
    /** An install folder that doesn't exist, so no editor command is found in it. */
    appRoot: "/nonexistent/editor/resources/app",
    /** `ssh-remote` in a window whose extension host runs on a remote machine. */
    remoteName: undefined as string | undefined,
    async openExternal(uri: Uri) {
        host.opened.push(uri.toString());
        return true;
    },
};
