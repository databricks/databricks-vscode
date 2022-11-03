#!/usr/bin/env node

require("mock-require")(
    "vscode-extension-tester/out/util/download",
    "./download"
);

import {program} from "commander";

require("vscode-extension-tester/out/cli");
