import { parseCliVersion, type CliVersion } from "../CliPaths";
import type { Cli, CliCallContext } from "../Cli";

/** `databricks version`; undefined when the binary is missing or its output unreadable. */
export async function cliVersion(cli: Cli, ctx: CliCallContext): Promise<CliVersion | undefined> {
    try {
        const { stdout } = await cli.exec(["version", "--output", "json"], ctx);
        return parseCliVersion(stdout);
    } catch {
        return undefined;
    }
}
