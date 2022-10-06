import "..";
import {
    loggerInstance,
    logOpId,
    withLogContext,
    NamedLogger,
    DefaultLogger,
} from ".";
import {PassThrough} from "stream";
import assert from "assert";

class B {
    @withLogContext("Test")
    async run(
        @logOpId() opId?: string,
        @loggerInstance() logger?: NamedLogger
    ) {
        logger?.debug("B: start");
        await new Promise((resolve) => {
            setTimeout(resolve, 1000);
        });
        logger?.debug("B: end");
    }
}

class A {
    private b = new B();

    @withLogContext("Test")
    async run(
        @logOpId() opId?: string,
        @loggerInstance() logger?: NamedLogger
    ) {
        logger?.debug("A: start");
        await this.b.run(logger?.opId);
        logger?.debug("A: end");
    }
}

describe(__filename, () => {
    it("should log multiple contexts", async () => {
        const logs: string[] = [];
        const stream = new PassThrough();
        stream.on("data", (data) => {
            logs.push((data as Buffer).toString());
        });
        const logger = NamedLogger.getOrCreate("Test", {
            factory: (name) => {
                return new DefaultLogger(stream);
            },
        });

        const firstExec = new A().run("testId");
        const secondExec = new A().run("testId2");

        await firstExec;
        await secondExec;

        assert.equal(logs.length, 8);

        const jsonLogs = logs.map((value) => JSON.parse(value));
        function findLog(id: string, target: string) {
            return jsonLogs.find(
                (v) => v.message.includes(target) && v.operationId === id
            );
        }

        function testForExec(execId: string) {
            assert.notEqual(findLog(execId, "A: start"), undefined);
            assert.notEqual(findLog(execId, "B: start"), undefined);
            assert.notEqual(findLog(execId, "B: end"), undefined);
            assert.notEqual(findLog(execId, "A: end"), undefined);

            assert.ok(
                findLog(execId, "A: start")?.timestamp <=
                    findLog(execId, "B: start")?.timestamp
            );
            assert.ok(
                findLog(execId, "B: start")?.timestamp <=
                    findLog(execId, "B: end")?.timestamp
            );
            assert.ok(
                findLog(execId, "B: end")?.timestamp <=
                    findLog(execId, "A: end")?.timestamp
            );
        }

        testForExec("testId");
        testForExec("testId2");
    });
});
