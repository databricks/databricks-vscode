import path from "path";
import * as fs from "fs/promises";
import * as os from "os";

export const DotenvKeys = {
    SPARK_REMOTE: "SPARK_REMOTE",
    DATABRICKS_CONFIG_PROFILE: "DATABRICKS_CONFIG_PROFILE",
} as const;

type DotenvKeyType = keyof typeof DotenvKeys;

export class DotenvFileManager {
    private filePath: string;
    constructor(readonly workspaceFolder: string) {
        this.filePath = path.join(
            workspaceFolder,
            ".databricks",
            "databricks.env"
        );
    }

    async readFile() {
        try {
            return (await fs.readFile(this.filePath, {encoding: "utf-8"}))
                .split(os.EOL)
                .filter((value) => value.includes("="))
                .map((value) => {
                    const segs = value.split("=");
                    return [segs[0], segs.slice(1).join("=")];
                });
        } catch (e) {
            return [];
        }
    }

    async writeFile(data: string[][]) {
        await fs.writeFile(
            this.filePath,
            data.map((value) => `${value[0]}=${value[1]}`).join(os.EOL),
            {
                encoding: "utf-8",
            }
        );
    }

    async addVar(key: DotenvKeyType, value: string) {
        const data = (await this.readFile()).filter(
            (value) => value[0].toLowerCase() !== key.toLowerCase()
        );

        data.push([key, value]);
        await this.writeFile(data);
    }

    async getVar(key: DotenvKeyType) {
        return (await this.readFile()).find(
            (value) => value[0].toLowerCase() === key.toLowerCase()
        );
    }

    async deleteVar(key: DotenvKeyType) {
        const data = (await this.readFile()).filter(
            (value) => value[0].toLowerCase() !== key.toLowerCase()
        );

        await this.writeFile(data);
    }
}
