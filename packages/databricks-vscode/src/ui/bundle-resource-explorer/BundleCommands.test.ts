import assert from "node:assert/strict";
import {pipelineRefreshArgs} from "./BundleCommands";

describe("pipelineRefreshArgs", () => {
    for (const fullRefresh of [false, true]) {
        const flag = fullRefresh ? "--full-refresh" : "--refresh";
        it(`passes one ${flag} per selected table`, () => {
            assert.deepEqual(
                pipelineRefreshArgs(
                    [
                        "orders",
                        "sales.order details",
                        "`a.b`.`x,y`",
                        "file:archive",
                        "a`b",
                    ],
                    fullRefresh
                ),
                [
                    flag,
                    "orders",
                    flag,
                    "sales.`order details`",
                    flag,
                    "`a.b`.`x,y`",
                    flag,
                    "`file:archive`",
                    flag,
                    "`a``b`",
                ]
            );
        });
    }
});
