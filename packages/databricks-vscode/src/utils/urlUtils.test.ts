import assert from "assert";
import {addHttpsIfNoProtocol} from "./urlUtils";

describe(__filename, () => {
    it("should add https if the url does not have it", () => {
        assert(
            addHttpsIfNoProtocol("www.example.com"),
            "https://www.example.com"
        );
    });

    it("should not add https if url has it", () => {
        assert(
            addHttpsIfNoProtocol("https://www.example.com"),
            "https://www.example.com"
        );
    });
});
