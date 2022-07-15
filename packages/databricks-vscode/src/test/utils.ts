import {ProviderResult} from "vscode";

export async function resolveProviderResult<T>(
    result: ProviderResult<T>
): Promise<T | null | undefined> {
    if (!result) {
        return result;
    }

    if ("then" in result) {
        return await result;
    } else {
        return result;
    }
}
