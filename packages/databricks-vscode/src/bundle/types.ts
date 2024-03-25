import {BundleSchema as OriginalBundleSchema} from "./BundleSchema";

export type BundleTarget = Omit<
    Required<OriginalBundleSchema>["targets"][string],
    "variables"
> & {
    // Use custom override for in-target variable type, because CLI < v0.215.0
    // uses the same class for both in-target and global variables.
    // TODO: Remove this override when fixed in CLI (> v0.215.0).
    variables?: {
        [k: string]: (
            | string
            | Required<
                  Required<OriginalBundleSchema>["variables"][string]
              >["lookup"]
        ) & {value?: string};
    };
};

export type BundleSchema = Omit<OriginalBundleSchema, "targets"> & {
    targets?: {[k: string]: BundleTarget};
};

export type Resources<T> = T extends {resources?: infer D} ? D : never;
export type ResourceKey<T> = keyof Resources<T>;
export type Resource<T, K extends ResourceKey<T>> = Required<
    Resources<T>
>[K][keyof Required<Resources<T>>[K]];
