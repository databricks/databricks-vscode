import type { Credentials } from "@databricks/sdk-auth";
import { createDefault } from "@databricks/sdk-core/clientinfo";

/** The User-Agent the SDK's clients send: its defaults (which name the extension, see `createKernel`) and the auth type. */
export function buildUserAgent(credentials: Credentials | undefined): string {
    return createDefault()
        .with({ key: "auth", value: credentials?.name() ?? "default" })
        .toString();
}
