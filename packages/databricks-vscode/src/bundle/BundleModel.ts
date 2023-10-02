import {Disposable, EventEmitter, ExtensionContext} from "vscode";
import {BundleFileSet} from "./BundleFileSet";
import {BundleTarget} from "./bundle_schema";
import {has, merge} from "lodash";
import {mkdir} from "node:fs/promises";
import path from "node:path";
import {exists, readJSON, writeJson} from "fs-extra";
import {Mutex} from "../locking";

export interface BundleOverrides {
    authType?: string;
    computeId?: string;
}

export class BundleModel implements Disposable {
    private disposables: Disposable[] = [];

    private _onDidChangeSelectedTarget = new EventEmitter<string | undefined>();
    public onDidChangeSelectedTarget = this._onDidChangeSelectedTarget.event;

    private _onDidChangeBundleData = new EventEmitter<void>();
    public onDidChangeBundleData = this._onDidChangeBundleData.event;

    private _onDidChangeConfigurations = new EventEmitter<void>();
    public onDidChangeConfigurations = this._onDidChangeConfigurations.event;

    private _selectedTarget?: string;
    private _collectedTargets = {
        dirty: true,
        mapping: new Map<string, BundleTarget>(),
    };

    private overrideFileMutex = new Mutex();

    constructor(
        private readonly bundleFileSet: BundleFileSet,
        private readonly context: ExtensionContext
    ) {
        this.disposables.push(
            this.bundleFileSet.onDidChangeMergedBundle(() => {
                this._collectedTargets.dirty = true;
                this._onDidChangeBundleData.fire();
            })
        );
    }

    async init() {
        const mapping = await this.collectTargets();
        const defaultKey =
            Array.from(mapping.keys()).find(
                (key) => mapping.get(key)?.default === true
            ) ??
            Array.from(mapping.keys()).find(
                (key) => mapping.get(key)?.mode === "development"
            ) ??
            mapping.size > 0
                ? mapping.keys().next().value
                : undefined;

        this.selectedTarget = defaultKey;
    }

    async collectTargets() {
        if (!this._collectedTargets.dirty) {
            return this._collectedTargets.mapping;
        }
        await this.bundleFileSet.forEach(async (data) => {
            if (data.targets === undefined) {
                return;
            }
            const targets = data.targets;

            Object.keys(targets).forEach((target) => {
                const oldData =
                    this._collectedTargets.mapping.get(target) ?? {};
                this._collectedTargets.mapping.set(
                    target,
                    merge(oldData, targets[target])
                );
            });
        });
        this._collectedTargets.dirty = false;
        return this._collectedTargets.mapping;
    }

    public get selectedTarget() {
        return this._selectedTarget;
    }

    public set selectedTarget(target: string | undefined) {
        if (target === this._selectedTarget) {
            return;
        }
        this._selectedTarget = target;
        this._onDidChangeSelectedTarget.fire(target);
    }

    private async getDefaults() {
        if (this.selectedTarget === undefined) {
            return {};
        }
        const targetData = (await this.collectTargets()).get(
            this.selectedTarget
        );
        const mergedBundle = await this.bundleFileSet.mergedBundle;
        return {
            authType:
                targetData?.workspace?.auth_type ??
                mergedBundle.workspace?.auth_type,
            computeId:
                targetData?.compute_id ?? mergedBundle.bundle?.compute_id,
            syncDestination:
                targetData?.workspace?.file_path ??
                mergedBundle.workspace?.file_path ??
                "/Users/kartik@example.com/.bundle/files",
        };
    }

    private async readOverrides() {
        const storagePath = this.context.storageUri;
        if (storagePath === undefined) {
            return {};
        }
        await mkdir(storagePath.fsPath, {recursive: true});
        const bundeOverridesFile = path.join(
            storagePath.fsPath,
            "bundleOverrides.json"
        );
        if (!(await exists(bundeOverridesFile))) {
            await writeJson(bundeOverridesFile, {});
        }
        return (await readJSON(bundeOverridesFile)) as Record<
            string,
            BundleOverrides
        >;
    }

    private async getOverrides() {
        const overrides = await this.readOverrides();
        if (this.selectedTarget === undefined) {
            return {};
        }
        return overrides[this.selectedTarget];
    }

    async getConfigurations() {
        return {...(await this.getDefaults()), ...(await this.getOverrides())};
    }

    async writeOverride(key: keyof BundleOverrides, value?: string) {
        await this.overrideFileMutex.wait();
        try {
            const storagePath = this.context.storageUri;
            if (
                storagePath === undefined ||
                this.selectedTarget === undefined
            ) {
                return;
            }
            const bundeOverridesFile = path.join(
                storagePath.fsPath,
                "bundleOverrides.json"
            );
            const overrides = await this.readOverrides();

            if (
                value === undefined &&
                has(overrides[this.selectedTarget], key)
            ) {
                delete overrides[this.selectedTarget][key];
            } else {
                overrides[this.selectedTarget] =
                    overrides[this.selectedTarget] ?? {};
                overrides[this.selectedTarget][key] = value;
            }

            await writeJson(bundeOverridesFile, overrides);
        } finally {
            this.overrideFileMutex.signal();
        }
    }

    async updateAuthType(choice?: string) {
        const {authType} = await this.getConfigurations();
        if (authType === choice) {
            return;
        }
        await this.writeOverride("authType", choice);
        this._onDidChangeConfigurations.fire();
    }

    async updateCluster(choice?: string) {
        const {computeId} = await this.getConfigurations();
        if (computeId === choice) {
            return;
        }
        await this.writeOverride("computeId", choice);
        this._onDidChangeConfigurations.fire();
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
