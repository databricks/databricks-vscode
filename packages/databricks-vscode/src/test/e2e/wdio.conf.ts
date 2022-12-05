/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-console */
import type {Options} from "@wdio/types";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const video = require("wdio-video-reporter");

import path from "node:path";
import assert from "assert";
import fs from "fs/promises";
import {
    ApiClient,
    Cluster,
    CurrentUserService,
    Repo,
} from "@databricks/databricks-sdk";

const WORKSPACE_PATH = path.resolve(__dirname, "workspace");
const REPO_NAME = "vscode-integ-test";

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
            project: "src/test/e2e/tsconfig.json",
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
    specs: ["./src/test/e2e/**/*.e2e.ts"],
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
    capabilities: [
        {
            "browserName": "vscode",
            "browserVersion": "1.71.1",
            "wdio:vscodeOptions": {
                extensionPath: process.env.CI
                    ? path.resolve(__dirname, "..", "..", "..", "extension")
                    : path.resolve(__dirname, "..", "..", ".."),
                workspacePath: WORKSPACE_PATH,
                userSettings: {
                    "editor.fontSize": 14,
                    "typescript.updateImportsOnFileMove.enabled": "always",
                    "files.simpleDialog.enable": true,
                    "workbench.editor.enablePreview": true,
                    "window.newWindowDimensions": "default",
                    "window.openFoldersInNewWindow": "off",
                },
            },
        },
    ],

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
    services: [["vscode", {cachePath: "/tmp/wdio-vscode-service"}]],

    // Framework you want to run your specs with.
    // The following are supported: Mocha, Jasmine, and Cucumber
    // see also: https://webdriver.io/docs/frameworks
    //
    // Make sure you have the wdio adapter package for the specific framework installed
    // before running any tests.
    framework: "mocha",
    //
    // The number of times to retry the entire specfile when it fails as a whole
    // specFileRetries: 1,
    //
    // Delay in seconds between the spec file retry attempts
    // specFileRetriesDelay: 0,
    //
    // Whether or not retried specfiles should be retried immediately or deferred to the end of the queue
    // specFileRetriesDeferred: false,
    //
    // Test reporter for stdout.
    // The only one supported by default is 'dot'
    // see also: https://webdriver.io/docs/dot-reporter
    reporters: [
        "spec",
        [
            video,
            {
                saveAllVideos: true,
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
        assert(
            process.env["DATABRICKS_HOST"],
            "Environment variable DATABRICKS_HOST must be set"
        );
        assert(
            process.env["DATABRICKS_TOKEN"],
            "Environment variable DATABRICKS_TOKEN must be set"
        );
        assert(
            process.env["TEST_DEFAULT_CLUSTER_ID"],
            "Environment variable TEST_DEFAULT_CLUSTER_ID must be set"
        );

        await fs.rm(WORKSPACE_PATH, {recursive: true, force: true});
        await fs.mkdir(WORKSPACE_PATH);

        const apiClient = getApiClient(
            process.env["DATABRICKS_HOST"],
            process.env["DATABRICKS_TOKEN"]
        );
        const repoPath = await createRepo(apiClient);
        const configFile = await writeDatabricksConfig();
        await startCluster(apiClient, process.env["TEST_DEFAULT_CLUSTER_ID"]);

        process.env.DATABRICKS_CONFIG_FILE = configFile;
        process.env.WORKSPACE_PATH = WORKSPACE_PATH;
        process.env.TEST_REPO_PATH = repoPath;
    },

    /**
     * Gets executed before a worker process is spawned and can be used to initialise specific service
     * for that worker as well as modify runtime environments in an async fashion.
     * @param  {String} cid      capability id (e.g 0-0)
     * @param  {[type]} caps     object containing capabilities for session that will be spawn in the worker
     * @param  {[type]} specs    specs to be run in the worker process
     * @param  {[type]} args     object that will be merged with the main configuration once worker is initialized
     * @param  {[type]} execArgv list of string arguments passed to the worker process
     */
    // onWorkerStart: function (cid, caps, specs, args, execArgv) {
    // },

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
    beforeSession: async function () {
        await fs.rm(path.join(WORKSPACE_PATH, ".databricks"), {
            recursive: true,
            force: true,
        });
    },

    /**
     * Gets executed before test execution begins. At this point you can access to all global
     * variables like `browser`. It is the perfect place to define custom commands.
     * @param {Array.<Object>} capabilities list of capabilities details
     * @param {Array.<String>} specs        List of spec file paths that are to be run
     * @param {Object}         browser      instance of created browser/device session
     */
    before: async function (capabilities, specs, browser) {
        await browser.setTimeout({implicit: 500});
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
    // beforeSuite: function (suite) {
    // },

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
    // after: function (result, capabilities, specs) {
    // },

    /**
     * Gets executed right after terminating the webdriver session.
     * @param {Object} config wdio configuration object
     * @param {Array.<Object>} capabilities list of capabilities details
     * @param {Array.<String>} specs List of spec file paths that ran
     */
    // afterSession: function (config, capabilities, specs) {
    // },

    /**
     * Gets executed after all workers got shut down and the process is about to exit. An error
     * thrown in the onComplete hook will result in the test run failing.
     * @param {Object} exitCode 0 - success, 1 - fail
     * @param {Object} config wdio configuration object
     * @param {Array.<Object>} capabilities list of capabilities details
     * @param {<Object>} results object containing test results
     */
    // onComplete: function(exitCode, config, capabilities, results) {
    // },

    /**
     * Gets executed when a refresh happens.
     * @param {String} oldSessionId session ID of the old session
     * @param {String} newSessionId session ID of the new session
     */
    // onReload: function(oldSessionId, newSessionId) {
    // }
};

async function writeDatabricksConfig() {
    assert(
        process.env["DATABRICKS_HOST"],
        "Environment variable DATABRICKS_HOST must be set"
    );
    assert(
        process.env["DATABRICKS_TOKEN"],
        "Environment variable DATABRICKS_TOKEN must be set"
    );
    assert(
        process.env["TEST_DEFAULT_CLUSTER_ID"],
        "Environment variable TEST_DEFAULT_CLUSTER_ID must be set"
    );

    const configFile = path.join(WORKSPACE_PATH, ".databrickscfg");
    let host = process.env["DATABRICKS_HOST"];
    if (!host.startsWith("http")) {
        host = `https://${host}`;
    }
    await fs.writeFile(
        configFile,
        `[DEFAULT]
host = ${host}
token = ${process.env["DATABRICKS_TOKEN"]}`
    );

    return configFile;
}

function getApiClient(host: string, token: string) {
    const apiClient = new ApiClient("integration-tests", "0.0.1", async () => {
        return {
            host: new URL(host),
            token,
        };
    });

    return apiClient;
}

/**
 * Create a repo for the integration tests to use
 */
async function createRepo(apiClient: ApiClient): Promise<string> {
    const meService = new CurrentUserService(apiClient);
    const me = (await meService.me()).userName!;
    const repoPath = `/Repos/${me}/${REPO_NAME}`;

    console.log(`Creating test Repo: ${repoPath}`);

    let repo: Repo;
    try {
        repo = await Repo.fromPath(apiClient, repoPath);
    } catch (e) {
        repo = await Repo.create(apiClient, {
            path: repoPath,
            url: "https://github.com/fjakobs/empty-repo.git",
            provider: "github",
        });
    }

    return repo.path;
}

async function startCluster(apiClient: ApiClient, clusterId: string) {
    console.log(`Starting cluster: ${clusterId}`);
    const cluster = await Cluster.fromClusterId(apiClient, clusterId);
    await cluster.start(undefined, (state) =>
        console.log(`Cluster state: ${state}`)
    );
    console.log(`Cluster started`);
}
