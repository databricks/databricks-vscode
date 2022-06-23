import {equal} from "assert";
import {ApiClient} from "./api-client";

describe("API Client", () => {
    it("create an instance of the client", () => {
        let client = new ApiClient("https://databricks.com", "PAT");
    });
});
