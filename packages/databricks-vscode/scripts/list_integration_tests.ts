import {glob} from "glob";
import path from "path";

const integrationTests = glob.sync(
    path.join("src", "test", "e2e", "**", "*.e2e.ts")
);

// eslint-disable-next-line no-console
console.log(JSON.stringify(integrationTests));
