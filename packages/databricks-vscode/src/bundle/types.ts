export {type BundleSchema} from "./BundleSchema";
import {BundleSchema} from "./BundleSchema";

export type BundleTarget = Required<BundleSchema>["targets"][string];
export type Resources<T> = T extends {resources?: infer D} ? D : never;
export type ResourceKey<T> = keyof Resources<T>;
export type Resource<T, K extends ResourceKey<T>> = Required<
    Resources<T>
>[K][keyof Required<Resources<T>>[K]];
