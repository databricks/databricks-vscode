/* eslint-disable no-console */
import * as fs from "fs-extra";
import got, {OptionsOfTextResponseBody, Response} from "got";
import {promisify} from "util";
import stream = require("stream");
import {HttpProxyAgent, HttpsProxyAgent} from "hpagent";

const httpProxyAgent = !process.env.HTTP_PROXY
    ? undefined
    : new HttpProxyAgent({
          proxy: process.env.HTTP_PROXY,
      });

const httpsProxyAgent = !process.env.HTTPS_PROXY
    ? undefined
    : new HttpsProxyAgent({
          proxy: process.env.HTTPS_PROXY,
      });

// This is to prevent Unhandled Promise Rejections in got
// See: https://github.com/sindresorhus/got/issues/1489#issuecomment-805485731
function isGotResponseOk(response: Response) {
    const {statusCode} = response;
    const limitStatusCode = response.request.options.followRedirect ? 299 : 399;

    return (
        (statusCode >= 200 && statusCode <= limitStatusCode) ||
        statusCode === 304
    );
}

const options: OptionsOfTextResponseBody & {isStream?: undefined} = {
    headers: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "user-agent": "nodejs",
    },
    agent: {
        http: httpProxyAgent,
        https: httpsProxyAgent,
    },
    hooks: {
        afterResponse: [
            (response) => {
                if (isGotResponseOk(response)) {
                    response.request.destroy();
                }

                return response;
            },
        ],
    },
};

export class Download {
    static async getText(uri: string): Promise<string> {
        const body = await got(uri, options).text();
        return JSON.parse(body as string);
    }

    static getFile(
        uri: string,
        destination: string,
        progress = false
    ): Promise<void> {
        console.log("PATCHED DOWNLOAD");

        let lastTick = 0;
        const dlStream = got.stream(uri, options);
        if (progress) {
            dlStream.on("downloadProgress", ({transferred, total, percent}) => {
                const currentTime = Date.now();
                if (
                    total > 0 &&
                    (lastTick === 0 ||
                        transferred === total ||
                        currentTime - lastTick >= 2000)
                ) {
                    console.log(
                        `progress: ${transferred}/${total} (${Math.floor(
                            100 * percent
                        )}%)`
                    );
                    lastTick = currentTime;
                }
            });
        }
        const writeStream = fs.createWriteStream(destination);

        return promisify(stream.pipeline)(dlStream, writeStream);
    }
}
