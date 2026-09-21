import {type iam} from "@databricks/sdk-experimental";

export async function drainAsyncIterable<T>(
    iter: AsyncIterable<T>
): Promise<T[]> {
    const out: T[] = [];
    for await (const item of iter) {
        out.push(item);
    }
    return out;
}

export function isOwnedByUser(
    owner: string | undefined,
    user: iam.User | undefined
): boolean {
    if (!owner || !user) {
        return false;
    }
    if (owner === user.userName) {
        return true;
    }
    // TODO: Check if user is owner through group? like: return (user.groups ?? []).some((g) => g.display === owner);
    return false;
}

export function formatTs(ms: number | undefined): string | undefined {
    if (ms === undefined) {
        return undefined;
    }
    return (
        new Date(ms).toISOString().replace("T", " ").substring(0, 19) + " UTC"
    );
}
