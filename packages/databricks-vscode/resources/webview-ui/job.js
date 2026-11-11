// The "Databricks Job Run" page (RUN-02), run under the panel's content
// security policy. The extension posts {fn, args}; only the handlers below
// can be called.

// The nonce this script runs with. The exported notebook's own scripts get
// it too, because the frame's `srcdoc` document inherits this page's policy.
const nonce = document.currentScript ? document.currentScript.nonce : "";

function enableRefreshResultsButton() {
    const button = document.getElementById("refreshResults");
    button.classList.remove("vscode-disabled");
    button.disabled = false;
    button.innerText = "Refresh Results";
}

function formatDuration(duration) {
    if (duration < 0 || duration === undefined) {
        return "-";
    }
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

/** Gives every script of the exported notebook the page's nonce, so it can run in the sandboxed frame. */
function withNonce(html) {
    return nonce ? html.replace(/<script\b/gi, `<script nonce="${nonce}"`) : html;
}

let details = {};

const page = {
    updateDetails(next) {
        details = next;
        const runId = document.getElementById("run-id");
        runId.setAttribute("href", next.runUrl || "#");
        runId.innerText = next.runId;

        const cluster = document.getElementById("run-cluster");
        cluster.setAttribute("href", next.clusterUrl || "#");
        cluster.innerText = next.clusterId;
        document
            .getElementById("compute-section")
            .classList.toggle("serverless", next.serverless === true);

        document.getElementById("run-started").innerText = next.started;
        document.getElementById("run-ended").innerText = next.ended;
        document.getElementById("run-status").innerText = next.status;
        document.getElementById("run-duration").innerText = formatDuration(next.duration);
    },

    setOutputHtml(html) {
        enableRefreshResultsButton();
        const cl = document.getElementById("output").classList;
        cl.remove("spinner");
        cl.add("html");
        // `srcdoc`, not `document.write`: without allow-same-origin the page can't reach into the frame.
        document.getElementById("frame").srcdoc = withNonce(html);
    },

    setStdout(stdout) {
        enableRefreshResultsButton();
        const cl = document.getElementById("output").classList;
        cl.remove("spinner");
        cl.add("stdout");
        document.getElementById("stdout").innerText = stdout;
    },

    setError(message, stack) {
        const cl = document.getElementById("output").classList;
        cl.remove("spinner");
        cl.add("error");
        document.getElementById("error-description").innerText = message || "";
        // HTML from ansi-to-html with escapeXML; scripts in it couldn't run without the nonce anyway.
        document.getElementById("error-stack").innerHTML = stack || "";
    },
};

const vscode = acquireVsCodeApi();

window.addEventListener("message", (event) => {
    const { fn, args } = event.data || {};
    if (typeof fn === "string" && Object.hasOwn(page, fn) && Array.isArray(args)) {
        page[fn](...args);
    }
});

document.getElementById("refreshResults").addEventListener("click", (e) => {
    vscode.postMessage({ command: "refresh_results", args: { runId: details.runId } });
    e.target.classList.add("vscode-disabled");
    e.target.disabled = true;
    e.target.innerText = "Refreshing results...";
});
