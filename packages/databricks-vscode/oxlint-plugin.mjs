// Lint rules for the extension's single owners that are calls, or one name
// of a module, not whole imports, so neither dependency-cruiser nor oxlint's
// built-in rules can express them (oxlint has no `no-restricted-syntax`). `.oxlintrc.json` at the repo root
// loads this file as a JS plugin and picks the files each rule applies to;
// src/test/contract/lintRules.test.ts runs every rule through that config,
// on fixtures at production paths.

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// The parser dependency-cruiser already uses: it reads the other modules a
// `new` expression's class comes from.
const swc = createRequire(import.meta.url)("@swc/core");

/** The value of a string literal, or of a template literal without substitutions. */
function constantString(node) {
    if (node?.type === "Literal" && typeof node.value === "string") {
        return node.value;
    }
    if (node?.type === "TemplateLiteral" && node.expressions.length === 0) {
        return node.quasis[0]?.value.cooked ?? undefined;
    }
    return undefined;
}

/** `executeCommand("setContext", …)`, or any call whose first argument is that string, quoted or as a template. */
const contextKeysOnly = {
    meta: {
        type: "problem",
        docs: {
            description: "Set context keys only through ContextKeys (platform/contextKeys.ts).",
        },
    },
    create(context) {
        return {
            CallExpression(node) {
                if (constantString(node.arguments[0]) === "setContext") {
                    context.report({
                        node,
                        message:
                            "Set context keys through ctx.kernel.contextKeys.set(KEY, value), with KEY declared by contextKey(). " +
                            "ContextKeys skips unchanged values, and the manifest contract checks every declared key.",
                    });
                }
            },
        };
    },
};

/**
 * SDK classes that aren't clients, which code outside ApiClients may build.
 * Every other value from `@databricks/sdk-*` counts as a client.
 */
const SDK_NON_CLIENTS = new Set([]);

/** The module that declares the options every client's constructor takes. */
const CLIENT_OPTIONS = { module: "@databricks/sdk-options/client", name: "ClientOptions" };

const isSdk = (specifier) => specifier.startsWith("@databricks/sdk-");

/**
 * What an import specifier names: an SDK module, a file in the repo, or
 * undefined for anything else (`vscode`, Node, other packages). A relative
 * `./x.js` names `./x.ts`, as TypeScript resolves it.
 */
function moduleRef(fromFile, specifier) {
    if (isSdk(specifier)) {
        return { sdk: specifier };
    }
    if (!specifier.startsWith(".")) {
        return undefined;
    }
    const base = path.resolve(path.dirname(fromFile), specifier);
    const stem = base.replace(/\.(js|mjs|cjs)$/, "");
    const file = [`${stem}.ts`, `${base}.ts`, path.join(base, "index.ts"), base].find(
        (f) => fs.existsSync(f) && fs.statSync(f).isFile(),
    );
    return file === undefined ? undefined : { file };
}

/**
 * The type annotation of a constructor parameter: plain, a parameter
 * property, defaulted (`options: T = {}`, whose annotation is on the
 * assignment's left side) or destructured (`{host}: T`).
 */
function parameterType(parameter) {
    let pattern = parameter.type === "TsParameterProperty" ? parameter.param : parameter.pat;
    while (pattern?.type === "AssignmentPattern") {
        pattern = pattern.left;
    }
    return pattern?.typeAnnotation?.typeAnnotation;
}

/**
 * A module's bindings, from swc's parse: what it imports, declares and
 * exports. Cached per file and modification time, so a long-lived editor
 * session sees edits.
 */
function analyse(body) {
    const info = {
        imports: new Map(),
        classes: new Map(),
        aliases: new Map(),
        locals: new Map(),
        reExports: [],
        starExports: [],
    };
    const declare = (decl) => {
        if (decl?.type === "ClassDeclaration") {
            const constructor = decl.body.find((m) => m.type === "Constructor");
            info.classes.set(decl.identifier.value, (constructor?.params ?? []).map(parameterType));
            return decl.identifier.value;
        }
        if (decl?.type === "TsTypeAliasDeclaration") {
            info.aliases.set(decl.id.value, decl.typeAnnotation);
            return decl.id.value;
        }
        return undefined;
    };
    for (const item of body) {
        switch (item.type) {
            case "ImportDeclaration":
                for (const spec of item.specifiers) {
                    const imported =
                        spec.type === "ImportNamespaceSpecifier"
                            ? "*"
                            : spec.type === "ImportDefaultSpecifier"
                              ? "default"
                              : (spec.imported?.value ?? spec.local.value);
                    info.imports.set(spec.local.value, { source: item.source.value, imported });
                }
                break;
            case "ExportDeclaration": {
                const name = declare(item.declaration);
                if (name !== undefined) {
                    info.locals.set(name, name);
                }
                break;
            }
            case "ExportDefaultDeclaration":
                // `export default class [Name] {…}`. An anonymous one gets a
                // name no identifier can have.
                if (item.decl?.type === "ClassExpression") {
                    const name = item.decl.identifier?.value ?? ANONYMOUS_DEFAULT;
                    declare({
                        ...item.decl,
                        type: "ClassDeclaration",
                        identifier: { value: name },
                    });
                    info.locals.set("default", name);
                }
                break;
            case "ExportDefaultExpression":
                // `export default ExistingBinding;`: a local class or an import.
                if (item.expression.type === "Identifier") {
                    info.locals.set("default", item.expression.value);
                }
                break;
            case "ExportNamedDeclaration":
                for (const spec of item.specifiers) {
                    if (spec.type === "ExportNamespaceSpecifier") {
                        info.reExports.push({
                            source: item.source?.value,
                            orig: "*",
                            exported: spec.name.value,
                        });
                        continue;
                    }
                    const orig = spec.orig.value;
                    const exported = spec.exported?.value ?? orig;
                    if (item.source) {
                        info.reExports.push({ source: item.source.value, orig, exported });
                    } else {
                        info.locals.set(exported, orig);
                    }
                }
                break;
            case "ExportAllDeclaration":
                info.starExports.push(item.source.value);
                break;
            default:
                declare(item);
        }
    }
    return info;
}

/** The binding name of an anonymous `export default class`. */
const ANONYMOUS_DEFAULT = "*default*";

const cache = new Map();
function moduleInfo(file, text) {
    if (text !== undefined) {
        return analyse(swc.parseSync(text, { syntax: "typescript" }).body);
    }
    const mtime = fs.statSync(file).mtimeMs;
    const cached = cache.get(file);
    if (cached?.mtime === mtime) {
        return cached.info;
    }
    let info;
    try {
        info = analyse(
            swc.parseSync(fs.readFileSync(file, "utf-8"), { syntax: "typescript" }).body,
        );
    } catch {
        info = analyse([]);
    }
    cache.set(file, { mtime, info });
    return info;
}

/**
 * What a module's export `name` is: `{sdk, name}` for an SDK export,
 * `{file, info, name, kind}` for a class, type alias or namespace in the
 * repo, or undefined. Follows `export {a as b} from`, `export *` (an SDK
 * `export *` claims any name the relative ones don't, so it fails closed),
 * and import-then-export.
 */
function resolveExport(ref, name, seen = new Set()) {
    if (ref === undefined) {
        return undefined;
    }
    if (ref.sdk !== undefined) {
        return { sdk: ref.sdk, name };
    }
    const key = `${ref.file}#${name}`;
    if (seen.has(key)) {
        return undefined;
    }
    seen.add(key);
    const info = moduleInfo(ref.file);
    if (info.locals.has(name)) {
        return resolveLocal(ref.file, info, info.locals.get(name), seen);
    }
    for (const r of info.reExports) {
        if (r.exported === name && r.source !== undefined) {
            const target = moduleRef(ref.file, r.source);
            return r.orig === "*" ? namespaceOf(target) : resolveExport(target, r.orig, seen);
        }
    }
    let sdkStar;
    for (const source of info.starExports) {
        const target = moduleRef(ref.file, source);
        if (target?.sdk !== undefined) {
            sdkStar ??= target.sdk;
        } else {
            const found = resolveExport(target, name, seen);
            if (found !== undefined) {
                return found;
            }
        }
    }
    return sdkStar === undefined ? undefined : { sdk: sdkStar, name };
}

const namespaceOf = (ref) => (ref === undefined ? undefined : { kind: "namespace", ref });

/** What the binding `name` in `file` refers to; see `resolveExport`. */
function resolveLocal(file, info, name, seen = new Set()) {
    if (info.classes.has(name)) {
        return { kind: "class", file, info, name };
    }
    if (info.aliases.has(name)) {
        return { kind: "alias", file, info, name };
    }
    const imported = info.imports.get(name);
    if (imported === undefined) {
        return undefined;
    }
    const ref = moduleRef(file, imported.source);
    return imported.imported === "*"
        ? namespaceOf(ref)
        : resolveExport(ref, imported.imported, seen);
}

/** Resolves `a` or `a.b.c` (an identifier, or a namespace member chain). */
function resolvePath(file, info, names) {
    let symbol = resolveLocal(file, info, names[0]);
    for (const member of names.slice(1)) {
        symbol = symbol?.kind === "namespace" ? resolveExport(symbol.ref, member) : undefined;
    }
    return symbol;
}

/** The identifiers of `a.b.c` in a swc TsQualifiedName or Identifier. */
function qualifiedNames(node) {
    if (node?.type === "Identifier") {
        return [node.value];
    }
    if (node?.type === "TsQualifiedName") {
        const left = qualifiedNames(node.left);
        return left === undefined ? undefined : [...left, node.right.value];
    }
    return undefined;
}

/** Whether a swc type node in `file` is the SDK's `ClientOptions`, however it is imported or aliased. */
function isClientOptions(file, info, type, depth = 0) {
    if (type?.type !== "TsTypeReference" || depth > 10) {
        return false;
    }
    const names = qualifiedNames(type.typeName);
    const symbol = names === undefined ? undefined : resolvePath(file, info, names);
    if (symbol?.sdk !== undefined) {
        return symbol.sdk === CLIENT_OPTIONS.module && symbol.name === CLIENT_OPTIONS.name;
    }
    if (symbol?.kind === "alias") {
        return isClientOptions(
            symbol.file,
            symbol.info,
            symbol.info.aliases.get(symbol.name),
            depth + 1,
        );
    }
    return false;
}

/** Whether a resolved symbol is a client: an SDK value, or a class whose constructor takes `ClientOptions`. */
function isClient(symbol) {
    if (symbol?.sdk !== undefined) {
        return !SDK_NON_CLIENTS.has(symbol.name);
    }
    if (symbol?.kind === "class") {
        return symbol.info.classes
            .get(symbol.name)
            .some((t) => isClientOptions(symbol.file, symbol.info, t));
    }
    return false;
}

/** The identifiers of `a` or `a.b.c` in an ESTree callee. */
function calleeNames(node) {
    if (node.type === "Identifier") {
        return [node.name];
    }
    if (node.type === "MemberExpression" && !node.computed && node.property.type === "Identifier") {
        const object = calleeNames(node.object);
        return object === undefined ? undefined : [...object, node.property.name];
    }
    return undefined;
}

/**
 * `new X(…)` where X is a client: any value from `@databricks/sdk-*`, or a
 * class whose constructor takes the SDK's `ClientOptions`. Names don't
 * matter: X is followed through imports (named, aliased, namespace, `.js`
 * specifiers), re-exports, barrels and type aliases to what it is.
 */
const sdkClientsThroughApi = {
    meta: {
        type: "problem",
        docs: { description: "Build SDK clients only through connection.api.get(Client)." },
    },
    create(context) {
        let info;
        return {
            NewExpression(node) {
                const names = calleeNames(node.callee);
                if (names === undefined) {
                    return;
                }
                info ??= moduleInfo(context.filename, context.sourceCode.text);
                const symbol = resolvePath(context.filename, info, names);
                if (!isClient(symbol)) {
                    return;
                }
                context.report({
                    node,
                    message:
                        `Get the client with connection.api.get(${names.join(".")}) instead. ` +
                        "ApiClients shares the connection's host, credentials and transport, and turns off the SDK's own profile and environment lookup." +
                        (symbol.sdk !== undefined
                            ? " If it isn't a client, add it to SDK_NON_CLIENTS in oxlint-plugin.mjs."
                            : ""),
                });
            },
        };
    },
};

/** The commands that install, enable and show extensions. */
const EXTENSION_COMMANDS = "workbench.extensions.";

/**
 * `vscode.extensions`, imported by name (aliased or not) or read from the
 * `vscode` namespace or default import, and any call whose first argument is
 * a `workbench.extensions.*` command.
 */
const extensionsThroughKernel = {
    meta: {
        type: "problem",
        docs: {
            description: "Use other VS Code extensions only through kernel.extensionDependencies.",
        },
    },
    create(context) {
        const report = (node) =>
            context.report({
                node,
                message:
                    "Use other VS Code extensions through ctx.kernel.extensionDependencies (platform/extensions.ts), with the extension in kernel/extensionDependencies.ts. " +
                    "It handles one that's missing, disabled or too old the same way everywhere, and installs it with progress and a useful error.",
            });
        const namespaces = new Set();
        return {
            Program(program) {
                for (const statement of program.body) {
                    if (
                        statement.type !== "ImportDeclaration" ||
                        statement.source.value !== "vscode" ||
                        statement.importKind === "type"
                    ) {
                        continue;
                    }
                    for (const specifier of statement.specifiers) {
                        if (specifier.type !== "ImportSpecifier") {
                            namespaces.add(specifier.local.name);
                        } else if (
                            (specifier.imported.name ?? specifier.imported.value) ===
                                "extensions" &&
                            specifier.importKind !== "type"
                        ) {
                            report(specifier);
                        }
                    }
                }
            },
            MemberExpression(node) {
                if (
                    node.object.type === "Identifier" &&
                    namespaces.has(node.object.name) &&
                    !node.computed &&
                    node.property.name === "extensions"
                ) {
                    report(node);
                }
            },
            CallExpression(node) {
                if (constantString(node.arguments[0])?.startsWith(EXTENSION_COMMANDS)) {
                    report(node);
                }
            },
        };
    },
};

/**
 * Requests go through the transport (`kernel/connection/nodeHttpClient.ts`):
 * fetch doesn't get VS Code's proxy and certificate handling behind a
 * corporate proxy, which is why `http.proxyStrictSSL` was ignored (2.22.0
 * used `node:https`). So no global `fetch` and no SDK `newFetchHttpClient`.
 */
const httpThroughTransport = {
    meta: {
        type: "problem",
        docs: {
            description:
                "Send requests through the transport (kernel/connection/nodeHttpClient.ts), not fetch.",
        },
    },
    create(context) {
        const message =
            "Send the request through the connection's transport (nodeHttpClient in kernel/connection/nodeHttpClient.ts), " +
            "not fetch, the SDK's newFetchHttpClient or undici: only the transport gets VS Code's proxy and certificate settings.";
        // A name that is a property of something (`x.fetch`, `{fetch: 1}`, a method `fetch()`), not a reference to a binding.
        const isPropertyName = (node) => {
            const parent = node.parent;
            return (
                (parent?.type === "MemberExpression" &&
                    parent.property === node &&
                    !parent.computed) ||
                (parent?.type === "Property" && parent.key === node && !parent.computed) ||
                ((parent?.type === "MethodDefinition" || parent?.type === "PropertyDefinition") &&
                    parent.key === node &&
                    !parent.computed)
            );
        };
        const isCallee = (node) =>
            node.parent?.type === "CallExpression" && node.parent.callee === node;
        // Node's `global` too. An alias (`const g = globalThis`) or `Reflect.get` would need scope analysis.
        const isGlobalObject = (node) =>
            node?.type === "Identifier" &&
            ["globalThis", "global", "window", "self"].includes(node.name);
        const propertyName = (node) =>
            node.computed
                ? constantString(node.property ?? node.key)
                : (node.property ?? node.key)?.name;
        return {
            // `fetch` as a value (`const f = fetch`, `{send: fetch}`); a call is reported by CallExpression.
            Identifier(node) {
                if (node.name === "newFetchHttpClient") {
                    context.report({ node, message });
                } else if (
                    node.name === "fetch" &&
                    !isPropertyName(node) &&
                    !isCallee(node) &&
                    !node.parent?.type?.startsWith("Import")
                ) {
                    context.report({ node, message });
                }
            },
            CallExpression(node) {
                if (node.callee.type === "Identifier" && node.callee.name === "fetch") {
                    context.report({ node, message });
                } else if (
                    node.callee.type === "Identifier" &&
                    node.callee.name === "require" &&
                    constantString(node.arguments[0]) === "undici"
                ) {
                    context.report({ node, message });
                }
            },
            // `globalThis.fetch`, `global["fetch"]`, `window.fetch` and `self.fetch`, called or not.
            MemberExpression(node) {
                if (propertyName(node) === "fetch" && isGlobalObject(node.object)) {
                    context.report({ node, message });
                }
            },
            // `const { fetch: send } = globalThis`; the shorthand `{ fetch }` is reported as an Identifier.
            VariableDeclarator(node) {
                if (node.id.type !== "ObjectPattern" || !isGlobalObject(node.init)) {
                    return;
                }
                for (const property of node.id.properties) {
                    if (
                        property.type === "Property" &&
                        !property.shorthand &&
                        propertyName(property) === "fetch"
                    ) {
                        context.report({ node: property, message });
                    }
                }
            },
            ImportDeclaration(node) {
                if (node.source.value === "undici") {
                    context.report({ node, message });
                }
            },
            ImportExpression(node) {
                if (constantString(node.source) === "undici") {
                    context.report({ node, message });
                }
            },
        };
    },
};

export default {
    meta: { name: "databricks" },
    rules: {
        "context-keys-only": contextKeysOnly,
        "extensions-through-kernel": extensionsThroughKernel,
        "sdk-clients-through-api": sdkClientsThroughApi,
        "http-through-transport": httpThroughTransport,
    },
};
