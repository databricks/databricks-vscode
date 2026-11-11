import type { AiGatewayClient, ModelService } from "@databricks/sdk-aigateway/v1";
import type { Disposable, Event } from "../../platform/event";
import type { Logger } from "../../platform/log";
import { Resource, type ResourceState, type State } from "../../platform/reactive";
import { abortable } from "../../platform/timers";
import { calls, type ApiClients } from "../connection/ApiClients";
import type { ConnectionState } from "../connection/ConnectionService";
import {
    UnityGatewayModelLimitsClient,
    type ModelTokenLimits,
} from "./UnityGatewayModelLimitsClient";

/** The models' vendor in VS Code Chat, declared in `contributes.languageModelChatProviders`. */
export const UNITY_GATEWAY_VENDOR = "databricks";

/** A model that Unity Gateway serves on its unified Responses route. */
export interface UnityGatewayModel {
    /** The model service, for example `system.ai.claude-sonnet`. */
    readonly id: string;
    /** The id without the `system.ai.` prefix. */
    readonly name: string;
    readonly family: string;
    /** The context window and output limit the gateway reports; most models have none. */
    readonly limits?: ModelTokenLimits;
}

export type UnityGatewayModelsState = ResourceState<readonly UnityGatewayModel[]>;

// VS Code doesn't time out model listing, and a hung call blocks the vendor.
const LIST_TIMEOUT_MS = 60_000;
// The listing waits for the limits, which only refine the models, so not for long.
const LIMITS_TIMEOUT_MS = 10_000;

/**
 * The models of the Unity Gateway sign-in's workspace: the `system.ai` model
 * services that name the unified Responses route, the only API chat speaks,
 * with the token limits the gateway reports for some of them.
 * Listed when the sign-in connects, once per connection; a failed listing is
 * tried again on the next `list()`. Idle while signed out.
 */
export class UnityGatewayModels implements State<UnityGatewayModelsState>, Disposable {
    private readonly resource: Resource<readonly UnityGatewayModel[]>;
    readonly onDidChange: Event<UnityGatewayModelsState>;
    private api?: ApiClients;
    private readonly subscription: Disposable;

    constructor(
        private readonly gateway: State<ConnectionState>,
        private readonly log: Logger,
        private readonly timeoutMs = LIST_TIMEOUT_MS,
        private readonly limitsTimeoutMs = LIMITS_TIMEOUT_MS,
    ) {
        this.resource = new Resource((signal) => this.load(signal));
        this.onDidChange = this.resource.onDidChange;
        this.subscription = gateway.onDidChange(() => this.sync());
        this.sync();
    }

    get value(): UnityGatewayModelsState {
        return this.resource.value;
    }

    /**
     * The models, for chat. Lists them again after a failure, and rejects with
     * its error. Empty while signed out, and when the sign-in changes while
     * they're listed: that resets the listing.
     */
    async list(): Promise<readonly UnityGatewayModel[]> {
        if (this.resource.value.status === "error") {
            this.resource.invalidate("retry after a failed listing");
        }
        const state = await this.resource.settled();
        if (state.status === "error") {
            throw state.error;
        }
        return state.status === "ready" ? state.value : [];
    }

    private sync() {
        const s = this.gateway.value;
        const api = s.status === "connected" ? s.connection.api : undefined;
        if (api === this.api) {
            return;
        }
        this.api = api;
        if (api === undefined) {
            this.resource.reset();
        } else {
            this.resource.invalidate("Unity Gateway connected");
        }
    }

    private async load(signal: AbortSignal): Promise<readonly UnityGatewayModel[]> {
        // Set for every load: only a connection starts one, and a sign-out resets it.
        const api = this.api!;
        // Loaded on first use: activation doesn't pay for the client.
        const { AiGatewayClient } = await import("@databricks/sdk-aigateway/v1");
        // Superseded while the client loaded: don't start a listing that nothing waits for.
        signal.throwIfAborted();
        const timeout = AbortSignal.timeout(this.timeoutMs);
        const limited = AbortSignal.any([signal, timeout]);
        // Stops the limits when the listing fails: nothing would read them.
        const listing = new AbortController();
        const limits = this.listLimits(api, AbortSignal.any([signal, listing.signal]));
        try {
            // The SDK only hands the signal on once it has the auth headers, and getting a token can hang.
            const models = await abortable(listModels(api.get(AiGatewayClient), limited), limited);
            return withLimits(models, await limits);
        } catch (e) {
            if (timeout.aborted && !signal.aborted) {
                throw new Error(
                    `Unity Gateway didn't list its models within ${this.timeoutMs / 1000} seconds.`,
                    { cause: e },
                );
            }
            throw e;
        } finally {
            listing.abort();
        }
    }

    /** Never rejects: without limits, the models are still listed. */
    private async listLimits(
        api: ApiClients,
        stopped: AbortSignal,
    ): Promise<ReadonlyMap<string, ModelTokenLimits>> {
        const timeout = AbortSignal.timeout(this.limitsTimeoutMs);
        const limited = AbortSignal.any([stopped, timeout]);
        try {
            // As for the models, getting a token can hang.
            return await abortable(
                api.get(UnityGatewayModelLimitsClient).list(calls.read({ signal: limited })),
                limited,
            );
        } catch (e) {
            // Stopped: superseded, or the listing failed.
            if (timeout.aborted && !stopped.aborted) {
                this.log.warn(
                    `Unity Gateway didn't list its model token limits within ${this.limitsTimeoutMs / 1000} seconds`,
                );
            } else if (!stopped.aborted) {
                this.log.warn("Can't list Unity Gateway's model token limits", e);
            }
            return new Map();
        }
    }

    dispose(): void {
        this.subscription.dispose();
        this.resource.dispose();
    }
}

async function listModels(
    client: AiGatewayClient,
    signal: AbortSignal,
): Promise<readonly UnityGatewayModel[]> {
    const models: UnityGatewayModel[] = [];
    for await (const service of client.listModelServicesIter(
        { parent: "schemas/system.ai", pageSize: 100 },
        calls.read({ signal }),
    )) {
        const model = toModel(service);
        if (model !== undefined) {
            models.push(model);
        }
    }
    models.sort((a, b) => a.name.localeCompare(b.name));
    return models;
}

function withLimits(
    models: readonly UnityGatewayModel[],
    limits: ReadonlyMap<string, ModelTokenLimits>,
): readonly UnityGatewayModel[] {
    return models.map((model) => {
        const listed = limits.get(model.id);
        return listed === undefined ? model : { ...model, limits: listed };
    });
}

function toModel(service: ModelService): UnityGatewayModel | undefined {
    // A few models the unified route serves don't name it. They're left out until the listing does.
    const id = service.name?.replace(/^model-services\//, "");
    if (!service.supportedApiTypes?.includes("mlflow/v1/responses") || !id) {
        return undefined;
    }
    return { id, name: id.replace(/^system\.ai\./, ""), family: id.split(".").at(-1) ?? id };
}
