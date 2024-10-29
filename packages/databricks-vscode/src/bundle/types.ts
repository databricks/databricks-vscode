import {BundleSchema as OriginalBundleSchema} from "./BundleSchema";

type RemoveStringFromUnion<T> = T extends string ? never : T;
type RemoveStringFromUnionTypes<T> = T extends object
    ? {
          [K in keyof T]: T[K] extends string | undefined
              ? T[K]
              : RemoveStringFromUnionTypes<T[K]>;
      }
    : RemoveStringFromUnion<T>;

// CLI generates schema with additional string types added for almost complex sub types (to support complex variables).
// We usually work with `bundle validate` or `summary` outputs, which have expanded variables, so we don't need
// to account for additional string types.
export type BundleSchema = RemoveStringFromUnionTypes<OriginalBundleSchema>;
export type BundleTarget = Required<BundleSchema>["targets"][string];

export type Resources<T> = T extends {resources?: infer D} ? D : never;
export type ResourceKey<T> = keyof Resources<T>;
export type Resource<T, K extends ResourceKey<T>> = Required<
    Resources<T>
>[K][keyof Required<Resources<T>>[K]];
