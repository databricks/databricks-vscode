export {type BundleSchema} from "./BundleSchema";

import {BundleSchema} from "./BundleSchema";
export type BundleTarget = Required<BundleSchema>["targets"][string];
