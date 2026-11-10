import { window, type TreeDataProvider } from "vscode";
import { SIGN_IN } from "../../kernel/connection/commands";
import type { Feature } from "../../kernel/feature";
import { SshTunnel } from "./SshTunnel";

export const START_TUNNEL = "databricks.ssh.startTunnel";
export const SSH_TUNNEL_VIEW = "sshTunnelView";
/** The same view, shown below the bundle views once a bundle target is set. */
export const SSH_TUNNEL_PROJECT_VIEW = "sshTunnelProjectView";

/** Why a session window can't start a tunnel: the CLI would run on the compute. */
const TUNNEL_FROM_A_SESSION = {
    unavailable:
        "This window runs on Databricks compute, and the SSH tunnel opens its window through your own machine's editor and SSH configuration.",
    instead: "Open a local window (File > New Window) and start the tunnel there.",
} as const;

/**
 * The SSH tunnel (SSH-01, SSH-02), in window scope: the "SSH Tunnel" view
 * and "Start SSH tunnel" work with and without a folder, signed in or not.
 * The view is in two places (above Project without a bundle target, below the
 * bundle views with one), and each place is its own view ID.
 */
export const ssh: Feature = {
    id: "ssh",
    session: {
        [START_TUNNEL]: TUNNEL_FROM_A_SESSION,
        [SSH_TUNNEL_VIEW]: TUNNEL_FROM_A_SESSION,
        [SSH_TUNNEL_PROJECT_VIEW]: TUNNEL_FROM_A_SESSION,
    },

    register(ctx) {
        // Always empty: the view shows its welcome content, with the button.
        const empty: TreeDataProvider<never> = {
            getTreeItem: (item) => item,
            getChildren: () => [],
        };
        ctx.subscriptions.push(
            window.registerTreeDataProvider(SSH_TUNNEL_VIEW, empty),
            window.registerTreeDataProvider(SSH_TUNNEL_PROJECT_VIEW, empty),
        );

        ctx.commands.register(START_TUNNEL, () =>
            new SshTunnel({
                kernel: ctx.kernel,
                log: ctx.log,
                signIn: () => ctx.commands.execute(SIGN_IN, undefined),
            }).start(),
        );
    },
};
