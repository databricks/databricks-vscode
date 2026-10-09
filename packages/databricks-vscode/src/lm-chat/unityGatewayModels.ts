import type {CancellationToken, LanguageModelChatInformation} from "vscode";
import type {AiGatewayClient, ModelService} from "@databricks/sdk-aigateway/v1";

// Unity Gateway doesn't report model limits yet.
const MAX_INPUT_TOKENS = 128_000;
const MAX_OUTPUT_TOKENS = 4_096;
// VS Code doesn't time out model listing, and a hung call blocks the vendor.
const LIST_TIMEOUT_MS = 60_000;

/**
 * Lists the `system.ai` models that name Unity Gateway's unified Responses
 * route, the only API the provider speaks. Rejects on failure (an `ApiError`
 * for HTTP errors).
 */
export async function listUnityGatewayModels(
    client: AiGatewayClient,
    token: CancellationToken,
    timeoutMs = LIST_TIMEOUT_MS
): Promise<LanguageModelChatInformation[]> {
    const controller = new AbortController();
    const cancellation = token.onCancellationRequested(() =>
        controller.abort()
    );
    const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(timeoutMs),
    ]);
    try {
        // The SDK only hands the signal on once it has the auth headers, and
        // a v1 token refresh can hang.
        return await untilAborted(listModels(client, signal), signal);
    } finally {
        cancellation.dispose();
    }
}

async function listModels(
    client: AiGatewayClient,
    signal: AbortSignal
): Promise<LanguageModelChatInformation[]> {
    const models: LanguageModelChatInformation[] = [];
    for await (const service of client.listModelServicesIter(
        {parent: "schemas/system.ai", pageSize: 100},
        {signal}
    )) {
        const model = toModelInformation(service);
        if (model !== undefined) {
            models.push(model);
        }
    }
    return models.sort((a, b) => a.name.localeCompare(b.name));
}

function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
        const abort = () => reject(signal.reason);
        if (signal.aborted) {
            abort();
        }
        signal.addEventListener("abort", abort, {once: true});
        promise
            .then(resolve, reject)
            .finally(() => signal.removeEventListener("abort", abort));
    });
}

function toModelInformation(
    service: ModelService
): LanguageModelChatInformation | undefined {
    // A few models the unified route serves don't name it. They're left out
    // until the listing does.
    const id = service.name?.replace(/^model-services\//, "");
    if (!service.supportedApiTypes?.includes("mlflow/v1/responses") || !id) {
        return undefined;
    }
    return {
        id,
        name: id.replace(/^system\.ai\./, ""),
        family: id.split(".").at(-1) ?? id,
        version: "1",
        detail: "Databricks",
        maxInputTokens: MAX_INPUT_TOKENS,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        capabilities: {toolCalling: true, imageInput: false},
        isUserSelectable: true,
    };
}
