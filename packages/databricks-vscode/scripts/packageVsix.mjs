// Packages the extension as a VSIX for one platform, and checks what is in it.
//
//   node scripts/packageVsix.mjs [--target <vsce target>] [--out <file.vsix>] [--name <name>] [--version <version>]
//       [--pre-release]
//
// Run `yarn build` first. The target defaults to this machine's
// (`linux-x64`, `darwin-arm64`, ...); the VSIX goes to `.build/` by default.
// `--name` and `--version` replace the packaged manifest's, for a build that
// takes another extension's place (scripts/sessionVsix.mjs). `--pre-release`
// marks the VSIX for the Marketplace's pre-release channel; the `package`
// script passes it while 3.x is in pre-release, so every release build has it.
//
// There is no bundler (ARCHITECTURE.md), so `dist/` loads its dependencies
// from `node_modules` at runtime, and Yarn hoists them to the repo root,
// outside this package. The script therefore stages the package in a
// temporary folder: the files the extension reads at runtime, the CLI for the
// target, and the production dependencies, copied from the install as Node
// resolves them. `vsce` packages the staged folder, and the script then reads
// the VSIX back to check that the files the extension needs are in it, that
// tests and sources aren't, and that every `require` in `dist/` resolves to a
// packaged file.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { builtinModules, createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createVSIX } from "@vscode/vsce";
import { telemetryJson } from "./generateTelemetry.mjs";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(packageDir, "../..");

// vsce's targets, with the matching `fetch:cli` platform. `checkArchitecture`
// (platform/architecture.ts) compares both with the machine at activation.
const CLI_ARCH = {
    "linux-x64": "linux_amd64",
    "linux-arm64": "linux_arm64",
    "darwin-x64": "darwin_amd64",
    "darwin-arm64": "darwin_arm64",
    "win32-x64": "windows_amd64",
    "win32-arm64": "windows_arm64",
};

// What the extension reads from its own folder at runtime, relative to it.
const INCLUDE = [
    "package.json",
    "README.md",
    "CHANGELOG.md",
    "LICENSE",
    "NOTICE.md",
    "dist",
    "images",
    "resources",
];
// Dropped from the staged copy: tests, compiler leftovers, declarations and maps.
const EXCLUDE = [
    /(^|\/)__pycache__(\/|$)/,
    /\.pyc$/,
    /^resources\/python\/tests(\/|$)/,
    /\.d\.ts$/,
    /\.map$/,
    /\.tsbuildinfo$/,
];

// Entries the VSIX must have, relative to its `extension/` folder.
const REQUIRED = [
    "package.json",
    // vsce renames these two in the VSIX, for the Marketplace's details and licence.
    "readme.md",
    "LICENSE.txt",
    "NOTICE.md",
    // Written into the stage from dist/, for `code --telemetry` (generateTelemetry.mjs).
    "telemetry.json",
    "dist/extension.js",
    "images/databricks-logo.png",
    "resources/python/dbconnect-bootstrap.py",
    "resources/python/00-databricks-init.py",
    "resources/python/bootstrap.py",
    "resources/python/file.workflow-wrapper.py",
    "resources/python/notebook.workflow-wrapper.py",
    "resources/webview-ui/uc-detail.html",
    "resources/webview-ui/job.html",
];
// Entries of its own it must not have; the dependencies ship as published.
const FORBIDDEN = [
    /^src\//,
    /\.test\.js$/,
    /^dist\/(test|test-support)\//,
    /^reports\//,
    /__pycache__/,
    /\.pyc$/,
    /\.ts$/,
    /\.vsix$/,
];

function parseArgs(argv) {
    const args = {
        target: `${process.platform}-${process.arch}`,
        out: undefined,
        preRelease: false,
    };
    for (let i = 0; i < argv.length; i++) {
        if (["--target", "--out", "--name", "--version"].includes(argv[i])) {
            args[argv[i].slice(2)] = argv[++i];
        } else if (argv[i] === "--pre-release") {
            args.preRelease = true;
        } else {
            throw new Error(`Unknown argument ${argv[i]}`);
        }
    }
    if (!(args.target in CLI_ARCH)) {
        throw new Error(
            `Unsupported target ${args.target}; use one of ${Object.keys(CLI_ARCH).join(", ")}`,
        );
    }
    return args;
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function copyTree(from, to, relativeTo) {
    fs.cpSync(from, to, {
        recursive: true,
        filter: (source) => {
            const relative = path.relative(relativeTo, source).split(path.sep).join("/");
            return !EXCLUDE.some((pattern) => pattern.test(relative));
        },
    });
}

/** Where Node finds package `name` from `fromDir`, without leaving the repo; undefined if nowhere. */
export function resolvePackageDir(fromDir, name, root = repoRoot) {
    for (let dir = fromDir; ; dir = path.dirname(dir)) {
        if (path.basename(dir) !== "node_modules") {
            const candidate = path.join(dir, "node_modules", name);
            if (fs.existsSync(path.join(candidate, "package.json"))) {
                return candidate;
            }
        }
        if (dir === root || path.dirname(dir) === dir) {
            return undefined;
        }
    }
}

/**
 * The folders of the production dependencies of the package in `dir`,
 * transitively, as Node resolves them: optional and peer dependencies when
 * installed, never devDependencies. Each comes with where it goes under the
 * staged `node_modules`, which keeps the nesting the install has.
 */
export function productionDependencies(dir, root = repoRoot) {
    const found = new Map();
    const visit = (from) => {
        const manifest = readJson(path.join(from, "package.json"));
        const optional = new Set([
            ...Object.keys(manifest.optionalDependencies ?? {}),
            ...Object.keys(manifest.peerDependencies ?? {}),
        ]);
        const names = new Set([...Object.keys(manifest.dependencies ?? {}), ...optional]);
        for (const name of names) {
            const resolved = resolvePackageDir(from, name, root);
            if (resolved === undefined) {
                if (optional.has(name)) {
                    continue;
                }
                throw new Error(
                    `${name}, a dependency of ${manifest.name}, isn't installed; run yarn install`,
                );
            }
            if (found.has(resolved)) {
                continue;
            }
            // Below the first `node_modules`: `a/node_modules/b` stays nested.
            const parts = path.relative(root, resolved).split(path.sep);
            const staged = parts.slice(parts.indexOf("node_modules") + 1).join("/");
            if (
                fs.realpathSync(resolved) !== resolved &&
                !fs.realpathSync(resolved).includes(`${path.sep}node_modules${path.sep}`)
            ) {
                throw new Error(
                    `${name} resolves to a workspace link (${resolved}); a production dependency must be a published package`,
                );
            }
            found.set(resolved, staged);
            visit(resolved);
        }
    };
    visit(dir);
    const byStaged = new Map();
    for (const [source, staged] of found) {
        if (byStaged.has(staged)) {
            throw new Error(
                `Two installs of one package would both go to node_modules/${staged}: ${byStaged.get(staged)} and ${source}`,
            );
        }
        byStaged.set(staged, source);
    }
    return [...found].map(([source, staged]) => ({ source, staged }));
}

/** The names of the entries in a zip file, from its central directory. */
export function zipEntries(zip) {
    const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (eocd < 0) {
        throw new Error("Not a zip file");
    }
    const names = [];
    let offset = zip.readUInt32LE(eocd + 16);
    for (let i = zip.readUInt16LE(eocd + 10); i > 0; i--) {
        const nameLength = zip.readUInt16LE(offset + 28);
        const size = zip.readUInt32LE(offset + 24);
        names.push({ name: zip.subarray(offset + 46, offset + 46 + nameLength).toString(), size });
        offset += 46 + nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
    }
    return names;
}

/** The modules `dist/` requires or imports (`import()`) that Node doesn't provide, with the files that load them. */
function requiredModules(distDir) {
    const required = [];
    const builtins = new Set(builtinModules);
    for (const file of fs.readdirSync(distDir, { recursive: true })) {
        if (!file.endsWith(".js")) {
            continue;
        }
        const source = fs.readFileSync(path.join(distDir, file), "utf8");
        // Not a method call such as `x.import("...")`.
        for (const match of source.matchAll(/(?<![\w.$])(?:require|import)\("([^"]+)"\)/g)) {
            const specifier = match[1];
            if (
                specifier === "vscode" ||
                specifier.startsWith("node:") ||
                builtins.has(specifier)
            ) {
                continue;
            }
            required.push({ file: path.join(distDir, file), specifier });
        }
    }
    return required;
}

/**
 * `dist/` files that no source in `src/` compiles to. `tsc -b` doesn't
 * delete the output of a removed source, so it would ship.
 */
function staleOutputs(distDir, srcDir) {
    return fs
        .readdirSync(distDir, { recursive: true })
        .filter(
            (file) =>
                file.endsWith(".js") &&
                !fs.existsSync(path.join(srcDir, file.replace(/\.js$/, ".ts"))),
        )
        .map((file) => `dist/${file.split(path.sep).join("/")}`);
}

/** The version a CLI binary reports, as fetchCli.mjs reads it; undefined when it doesn't run. */
function cliVersionOf(binary) {
    try {
        return JSON.parse(
            execFileSync(binary, ["version", "--output", "json"], {
                stdio: ["ignore", "pipe", "ignore"],
            }).toString(),
        ).Version;
    } catch {
        return undefined;
    }
}

/** Problems with the packaged files, empty when there are none. */
function checkPackage(stage, entries, binName) {
    const files = new Set(
        entries
            .filter((e) => e.name.startsWith("extension/"))
            .map((e) => e.name.slice("extension/".length)),
    );
    const problems = [];
    for (const name of [...REQUIRED, `bin/${binName}`]) {
        if (!files.has(name)) {
            problems.push(`missing ${name}`);
        }
    }
    for (const name of files) {
        if (
            name.startsWith("node_modules/")
                ? name.startsWith("node_modules/.bin/")
                : FORBIDDEN.some((pattern) => pattern.test(name))
        ) {
            problems.push(`shouldn't ship ${name}`);
        }
    }
    const manifest = readJson(path.join(stage, "package.json"));
    for (const icon of [manifest.icon]) {
        if (icon !== undefined && !files.has(icon)) {
            problems.push(`missing the icon ${icon}`);
        }
    }
    // The generator's output, from dist/: without the core events, it would
    // document nothing, and `code --telemetry` would list none of our events.
    if (files.has("telemetry.json")) {
        const { events = {} } = readJson(path.join(stage, "telemetry.json"));
        for (const name of ["commandExecution", "extensionActivation"]) {
            if (!(name in events)) {
                problems.push(`telemetry.json lacks the ${name} event`);
            }
        }
    }
    for (const { file, specifier } of requiredModules(path.join(stage, "dist"))) {
        let resolved;
        try {
            resolved = createRequire(file).resolve(specifier);
        } catch {
            problems.push(
                `${path.relative(stage, file)} requires ${specifier}, which doesn't resolve in the package`,
            );
            continue;
        }
        const relative = path.relative(stage, resolved).split(path.sep).join("/");
        if (relative.startsWith("..") || !files.has(relative)) {
            problems.push(
                `${path.relative(stage, file)} requires ${specifier}, which resolves to ${resolved}, outside the VSIX`,
            );
        }
    }
    // The detail panel reads its libraries out of node_modules (UnityCatalogDetailPanel.ts).
    const panelRequire = createRequire(path.join(stage, "package.json"));
    for (const specifier of ["markdown-it/browser", "@highlightjs/cdn-assets/highlight.min.js"]) {
        try {
            const relative = path
                .relative(stage, panelRequire.resolve(specifier))
                .split(path.sep)
                .join("/");
            if (!files.has(relative)) {
                problems.push(`the Unity Catalog panel's ${specifier} isn't packaged`);
            }
        } catch {
            problems.push(`the Unity Catalog panel's ${specifier} doesn't resolve in the package`);
        }
    }
    return problems;
}

async function main() {
    const { target, out: outArg, name, version, preRelease } = parseArgs(process.argv.slice(2));
    const cliArch = CLI_ARCH[target];
    const manifest = readJson(path.join(packageDir, "package.json"));
    const packaged = {
        ...manifest,
        name: name ?? manifest.name,
        version: version ?? manifest.version,
    };
    const out = path.resolve(
        outArg ??
            path.join(packageDir, ".build", `${packaged.name}-${target}-${packaged.version}.vsix`),
    );
    if (!fs.existsSync(path.join(packageDir, "dist", "extension.js"))) {
        throw new Error("dist/extension.js is missing; run yarn build first");
    }
    const stale = staleOutputs(path.join(packageDir, "dist"), path.join(packageDir, "src"));
    if (stale.length > 0) {
        // `tsc -b --clean` (yarn clean) deletes only the output of sources that still exist.
        throw new Error(
            `dist/ has output that no source in src/ compiles to; delete packages/databricks-vscode/dist, then run yarn build:\n  ${stale.join("\n  ")}`,
        );
    }

    // The real path: on macOS the temporary folder is behind a link
    // (/var -> /private/var), and vsce then lists every file as `../…`,
    // which leaves them all out.
    const stage = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), "databricks-vscode-vsix-")),
    );
    try {
        for (const entry of INCLUDE) {
            copyTree(path.join(packageDir, entry), path.join(stage, entry), packageDir);
        }
        // The packaging fields `checkArchitecture` reads; no devDependencies,
        // whose `workspace:` ranges npm, which vsce runs, can't parse.
        const { devDependencies: _dev, scripts: _scripts, ...staged } = packaged;
        fs.writeFileSync(
            path.join(stage, "package.json"),
            JSON.stringify({ ...staged, arch: { vsixArch: target, cliArch } }, null, 2) + "\n",
        );
        fs.writeFileSync(
            path.join(stage, "telemetry.json"),
            telemetryJson(path.join(packageDir, "dist")),
        );

        const binName = cliArch.startsWith("windows") ? "databricks.exe" : "databricks";
        const hostCli = path.join(packageDir, "bin", binName);
        if (
            target === `${process.platform}-${process.arch}` &&
            cliVersionOf(hostCli) === manifest.cli.version
        ) {
            fs.mkdirSync(path.join(stage, "bin"));
            fs.copyFileSync(hostCli, path.join(stage, "bin", binName));
        } else {
            // Another platform's CLI doesn't run here, so fetchCli.mjs can't
            // tell its version: it is kept by version, and fetched once.
            const cached = path.join(packageDir, ".build", "cli", manifest.cli.version, cliArch);
            if (!fs.existsSync(path.join(cached, binName))) {
                execFileSync(
                    process.execPath,
                    [
                        "--use-system-ca",
                        path.join(packageDir, "scripts", "fetchCli.mjs"),
                        cliArch,
                        cached,
                    ],
                    { stdio: "inherit" },
                );
            }
            fs.mkdirSync(path.join(stage, "bin"));
            fs.copyFileSync(path.join(cached, binName), path.join(stage, "bin", binName));
        }

        for (const { source, staged: dest } of productionDependencies(packageDir)) {
            fs.cpSync(source, path.join(stage, "node_modules", dest), {
                recursive: true,
                // Nested dependencies are staged on their own, when they are
                // production ones. Node loads no maps or TypeScript, and the
                // maps alone are most of the install (116 of 150 MB, mainly
                // @vscode/extension-telemetry's Application Insights packages).
                filter: (file) =>
                    !path.relative(source, file).split(path.sep).includes("node_modules") &&
                    !/\.(map|ts|cts|mts)$/.test(file),
            });
        }

        fs.mkdirSync(path.dirname(out), { recursive: true });
        await createVSIX({
            cwd: stage,
            packagePath: out,
            target,
            preRelease,
            useYarn: false,
            dependencies: true,
            // The README's and CHANGELOG's relative links, as they are at this
            // release's tag, as 2.x's package script points them.
            baseContentUrl: `https://github.com/databricks/databricks-vscode/blob/release-v${packaged.version}/packages/databricks-vscode`,
            baseImagesUrl: `https://raw.githubusercontent.com/databricks/databricks-vscode/release-v${packaged.version}/packages/databricks-vscode`,
        });

        const entries = zipEntries(fs.readFileSync(out));
        const problems = checkPackage(stage, entries, binName);
        const total = entries.reduce((sum, e) => sum + e.size, 0);
        const largest = [...entries].sort((a, b) => b.size - a.size).slice(0, 5);
        console.log(
            `${path.relative(process.cwd(), out)}${preRelease ? " (pre-release)" : ""}: ${entries.length} files, ${(total / 1e6).toFixed(1)} MB unpacked; largest:`,
        );
        for (const e of largest) {
            console.log(`  ${(e.size / 1e6).toFixed(1).padStart(6)} MB  ${e.name}`);
        }
        if (problems.length > 0) {
            throw new Error(
                `The VSIX is incomplete or carries files it shouldn't:\n  ${problems.join("\n  ")}`,
            );
        }
        console.log(
            "Checked: the required files and the CLI are in it, no tests, sources or stale output are, and every require and import() in dist/ resolves inside it.",
        );
    } finally {
        fs.rmSync(stage, { recursive: true, force: true });
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    });
}
