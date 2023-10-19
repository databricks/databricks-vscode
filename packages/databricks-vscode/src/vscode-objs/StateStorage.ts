import {randomUUID} from "crypto";
import {ExtensionContext} from "vscode";
import {OverrideableConfigs} from "../configuration/types";

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

const Keys = {
    "databricks.bundle.overrides": withType<{
        [k: string]: OverrideableConfigs;
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
};

type ValueType<K extends keyof typeof Keys> = (typeof Keys)[K]["_type"];
type GetterReturnType<D extends KeyInfo<any>> = D extends {getter: infer G}
    ? G extends (...args: any[]) => any
        ? ReturnType<G>
        : undefined
    : undefined;

type DefaultValue<K extends keyof typeof Keys> =
    "defaultValue" extends keyof (typeof Keys)[K]
        ? ValueType<K>
        : GetterReturnType<(typeof Keys)[K]>;

type KeyInfoWithType<V> = KeyInfo<V> & {
    _type: V;
    _getterType: V | never | undefined;
};
/* eslint-enable @typescript-eslint/naming-convention */

export class StateStorage {
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

    get<K extends keyof typeof Keys>(key: K): ValueType<K> | DefaultValue<K> {
        const details = Keys[key] as KeyInfoWithType<ValueType<K>>;

        const value =
            this.getStateObject(details.location).get<ValueType<K>>(key) ??
            details.defaultValue;

        return (
            details.getter !== undefined ? details.getter(this, value) : value
        ) as ValueType<K> | DefaultValue<K>;
    }

    async set<K extends keyof typeof Keys>(
        key: K,
        value: ValueType<K> | undefined
    ) {
        const details = Keys[key] as KeyInfoWithType<ValueType<K>>;
        value =
            details.setter !== undefined ? details.setter(this, value) : value;
        await this.getStateObject(details.location).update(key, value);
        return;
    }
}
