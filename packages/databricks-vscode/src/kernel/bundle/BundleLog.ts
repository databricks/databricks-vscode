import type { Disposable } from "../../platform/event";
import type { LogChannel } from "../../platform/log";

/** The frozen name of the channel: the e2e specs select it. */
export const BUNDLE_LOG_CHANNEL_NAME = "Databricks Bundle Logs";

/** A `vscode.LogOutputChannel`, as far as the bundle log uses it. */
export interface BundleLogChannel extends LogChannel {
    show(preserveFocus?: boolean): void;
    dispose(): void;
}

/**
 * The "Databricks Bundle Logs" channel: what the bundle CLI commands did, in
 * the old wording ("Bundle configuration refreshed."). The channel is created
 * when the first project session starts, so windows without a bundle don't
 * get an empty channel, and it then lives as long as the window.
 */
export class BundleLog implements Disposable {
    private channel?: BundleLogChannel;

    constructor(private readonly create: () => BundleLogChannel) {}

    /** Creates the channel if it doesn't exist yet. */
    open(): BundleLogChannel {
        this.channel ??= this.create();
        return this.channel;
    }

    info(message: string): void {
        this.open().info(message);
    }

    warn(message: string): void {
        this.open().warn(message);
    }

    error(message: string): void {
        this.open().error(message);
    }

    /** Logs a CLI's stderr line by line, skipping blank lines. */
    output(text: string, level: "info" | "error" = "info"): void {
        for (const line of text.split(/\r?\n/)) {
            if (line.trim() !== "") {
                this.open()[level](line);
            }
        }
    }

    show(): void {
        this.open().show(true);
    }

    dispose(): void {
        this.channel?.dispose();
        this.channel = undefined;
    }
}
