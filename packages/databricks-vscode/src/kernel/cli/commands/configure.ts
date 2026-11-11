import type { Cli, CliCallContext } from "../Cli";

export interface ConfigureOptions {
    readonly host: string;
    readonly profile: string;
    readonly token: string;
}

/**
 * `databricks configure`: writes a PAT profile. When stdin isn't a terminal
 * the CLI reads the token from it, so the token never appears in argv or the
 * logs. The CLI writes the config file, so the extension makes no backups.
 * The file is the one `DATABRICKS_CONFIG_FILE` names in `ctx.env`.
 */
export async function configure(
    cli: Cli,
    options: ConfigureOptions,
    ctx: CliCallContext,
): Promise<void> {
    await cli.exec(["configure", "--host", options.host, "--profile", options.profile], ctx, {
        input: `${options.token}\n`,
    });
}
