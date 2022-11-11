#!/usr/bin/env node

import * as Mock from "mock-require";
Mock.default("vscode-extension-tester/out/util/download", "./download");

// Need to import something from commander to make the CLI work
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import {program} from "commander";

require("vscode-extension-tester/out/cli");
