/**
 * A value for a request field the SDK puts in the URL path. The SDK inserts
 * such values unencoded, so a `#` in a Unity Catalog name ends the path and a
 * `?` starts the query, and the request reaches another object. Each part
 * between `/` is encoded, as the SDK already does for file paths.
 * `pathValue.test.ts` fails once the SDK encodes them itself; then drop this.
 */
export function pathValue(value: string): string {
    return value.split("/").map(encodeURIComponent).join("/");
}
