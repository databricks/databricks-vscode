import {Event, Uri} from "vscode";
import {BundleFileSet, BundleWatcher} from "..";
import {BundleSchema, BundleTarget} from "../types";
import {BaseModelWithStateCache} from "../../configuration/models/BaseModelWithStateCache";
import {UrlUtils} from "../../utils";
import {Mutex} from "../../locking";
import * as lodash from "lodash";
import {withOnErrorHandler} from "../../utils/onErrorDecorator";

export type BundlePreValidateState = {
    host?: URL;
    mode?: "development" | "staging" | "production";
    authParams?: Record<string, string | undefined>;
} & BundleTarget & {
        preValidateBundleSchema?: BundleSchema & {
            variables: {
                [k in keyof Required<BundleSchema>["variables"]]:
                    | Required<BundleSchema>["variables"][k]
                    | string;
            };
        };
    };

/**
 * Reads and writes bundle configs. This class does not notify when the configs change.
 * We use the BundleWatcher to notify when the configs change.
 */
export class BundlePreValidateModel extends BaseModelWithStateCache<BundlePreValidateState> {
    protected mutex = new Mutex();
    private target: string | undefined;
    /**
     * The host of the pinned session credentials in Remote SSH mode. A target
     * with no `workspace.host` of its own is run by the CLI against
     * `DATABRICKS_HOST` (the session host), so config loading uses this as the
     * host rather than throwing on an empty one. Unset in normal mode, where a
     * host-less target still surfaces as an invalid host.
     */
    private sessionHost: URL | undefined;
    /** Any bundle file changed, whether or not a target is set. */
    public readonly onDidChangeBundleFiles: Event<void>;

    constructor(
        private readonly bundleFileSet: BundleFileSet,
        private readonly bunldeFileWatcher: BundleWatcher
    ) {
        super();
        this.onDidChangeBundleFiles = this.bunldeFileWatcher.onDidChange;
        this.disposables.push(
            this.bunldeFileWatcher.onDidChange(
                withOnErrorHandler(
                    async () => {
                        await this.stateCache.refresh();
                    },
                    {popup: false, log: true, throw: false}
                )
            )
        );
    }

    get targets() {
        return (async () => {
            const bundle = await this.bundleFileSet.bundleDataCache.value;
            const targets = Object.assign({}, bundle.targets ?? {});

            Object.keys(targets ?? {}).map((key) => {
                targets[key] = this.getRawTargetData(bundle, key);
            });

            return targets;
        })();
    }

    /**
     * The target's `workspace` auth fields (`host`, `profile`) resolved fresh
     * from disk, bypassing bundleDataCache, with the global `workspace` block
     * merged in the same way as `targets` so they match what the CLI resolves.
     * The remote-mode credential guard reads these through here (ConfigModel),
     * so a missed BundleWatcher event can't leave it approving a host that no
     * longer matches the YAML on disk.
     *
     * `profile` matters because a target that authenticates via a named profile
     * takes its host from that profile (overriding `DATABRICKS_HOST`), and the
     * CLI reports `workspace.profile` rather than the resolved host — so the
     * guard can't catch it by comparing hosts and fails closed on it instead.
     *
     * Returns the merged `{host, profile}`; the raw string when the whole
     * `workspace` block is an unresolved `${...}` variable (the guard fails
     * closed on that); or undefined when the target isn't defined.
     */
    public async getTargetWorkspaceFromDisk(
        target: string
    ): Promise<{host?: string; profile?: string} | string | undefined> {
        const bundle = await this.bundleFileSet.readMergedBundleFromDisk();
        if (bundle?.targets?.[target] === undefined) {
            return undefined;
        }
        // A whole `workspace` block given as an unresolved `${...}` variable
        // parses as a string; the merged view below would mangle it into an
        // indexed object with no host, so surface the string and let the guard
        // fail closed rather than read an empty host.
        const targetWorkspace: unknown = bundle.targets?.[target]?.workspace;
        if (typeof targetWorkspace === "string") {
            return targetWorkspace;
        }
        const globalWorkspace: unknown = bundle.workspace;
        if (typeof globalWorkspace === "string") {
            return globalWorkspace;
        }
        const workspace = this.getRawTargetData(bundle, target)?.workspace as
            | {host?: string; profile?: string}
            | undefined;
        return {host: workspace?.host, profile: workspace?.profile};
    }

    /**
     * How many bundle files set this target's `workspace.host` / `.profile`,
     * counting a file's top-level `workspace` block and its `targets[target]`
     * `workspace` block together (one file sets the field at most once each).
     * Read fresh from disk, per file, bypassing the merged view.
     *
     * The guard fails closed when either is set in more than one file: the CLI
     * merges include files "last file wins", and we only match that order if
     * our glob + sort mirror Go's exactly. Rather than trust the merge where it
     * decides which host the session token reaches, refuse when the host (or
     * profile) is contested across files.
     */
    public async getWorkspaceAuthFileCounts(
        target: string
    ): Promise<{hostFiles: number; profileFiles: number}> {
        const isSet = (workspace: unknown, key: "host" | "profile") => {
            if (typeof workspace !== "object" || workspace === null) {
                return false;
            }
            const value = (workspace as Record<string, unknown>)[key];
            return typeof value === "string" && value.trim() !== "";
        };

        let hostFiles = 0;
        let profileFiles = 0;
        await this.bundleFileSet.forEach(async (data) => {
            const blocks: unknown[] = [
                data?.workspace,
                data?.targets?.[target]?.workspace,
            ];
            if (blocks.some((w) => isSet(w, "host"))) {
                hostFiles++;
            }
            if (blocks.some((w) => isSet(w, "profile"))) {
                profileFiles++;
            }
        });
        return {hostFiles, profileFiles};
    }

    get defaultTarget() {
        return this.targets.then((targets) => {
            if (targets === undefined) {
                return undefined;
            }
            const defaultTarget = Object.keys(targets).find(
                (target) => targets[target].default
            );
            return defaultTarget;
        });
    }

    public setTarget(target: string | undefined) {
        this.target = target;
        this.resetCache();
    }

    /**
     * Set (or clear) the session host used as the fallback for a host-less
     * target, and reload so the pre-validate state reflects it. Called when the
     * environment credentials are pinned in Remote SSH mode.
     */
    public async setSessionHost(host: URL | undefined) {
        if (this.sessionHost?.toString() === host?.toString()) {
            return;
        }
        this.sessionHost = host;
        await this.stateCache.refresh();
    }

    protected readStateFromTarget(
        target?: BundleTarget
    ): BundlePreValidateState | undefined {
        if (target === undefined) {
            return undefined;
        }
        // Fall back to the session host (remote mode only) when the target sets
        // no host of its own, mirroring the credential guard's `session` case.
        const host =
            target.workspace?.host || this.sessionHost?.toString() || "";
        return {
            ...target,
            host: UrlUtils.normalizeHost(host),
            mode: target?.mode as BundlePreValidateState["mode"],
            authParams: undefined,
        };
    }

    /** See {@link BundleFileSet.hasNegatedGlobClass}. */
    public hasUnsupportedIncludeGlob(): Promise<boolean> {
        return this.bundleFileSet.hasNegatedGlobClass();
    }

    private getRawTargetData(bundle: BundleSchema, target: string) {
        const targetObject = Object.assign({}, bundle?.targets?.[target]);
        const globalWorkspace = Object.assign({}, bundle?.workspace);
        if (targetObject !== undefined) {
            targetObject.workspace = lodash.merge(
                globalWorkspace ?? {},
                targetObject.workspace
            );
        }
        return targetObject;
    }

    protected async readState() {
        if (this.target === undefined) {
            return {};
        }

        const bundle = await this.bundleFileSet.bundleDataCache.value;
        const targertData =
            this.readStateFromTarget(
                this.getRawTargetData(bundle, this.target)
            ) ?? {};

        return {
            ...targertData,
            preValidateBundleSchema: bundle,
        };
    }

    public async getFileToWrite(key: string) {
        const filesWithTarget: Uri[] = [];
        const filesWithConfig = (
            await this.bundleFileSet.findFile(async (data, file) => {
                const bundleTarget = data.targets?.[this.target ?? ""];
                if (bundleTarget === undefined) {
                    return false;
                }
                filesWithTarget.push(file);

                if (this.readStateFromTarget(bundleTarget) === undefined) {
                    return false;
                }
                return true;
            })
        ).map((file) => file.file);

        if (filesWithConfig.length > 1) {
            throw new Error(
                `Multiple files found to write the config ${key} for target ${this.target}`
            );
        }

        if (filesWithConfig.length === 0 && filesWithTarget.length === 0) {
            throw new Error(
                `No files found to write the config ${key} for target ${this.target}`
            );
        }

        return [...filesWithConfig, ...filesWithTarget][0];
    }

    public resetCache(): void {
        this.stateCache.set({});
    }

    public dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
