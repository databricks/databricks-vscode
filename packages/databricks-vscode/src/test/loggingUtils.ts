import {mkdirSync} from "fs";
import {mkdir, writeFile} from "fs/promises";
import path from "path";
import winston, {format, transports} from "winston";
import {findGitRoot} from "./utils";
import AsyncLock from "async-lock";

export const defaultLogsPath = path.join(
    findGitRoot()!,
    "packages/databricks-vscode/src/test/logs",
    new Date().toUTCString()
);

export class Logger {
    private static _rootLogger: winston.Logger;

    private constructor() {}

    static async getLogger(suite: string, test: string) {
        if (!this._rootLogger) {
            await mkdir(defaultLogsPath, {
                recursive: true,
            });

            this._rootLogger = winston.createLogger({
                levels: {
                    severe: 1000,
                    warning: 900,
                    info: 800,
                    devug: 700,
                    fine: 500,
                    finer: 400,
                    finest: 300,
                },
                format: format.combine(format.timestamp(), format.json()),
                transports: [
                    new transports.File({
                        dirname: defaultLogsPath,
                        filename: "test.log",
                    }),
                    new transports.Console(),
                ],
            });
        }

        return this._rootLogger.child({
            suite: suite,
            test: test,
        });
    }
}

export class ImageLogger {
    private count = 0;
    private images: string[] = [];
    private static lock = new AsyncLock();

    private constructor(readonly dirname: string) {
        mkdirSync(dirname, {recursive: true});
    }

    static getLogger(suite: string, test: string) {
        return new ImageLogger(
            path.join(
                defaultLogsPath,
                suite.replaceAll(" ", "_"),
                test.replaceAll(" ", "_")
            )
        );
    }

    private async _flush() {
        for (let image of this.images) {
            await writeFile(
                path.join(this.dirname, `image-${this.count}.png`),
                image,
                "base64"
            );
            this.count += 1;
        }

        this.images = [];
    }

    /** flushes all collected images to disk */
    async flush() {
        await ImageLogger.lock.acquire("image-array", this._flush);
    }

    /** Buffer images and flushes to disk once every 10 images */
    async log(image: string) {
        await ImageLogger.lock.acquire("image-array", () =>
            this.images.push(image)
        );

        if (this.images.length < 10) {
            return;
        }

        await this.flush();
    }
}
