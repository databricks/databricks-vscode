import {ProviderResult} from "vscode";

export async function resolveProviderResult<T>(
    result: ProviderResult<T>
): Promise<T | null | undefined> {
    if (!result) {
        return result;
    }

    if (Object.prototype.hasOwnProperty.call(result, "then")) {
        return await result;
    } else {
        return result;
    }
}
