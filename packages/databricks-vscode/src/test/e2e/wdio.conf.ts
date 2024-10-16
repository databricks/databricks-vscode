/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-console */
import type {Options} from "@wdio/types";

// eslint-disable-next-line @typescript-eslint/no-var-requires
import video from "wdio-video-reporter";
import path from "node:path";
import {fileURLToPath} from "url";
import assert from "assert";
import fs from "fs/promises";
import {Config, WorkspaceClient} from "@databricks/databricks-sdk";
import * as ElementCustomCommands from "./customCommands/elementCustomCommands.ts";
import {execFile as execFileCb} from "node:child_process";
import {cpSync, mkdirSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import packageJson from "../../../package.json" assert {type: "json"};
import {sleep} from "wdio-vscode-service";
import {glob} from "glob";
import {getUniqueResourceName} from "./utils/commonUtils.ts";
import {promisify} from "node:util";
import {attempt} from "lodash";

const WORKSPACE_PATH = path.resolve(tmpdir(), "test-root");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const {version, name, engines} = packageJson;

const EXTENSION_DIR = path.resolve(tmpdir(), "extension test", "extension");
const VSIX_PATH = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    `${name}-${version}.vsix`
);
const VSCODE_STORAGE_DIR = path.resolve(tmpdir(), "user-data-dir");

const metaCharsRegExp = /([()\][%!^"`<>&|;, *?])/g;

export function escapeCommand(arg: string): string {
    // Escape meta chars
    arg = arg.replace(metaCharsRegExp, "^$1");

    return arg;
}

export function escapeArgument(arg: string): string {
    // Convert to string
    arg = `${arg}`;

    // Algorithm below is based on https://qntm.org/cmd

    // Sequence of backslashes followed by a double quote:
    // double up all the backslashes and escape the double quote
    arg = arg.replace(/(\\*)"/g, '$1$1\\"');

    // Sequence of backslashes followed by the end of the string
    // (which will become a double quote later):
    // double up all the backslashes
    arg = arg.replace(/(\\*)$/, "$1$1");

    // All other backslashes occur literally

    // Quote the whole thing:
    arg = `"${arg}"`;

    // Escape meta chars
    arg = arg.replace(metaCharsRegExp, "^$1");

    return arg;
}

const execFile = async (
    file: string,
    args: string[],
    options: any = {}
): Promise<{
    stdout: string;
    stderr: string;
}> => {
    if (process.platform === "win32") {
        const realArgs = [escapeCommand(file)]
            .concat(args.map(escapeArgument).join(" "))
            .join(" ");

        file = "cmd.exe";
        args = ["/d", "/s", "/c", `"${realArgs}"`];
        console.log("execFile", file, args);
        options = {...options, windowsVerbatimArguments: true};
    }
    const res = await promisify(execFileCb)(file, args, options);
    return {stdout: res.stdout.toString(), stderr: res.stderr.toString()};
};

export const config: Options.Testrunner = {
    //
    // ====================
    // Runner Configuration
    // ====================
    //
    //
    // =====================
    // ts-node Configurations
    // =====================
    //
    // You can write tests using TypeScript to get autocompletion and type safety.
    // You will need typescript and ts-node installed as devDependencies.
    // WebdriverIO will automatically detect if these dependencies are installed
    // and will compile your config and tests for you.
    // If you need to configure how ts-node runs please use the
    // environment variables for ts-node or use wdio config's autoCompileOpts section.
    //

    autoCompileOpts: {
        autoCompile: true,
        // see https://github.com/TypeStrong/ts-node#cli-and-programmatic-options
        // for all available options
        tsNodeOpts: {
            transpileOnly: true,
            project: path.join(__dirname, "tsconfig.json"),
        },
    },

    //
    // ==================
    // Specify Test Files
    // ==================
    // Define which test specs should run. The pattern is relative to the directory
    // from which `wdio` was called.
    //
    // The specs are defined as an array of spec files (optionally using wildcards
    // that will be expanded). The test for each spec file will be run in a separate
    // worker process. In order to have a group of spec files run in the same worker
    // process simply enclose them in an array within the specs array.
    //
    // If you are calling `wdio` from an NPM script (see https://docs.npmjs.com/cli/run-script),
    // then the current working directory is where your `package.json` resides, so `wdio`
    // will be called from there.
    //
    specs: [path.join(__dirname, "**", "*.e2e.ts")],
    // Patterns to exclude.
    exclude: [
        // 'path/to/excluded/files'
    ],

    //
    // ============
    // Capabilities
    // ============
    // Define your capabilities here. WebdriverIO can run multiple capabilities at the same
    // time. Depending on the number of capabilities, WebdriverIO launches several test
    // sessions. Within your capabilities you can overwrite the spec and exclude options in
    // order to group specific specs to a specific capability.
    //
    // First, you can define how many instances should be started at the same time. Let's
    // say you have 3 different capabilities (Chrome, Firefox, and Safari) and you have
    // set maxInstances to 1; wdio will spawn 3 processes. Therefore, if you have 10 spec
    // files and you set maxInstances to 10, all spec files will get tested at the same time
    // and 30 processes will get spawned. The property handles how many capabilities
    // from the same test should run tests.
    //
    maxInstances: 1,

    //
    // If you have trouble getting all important capabilities together, check out the
    // Sauce Labs platform configurator - a great tool to configure your capabilities:
    // https://saucelabs.com/platform/platform-configurator
    //
    get capabilities() {
        return [
            {
                "browserName": "vscode",
                "browserVersion": engines.vscode.replace("^", ""),
                "wdio:vscodeOptions": {
                    extensionPath: path.resolve(
                        __dirname,
                        "resources",
                        "dummy-test"
                    ),
                    storagePath: VSCODE_STORAGE_DIR,
                    vscodeArgs: {
                        extensionsDir: EXTENSION_DIR,
                        disableExtensions: false,
                    },
                    workspacePath: WORKSPACE_PATH,
                    userSettings: {
                        "editor.fontSize": 14,
                        "files.simpleDialog.enable": true,
                        "workbench.editor.enablePreview": true,
                        "window.newWindowDimensions": "default",
                        "window.openFoldersInNewWindow": "off",
                        "extensions.autoCheckUpdates": false,
                        "extensions.autoUpdate": false,
                    },
                },
            },
        ];
    },

    //
    // ===================
    // Test Configurations
    // ===================
    // Define all options that are relevant for the WebdriverIO instance here
    //
    // Level of logging verbosity: trace | debug | info | warn | error | silent
    logLevel: "debug",

    outputDir: "logs",

    //
    // Set specific log levels per logger
    // loggers:
    // - webdriver, webdriverio
    // - @wdio/browserstack-service, @wdio/devtools-service, @wdio/sauce-service
    // - @wdio/mocha-framework, @wdio/jasmine-framework
    // - @wdio/local-runner
    // - @wdio/sumologic-reporter
    // - @wdio/cli, @wdio/config, @wdio/utils
    // Level of logging verbosity: trace | debug | info | warn | error | silent
    // logLevels: {
    //     webdriver: 'info',
    //     '@wdio/appium-service': 'info'
    // },
    //
    // If you only want to run your tests until a specific amount of tests have failed use
    // bail (default is 0 - don't bail, run all tests).
    bail: 0,
    //
    // Set a base URL in order to shorten url command calls. If your `url` parameter starts
    // with `/`, the base url gets prepended, not including the path portion of your baseUrl.
    // If your `url` parameter starts without a scheme or `/` (like `some/path`), the base url
    // gets prepended directly.
    baseUrl: "http://localhost",
    //
    // Default timeout for all waitFor* commands.
    waitforTimeout: 10000,
    //
    // Default timeout in milliseconds for request
    // if browser driver or grid doesn't send response
    connectionRetryTimeout: 120000,
    //
    // Default request retries count
    connectionRetryCount: 3,
    //
    // Test runner services
    // Services take over a specific job you don't want to take care of. They enhance
    // your test setup with almost no effort. Unlike plugins, they don't add new
    // commands. Instead, they hook themselves up into the test process.
    services: [
        [
            "vscode",
            {cachePath: path.join(process.cwd(), "tmp", "wdio-vscode-service")},
        ],
    ],

    // cahePath above is for vscode binaries, this one is for the chromedriver
    cacheDir: path.join(process.cwd(), "tmp", "wdio-vscode-service"),

    // Framework you want to run your specs with.
    // The following are supported: Mocha, Jasmine, and Cucumber
    // see also: https://webdriver.io/docs/frameworks
    //
    // Make sure you have the wdio adapter package for the specific framework installed
    // before running any tests.
    framework: "mocha",
    //
    // The number of times to retry the entire specfile when it fails as a whole
    specFileRetries: 0,
    //
    // Delay in seconds between the spec file retry attempts
    specFileRetriesDelay: 0,
    //
    // Whether or not retried specfiles should be retried immediately or deferred to the end of the queue
    specFileRetriesDeferred: true,
    //
    // Test reporter for stdout.
    // The only one supported by default is 'dot'
    // see also: https://webdriver.io/docs/dot-reporter
    reporters: [
        "spec",
        [
            video,
            {
                saveAllVideos: false, //only saves videos for failed tests
                videoSlowdownMultiplier: 2,
            },
        ],
    ],

    //
    // Options to be passed to Mocha.
    // See the full list at http://mochajs.org/
    mochaOpts: {
        ui: "bdd",
        timeout: 60000,
    },
    //
    // =====
    // Hooks
    // =====
    // WebdriverIO provides several hooks you can use to interfere with the test process in order to enhance
    // it and to build services around it. You can either apply a single function or an array of
    // methods to it. If one of them returns with a promise, WebdriverIO will wait until that promise got
    // resolved to continue.
    /**
     * Gets executed once before all workers get launched.
     * @param {Object} config wdio configuration object
     * @param {Array.<Object>} capabilities list of capabilities details
     */
    onPrepare: async function () {
        try {
            mkdirSync(EXTENSION_DIR, {recursive: true});

            const config = new Config({});
            await config.ensureResolved();

            assert(config.host, "Config host must be set");
            assert(config.token, "Config token must be set");

            assert(
                process.env["TEST_DEFAULT_CLUSTER_ID"],
                "Environment variable TEST_DEFAULT_CLUSTER_ID must be set"
            );

            await fs.rm(WORKSPACE_PATH, {recursive: true, force: true});
            console.log(`Creating vscode workspace folder: ${WORKSPACE_PATH}`);
            await fs.mkdir(WORKSPACE_PATH, {recursive: true});

            const client = getWorkspaceClient(config);
            await startCluster(client, process.env["TEST_DEFAULT_CLUSTER_ID"]);

            process.env.DATABRICKS_HOST = config.host!;
            process.env.DATABRICKS_VSCODE_INTEGRATION_TEST = "true";
        } catch (e) {
            console.error(e);
            process.exit(1);
        }
    },

    /**
     * Gets executed before a worker process is spawned and can be used to initialise specific service
     * for that worker as well as modify runtime environments in an async fashion.
     * @param  {String} cid      capability id (e.g 0-0)
     * @param  {Array.<Object>} capabilities     object containing capabilities for session that will be spawn in the worker
     * @param  {[type]} specs    specs to be run in the worker process
     * @param  {[type]} args     object that will be merged with the main configuration once worker is initialized
     * @param  {[type]} execArgv list of string arguments passed to the worker process
     */
    onWorkerStart: async function (cid, capabilities) {
        const sdkConfig = new Config({});
        await sdkConfig.ensureResolved();

        const testRoot = path.join(
            WORKSPACE_PATH,
            getUniqueResourceName("root_dir")
        );
        await fs.mkdir(testRoot, {
            recursive: true,
        });
        const configFile = await writeDatabricksConfig(sdkConfig, testRoot);

        process.env.DATABRICKS_CONFIG_FILE = configFile;
        process.env.WORKSPACE_PATH = testRoot;
        if (capabilities["wdio:vscodeOptions"]) {
            capabilities["wdio:vscodeOptions"].workspacePath = testRoot;
        }
    },

    /**
     * Gets executed just after a worker process has exited.
     * @param  {String} cid      capability id (e.g 0-0)
     * @param  {Number} exitCode 0 - success, 1 - fail
     * @param  {[type]} specs    specs to be run in the worker process
     * @param  {Number} retries  number of retries used
     */
    // onWorkerEnd: function (cid, exitCode, specs, retries) {
    // },

    /**
     * Gets executed just before initialising the webdriver session and test framework. It allows you
     * to manipulate configurations depending on the capability or spec.
     * @param {Object} config wdio configuration object
     * @param {Array.<Object>} capabilities list of capabilities details
     * @param {Array.<String>} specs List of spec file paths that are to be run
     * @param {String} cid worker id (e.g. 0-0)
     */
    beforeSession: async function (config, capabilities) {
        const binary: string = capabilities["wdio:vscodeOptions"]
            .binary as string;
        let cli: string = "";
        switch (process.platform) {
            case "win32":
                cli = path.resolve(binary, "..", "bin", "code");
                break;
            case "darwin":
                cli = path.resolve(
                    binary,
                    "..",
                    "..",
                    "Resources/app/bin/code"
                );
                break;
        }
        const extensionDependencies = packageJson.extensionDependencies.flatMap(
            (item) => ["--install-extension", item]
        );

        console.log("running vscode cli");
        const res = await execFile(cli, [
            "--extensions-dir",
            EXTENSION_DIR,
            ...extensionDependencies,
            "--install-extension",
            VSIX_PATH,
            "--force",
        ]);

        console.log(res.stdout, res.stderr);
    },

    /**
     * Gets executed before test execution begins. At this point you can access to all global
     * variables like `browser`. It is the perfect place to define custom commands.
     * @param {Array.<Object>} capabilities list of capabilities details
     * @param {Array.<String>} specs        List of spec file paths that are to be run
     * @param {Object}         browser      instance of created browser/device session
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    before: async function () {
        ElementCustomCommands.initialise();
    },

    /**
     * Runs before a WebdriverIO command gets executed.
     * @param {String} commandName hook command name
     * @param {Array} args arguments that command would receive
     */
    // beforeCommand: function (commandName, args) {
    // },

    /**
     * Hook that gets executed before the suite starts
     * @param {Object} suite suite details
     */
    beforeSuite: async function () {
        await sleep(2000);
    },

    /**
     * Function to be executed before a test (in Mocha/Jasmine) starts.
     */
    // beforeTest: function (test, context) {
    // },

    /**
     * Hook that gets executed _before_ a hook within the suite starts (e.g. runs before calling
     * beforeEach in Mocha)
     */
    // beforeHook: function (test, context) {
    // },

    /**
     * Hook that gets executed _after_ a hook within the suite starts (e.g. runs after calling
     * afterEach in Mocha)
     */
    // afterHook: function (test, context, { error, result, duration, passed, retries }) {
    // },

    /**
     * Function to be executed after a test (in Mocha/Jasmine only)
     * @param {Object}  test             test object
     * @param {Object}  context          scope object the test was executed with
     * @param {Error}   result.error     error object in case the test fails, otherwise `undefined`
     * @param {Any}     result.result    return object of test function
     * @param {Number}  result.duration  duration of test
     * @param {Boolean} result.passed    true if test has passed, otherwise false
     * @param {Object}  result.retries   informations to spec related retries, e.g. `{ attempts: 0, limit: 0 }`
     */
    // afterTest: function(test, context, { error, result, duration, passed, retries }) {
    // },

    /**
     * Hook that gets executed after the suite has ended
     * @param {Object} suite suite details
     */
    // afterSuite: function (suite) {
    // },

    /**
     * Runs after a WebdriverIO command gets executed
     * @param {String} commandName hook command name
     * @param {Array} args arguments that command would receive
     * @param {Number} result 0 - command success, 1 - command error
     * @param {Object} error error object if any
     */
    // afterCommand: function (commandName, args, result, error) {
    // },

    /**
     * Gets executed after all tests are done. You still have access to all global variables from
     * the test.
     * @param {Number} result 0 - test pass, 1 - test fail
     * @param {Array.<Object>} capabilities list of capabilities details
     * @param {Array.<String>} specs List of spec file paths that ran
     */
    // after: async function (result, capabilities, specs) {
    // },

    /**
     * Gets executed right after terminating the webdriver session.
     * @param {Object} config wdio configuration object
     * @param {Array.<Object>} capabilities list of capabilities details
     * @param {Array.<String>} specs List of spec file paths that ran
     */
    afterSession: async function (config, capabilities, specs) {
        await sleep(2000);
        try {
            const logFileList = await glob(
                path.join(
                    VSCODE_STORAGE_DIR,
                    "**",
                    "databricks.databricks",
                    "*.json"
                )
            );
            console.log(logFileList);
            logFileList.forEach((file) => {
                cpSync(
                    file,
                    path.join(
                        "logs",
                        `vscode-logs-${specs
                            .map((spec) => spec.split(path.sep).at(-1))
                            .join("-")}`,
                        path.basename(file)
                    )
                );
                rmSync(file);
            });
            console.log(
                `User data copied to logs folder from ${VSCODE_STORAGE_DIR}`
            );
        } catch (error) {
            console.error(error);
        }
    },

    /**
     * Gets executed after all workers got shut down and the process is about to exit. An error
     * thrown in the onComplete hook will result in the test run failing.
     * @param {Object} exitCode 0 - success, 1 - fail
     * @param {Object} config wdio configuration object
     * @param {Array.<Object>} capabilities list of capabilities details
     * @param {<Object>} results object containing test results
     */
    // onComplete: function (exitCode, config, capabilities, results) {
    // },

    /**
     * Gets executed when a refresh happens.
     * @param {String} oldSessionId session ID of the old session
     * @param {String} newSessionId session ID of the new session
     */
    // onReload: function(oldSessionId, newSessionId) {
    // }
};

async function writeDatabricksConfig(config: Config, rootPath: string) {
    const configFile = path.join(rootPath, ".databrickscfg");
    await fs.writeFile(
        configFile,
        `[DEFAULT]
host = ${config.host!}
token = ${config.token!}`
    );
    return configFile;
}

function getWorkspaceClient(config: Config) {
    const client = new WorkspaceClient(config, {
        product: "integration-tests",
        productVersion: "0.0.1",
    });

    return client;
}

async function startCluster(
    workspaceClient: WorkspaceClient,
    clusterId: string,
    attempt = 0
) {
    console.log(`Cluster ID: ${clusterId}`);
    if (attempt > 100) {
        throw new Error("Failed to start the cluster: too many attempts");
    }
    const cluster = await workspaceClient.clusters.get({
        cluster_id: clusterId,
    });
    console.log(`Cluster State: ${cluster.state}`);
    switch (cluster.state) {
        case "RUNNING":
            console.log("Cluster is already running");
            break;
        case "TERMINATED":
        case "ERROR":
        case "UNKNOWN":
            console.log("Starting the cluster...");
            await (
                await workspaceClient.clusters.start({
                    cluster_id: clusterId,
                })
            ).wait({
                onProgress: async (state) => {
                    console.log(`Cluster state: ${state.state}`);
                },
            });
            break;
        case "PENDING":
        case "RESIZING":
        case "TERMINATING":
        case "RESTARTING":
            console.log("Waiting and retrying...");
            await sleep(10000);
            await startCluster(workspaceClient, clusterId, attempt + 1);
            break;
        default:
            throw new Error(`Unknown cluster state: ${cluster.state}`);
    }
}
