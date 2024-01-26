import * as vscode from "vscode";
import {execFile as execFileCb} from "child_process";
import {promisify} from "node:util";
import {ConnectionManager} from "../configuration/ConnectionManager";
import * as functionsJson from "./functions.json";

const execFile = promisify(execFileCb);
const CLI_FUNCTIONS = Object.values(functionsJson);
const CHAT_COMPLETIONS_API = "/api/2.0/lakesense-v2/chat/completions";

// const roleIdToRoleName = {
//     [vscode.ChatMessageRole.System]: "system",
//     [vscode.ChatMessageRole.User]: "user",
//     [vscode.ChatMessageRole.Assistant]: "assistant",
//     [vscode.ChatMessageRole.Function]: "function",
// };

type AssistantMessage = {
    role: string;
    content: string;
};

function historyToMessages(history: vscode.ChatAgentHistoryEntry[]) {
    return history.reduce((acc, item) => {
        acc.push({
            role: "user",
            content: item.request.prompt,
        });
        item.response.forEach((response) => {
            if ("content" in response) {
                acc.push({
                    role: "assistant",
                    content: response.content,
                });
            }
        });
        return acc;
    }, [] as AssistantMessage[]);
    // return history.map((item) => ({
    //     role: roleIdToRoleName[item.role],
    //     content: item.response.content,
    // }));
}

interface ChatResponse {
    completion: string;
}

interface Command {
    mainArgs: string[];
    options: any[];
}

interface CompletionObject {
    choices: Array<{
        finish_reason: string;
        index: number;
        message: {
            content: string;
            role: string;
            function_call: {name: string; arguments: string};
        };
    }>;
    created: number;
    id: string;
    model: string;
    object: string;
    usage: {
        completion_tokens: number;
        prompt_tokens: number;
        total_tokens: number;
    };
    error?: Error;
}

function parseFunction(call: {name: string; arguments: string}): Command {
    const mainArgs = call.name
        .replace("databricks.", "")
        .replaceAll("_", " ")
        .trim()
        .split(" ");
    const argsList = Object.entries(JSON.parse(call.arguments)).sort((a, b) =>
        a[0] > b[0] ? 1 : -1
    );
    const options: any[] = [];
    for (const [argName, argValue] of argsList) {
        // Lowercase names are flags
        if (argName === argName.toLowerCase()) {
            options.push(`--${argName}`, argValue);
        } else {
            options.push(argValue);
        }
    }
    return {mainArgs, options};
}

async function executeCommand(
    cwd: string,
    cliPath: string,
    cmd: Command,
    env: Record<string, any>,
    progress: vscode.Progress<vscode.ChatAgentProgress>
) {
    try {
        const res = await execFile(cliPath, cmd.mainArgs.concat(cmd.options), {
            env,
            cwd,
        });
        progress.report({content: "\n```\n" + res.stdout + "\n```\n"});
        if (res.stderr) {
            progress.report({content: "\n```\n" + res.stderr + "\n```\n"});
        }
        return {};
    } catch (error: any) {
        progress.report({content: "The command failed with:"});
        progress.report({content: "\n```\n" + error.message + "\n```\n"});
        return {error: true};
    }
}

export async function initChatFeatures(
    extensionContext: vscode.ExtensionContext,
    connectionManager: ConnectionManager
) {
    try {
        // const resp = await fetch("http://[2606:4700::6810:7b60]/");
        const resp = await fetch("http://coudflare.com/");
        const text = await resp.text();
        console.log(1111, text);
    } catch (e) {
        console.log(2222, e);
    }
    const cliPath = extensionContext.asAbsolutePath("./bin/databricks");
    let recentCmd: Command | undefined;
    const chatHandler = async (
        request: vscode.ChatAgentRequest,
        chatContext: vscode.ChatAgentContext,
        progress: vscode.Progress<vscode.ChatAgentProgress>
    ) => {
        // const env: Record<string, any> = {...process.env};
        const env: Record<string, any> = {
            HOME: process.env.HOME,
        };
        for (const [
            name,
            mutator,
        ] of extensionContext.environmentVariableCollection) {
            env[name] = mutator.value;
        }

        const cwd = vscode.workspace.workspaceFolders![0].uri.fsPath;

        if (request.subCommand === "execute") {
            if (recentCmd) {
                // @ts-ignore
                return await executeCommand(
                    cwd,
                    cliPath,
                    recentCmd,
                    env,
                    progress
                );
            } else {
                progress.report({content: "No recent commands"});
            }
            return {};
        }

        if (request.subCommand === "help") {
            if (recentCmd) {
                const res = await execFile(
                    cliPath,
                    ["help"].concat(recentCmd.mainArgs),
                    {env, cwd}
                );
                progress.report({content: "\n```\n" + res.stdout + "\n```\n"});
            } else {
                progress.report({content: "No recent commands"});
            }
            return {};
        }

        const message = {
            content: request.prompt,
            role: "user",
        };
        const params = {
            model: "gpt-4",
            // model: "gpt-4-1106-preview",
            messages: historyToMessages(chatContext.history.slice(-4)).concat([
                message,
            ]),
            functions: CLI_FUNCTIONS.filter((fn) => {
                return /^(auth|configure|sync|bundle|cluster|queries|jobs|table|workspace-conf)/.test(
                    fn.name
                );
            })
                .slice(0, 128)
                .map((fn: any) => {
                    fn.name = fn.name.slice(0, 64);
                    // fn.description = fn.description.slice(0, 512)
                    return fn;
                }),
        };
        const response = (await connectionManager.apiClient?.request(
            CHAT_COMPLETIONS_API,
            "POST",
            {
                "@method": "enterpriseOpenAiServiceChatCompletionRequest",
                params,
            }
        )) as ChatResponse;
        const completion = JSON.parse(
            response.completion || "{}"
        ) as CompletionObject;
        if (completion.error) {
            progress.report({content: completion.error.message});
            return {};
        }
        if (!completion.choices || completion.choices.length === 0) {
            progress.report({content: "Sorry, can't help you"});
            return {};
        }
        const choice = completion.choices[0]!;
        if (choice.finish_reason === "stop") {
            progress.report({content: choice.message.content});
            return {};
        }
        if (choice.finish_reason === "function_call") {
            progress.report({content: "Do you want to execute this command?"});
            const cmd = parseFunction(choice.message.function_call);
            const cmdString = ["databricks"]
                .concat(cmd.mainArgs)
                .concat(cmd.options)
                .join(" ");
            progress.report({content: "\n```\n" + cmdString + "\n```\n"});
            recentCmd = cmd;
            // @ts-ignore
            return {cmd};
        }
        return {};
    };
    // @ts-ignore
    const agent = vscode.chat.createChatAgent("databricks", chatHandler);
    extensionContext.subscriptions.push(agent);
    agent.iconPath = vscode.Uri.joinPath(
        extensionContext.extensionUri,
        "./resources/light/logo.svg"
    );
    agent.description = "Databricks Assistant";
    agent.fullName = "Databricks Assistant";
    agent.subCommandProvider = {
        provideSubCommands() {
            return [
                {
                    name: "execute",
                    description:
                        "Execute the most recent Databricks CLI command from the chat",
                },
                {
                    name: "help",
                    description:
                        "Show help about the most recent Databricks CLI command from the chat",
                },
            ];
        },
    };
    agent.followupProvider = {
        provideFollowups(result, token) {
            // @ts-ignore
            if (result.cmd) {
                return [
                    {message: "@databricks /execute", title: "Yes"},
                    {message: "@databricks /help", title: "Help"},
                ];
                // @ts-ignore
            } else if (result.error) {
                return [{message: "@databricks /help", title: "Help"}];
            } else {
                return [];
            }
        },
    };
}
