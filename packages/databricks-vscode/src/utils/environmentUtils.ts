import {Environment} from "../language/MsPythonExtensionApi";

export function environmentName(env: Environment) {
    const version = env.version
        ? `${env.version.major}.${env.version.minor}.${env.version.micro} `
        : "";
    const name = env.environment?.name ?? env.path;
    return `${version}${name}`;
}
