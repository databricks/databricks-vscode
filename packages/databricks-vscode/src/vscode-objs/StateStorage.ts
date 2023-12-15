import {randomUUID} from "crypto";
import {EventEmitter, ExtensionContext, Event} from "vscode";
import {OverrideableConfig} from "../configuration/types";
import {Mutex} from "../locking";
import lodash from "lodash";

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
        [k: string]: OverrideableConfig;
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

    "databricks.debugging.skipDbConnectInstallForEnvs": withType<string[]>()({
        location: "global",
        defaultValue: [],
        setter: (storage, value) => {
            if (value === undefined || value.length === 0) {
                return undefined;
            }
            const currentEnvs: string[] = storage.get(
                "databricks.debugging.skipDbConnectInstallForEnvs"
            );
            if (!currentEnvs.includes(value[0])) {
                currentEnvs.push(value[0]);
            }
            return currentEnvs;
        },
    }),

    "databricks.bundle.target": withType<string>()({
        location: "workspace",
    }),

    "databricks.lastInstalledExtensionVersion": withType<string>()({
        location: "workspace",
        defaultValue: "0.0.0",
    }),
};

type Keys = keyof typeof StorageConfigurations;
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
}
