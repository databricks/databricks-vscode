import "..";
import {DefaultLogger, NamedLogger} from ".";
import {PassThrough} from "stream";
import assert from "assert";

describe(__filename, () => {
    it("should scrub debug headers if DATABRICKS_DEBUG_HEADERS is not set", () => {
        process.env["DATABRICKS_DEBUG_HEADERS"] = undefined;

        const logs: string[] = [];
        const stream = new PassThrough();
        stream.on("data", (data) => {
            logs.push((data as Buffer).toString());
        });

        const logger = NamedLogger.getOrCreate(
            "TEST",
            {
                factory: (name) => new DefaultLogger(stream),
            },
            true
        );

        logger.debug("test", {
            headers: "header",
            agent: "agent",
            somethingElse: "value",
        });

        assert.equal(logs.length, 1);
        logs.forEach((value) => {
            const jsonValue = JSON.parse(value);
            delete jsonValue["timestamp"];
            assert.deepEqual(jsonValue, {
                logger: "TEST",
                level: "debug",
                message: "test",
                somethingElse: "value",
            });
        });
    });

    it("should show debug headers if DATABRICKS_DEBUG_HEADERS is set", () => {
        process.env["DATABRICKS_DEBUG_HEADERS"] = "true";

        const logs: string[] = [];
        const stream = new PassThrough();
        stream.on("data", (data) => {
            logs.push((data as Buffer).toString());
        });

        const logger = NamedLogger.getOrCreate(
            "TEST",
            {
                factory: (name) => new DefaultLogger(stream),
            },
            true
        );

        logger.debug("test", {
            headers: "header",
            agent: "agent",
            somethingElse: "value",
        });

        assert.equal(logs.length, 1);
        logs.forEach((value) => {
            const jsonValue = JSON.parse(value);
            delete jsonValue["timestamp"];
            assert.deepEqual(jsonValue, {
                logger: "TEST",
                level: "debug",
                message: "test",
                headers: "header",
                agent: "agent",
                somethingElse: "value",
            });
        });
    });

    afterEach(() => {
        process.env["DATABRICKS_DEBUG_HEADERS"] = undefined;
    });
});
