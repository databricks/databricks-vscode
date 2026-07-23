import {randomUUID} from "crypto";
import {EventEmitter, ExtensionContext, Event} from "vscode";
import {OverrideableConfigState} from "../configuration/models/OverrideableConfigModel";
import {Mutex} from "../locking";
import lodash from "lodash";
import {StoredFavoriteRef} from "../ui/unity-catalog/types";

/* eslint-disable @typescript-eslint/naming-convention */
type KeyInfo<V> = {
    location: "global" | "workspace";
    defaultValue?: V;
    getter?: (storage: StateStorage, value: V | undefined) => V | undefined;
    setter?: (storage: StateStorage, value: V | undefined) => V | undefined;
};

function withType<V>() {
    return function <D extends KeyInfo<V>>(data: D) {
        return data as typeof data & {_type: V};
    };
}

const StorageConfigurations = {
    "databricks.bundle.overrides": withType<{
        [k: string]: OverrideableConfigState;
    }>()({
        location: "workspace",
        defaultValue: {},
    }),

    "databricks.wsfs.skipSwitchToWorkspace": withType<boolean>()({
        location: "workspace",
        defaultValue: false,
    }),

    "databricks.autocompletion.skipConfigure": withType<boolean>()({
        location: "workspace",
        defaultValue: false,
    }),

    "databricks.fixedRandom": withType<number>()({
        location: "global",
        getter: (storage, value) => {
            if (value === undefined) {
                value = Math.random();
                storage.set("databricks.fixedRandom", value);
            }
            return value;
        },
    }),

    "databricks.fixedUUID": withType<string>()({
        location: "workspace",
        getter: (storage, value) => {
            if (value === undefined) {
                value = randomUUID();
                storage.set("databricks.fixedUUID", value);
            }
            return value;
        },
    }),

    "databricks.bundle.target": withType<string>()({
        location: "workspace",
    }),

    "databricks.activeProjectPath": withType<string>()({
        location: "workspace",
    }),

    "databricks.unityCatalog.favorites": withType<StoredFavoriteRef[]>()({
        location: "workspace",
        defaultValue: [],
    }),

    "databricks.lastInstalledExtensionVersion": withType<string>()({
        location: "global",
        defaultValue: "0.0.0",
    }),

    // Caches where Databricks AI tools were installed ("project" or "global")
    // so update/list commands know which scope and cwd to use. The presence of
    // `.databricks/aitools/skills/.state.json` remains the source of truth for
    // "are they installed?"; this only caches the resolved location.
    "databricks.aitools.installLocation": withType<"project" | "global">()({
        location: "global",
    }),

    // Tracks whether we've prompted the user to add the Databricks plugin to
    // Cursor. There's no reliable way to detect whether the plugin was actually
    // added, so this only records that we opened the install modal (on first
    // install in Cursor, or via the "add plugin" action). Used to hide the
    // add-plugin affordance once prompted.
    "databricks.aitools.cursorPluginPrompted": withType<boolean>()({
        location: "global",
        defaultValue: false,
    }),

    // Tracks whether we've already shown the one-time prompt offering to install
    // Databricks AI tools. Set once the prompt has been shown so we don't nag on
    // every activation.
    "databricks.aitools.installPrompted": withType<boolean>()({
        location: "global",
        defaultValue: false,
    }),
};

export type StorageKey = keyof typeof StorageConfigurations;
type Keys = StorageKey;
type ValueType<K extends Keys> = (typeof StorageConfigurations)[K]["_type"];
type GetterReturnType<D extends KeyInfo<any>> = D extends {getter: infer G}
    ? G extends (...args: any[]) => any
        ? ReturnType<G>
        : undefined
    : undefined;

type DefaultValue<K extends Keys> =
    "defaultValue" extends keyof (typeof StorageConfigurations)[K]
        ? ValueType<K>
        : GetterReturnType<(typeof StorageConfigurations)[K]>;

type KeyInfoWithType<V> = KeyInfo<V> & {
    _type: V;
    _getterType: V | never | undefined;
};
/* eslint-enable @typescript-eslint/naming-convention */

export class StateStorage {
    private mutex = new Mutex();
    private readonly changeEmitters = new Map<
        Keys,
        {
            emitter: EventEmitter<void>;
            onDidEmit: Event<void>;
        }
    >();

    constructor(private context: ExtensionContext) {}
    get skippedEnvsForDatabricksSdk() {
        return this.context.globalState.get<string[]>(
            "databricks.debugging.skipDatabricksSdkInstallForEnvs",
            []
        );
    }

    skipDatabricksSdkInstallForEnv(value: string) {
        const currentEnvs = this.skippedEnvsForDatabricksSdk;
        if (!currentEnvs.includes(value)) {
            currentEnvs.push(value);
        }
        this.context.globalState.update(
            "databricks.debugging.skipDatabricksSdkInstallForEnvs",
            currentEnvs
        );
    }
    private getStateObject(location: "global" | "workspace") {
        switch (location) {
            case "workspace":
                return this.context.workspaceState;
            case "global":
                return this.context.globalState;
        }
    }

    onDidChange<K extends Keys>(key: K): Event<void> {
        if (!this.changeEmitters.has(key)) {
            const emitter = new EventEmitter<void>();
            this.changeEmitters.set(key, {
                emitter,
                onDidEmit: emitter.event,
            });
        }
        return this.changeEmitters.get(key)!.onDidEmit;
    }

    get<K extends Keys>(key: K): ValueType<K> | DefaultValue<K> {
        const details = StorageConfigurations[key] as KeyInfoWithType<
            ValueType<K>
        >;

        const value =
            this.getStateObject(details.location).get<ValueType<K>>(key) ??
            details.defaultValue;

        const returnValue = (
            details.getter !== undefined ? details.getter(this, value) : value
        ) as ValueType<K> | DefaultValue<K>;

        if (typeof value === "object") {
            return lodash.cloneDeep(returnValue);
        }
        return returnValue;
    }

    @Mutex.synchronise("mutex")
    async set<K extends Keys>(key: K, value: ValueType<K> | undefined) {
        const details = StorageConfigurations[key] as KeyInfoWithType<
            ValueType<K>
        >;
        value =
            details.setter !== undefined ? details.setter(this, value) : value;
        const oldValue = this.get(key);
        if (lodash.isEqual(oldValue, value)) {
            return;
        }
        await this.getStateObject(details.location).update(key, value);
        this.changeEmitters.get(key)?.emitter.fire();
    }

    /** All configured storage keys and where each is persisted. */
    get storageKeys(): Array<{key: Keys; location: "global" | "workspace"}> {
        return (Object.keys(StorageConfigurations) as Keys[]).map((key) => ({
            key,
            location: StorageConfigurations[key].location,
        }));
    }

    /**
     * Remove the persisted value for a key so it reverts to its default. Unlike
     * {@link set}, this clears the raw stored entry (rather than writing a
     * value), which is what a "reset state" action wants.
     */
    @Mutex.synchronise("mutex")
    async reset<K extends Keys>(key: K) {
        const details = StorageConfigurations[key] as KeyInfoWithType<
            ValueType<K>
        >;
        await this.getStateObject(details.location).update(key, undefined);
        this.changeEmitters.get(key)?.emitter.fire();
    }
}
