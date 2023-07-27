/* eslint-disable @typescript-eslint/naming-convention */

import assert from "node:assert";
import {WorkspaceClient} from "../../WorkspaceClient";

describe(__filename, function () {
    let w: WorkspaceClient;

    this.timeout(10 * 60 * 1000);

    before(async () => {
        w = new WorkspaceClient({});
    });

    it("should support listing query history with filter parameters", async () => {
        await w.queryHistory.list({
            filter_by: {
                query_start_time_range: {
                    start_time_ms: 1690329600000,
                    end_time_ms: 1690416000000,
                },
            },
        });
    });
});
