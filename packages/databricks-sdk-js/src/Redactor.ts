export function onlyNBytes(str: string, numBytes: number) {
    return str.length > numBytes
        ? str.slice(0, numBytes) + `...(${str.length - numBytes} more bytes)`
        : str;
}

function isPrimitveType(obj: any) {
    return Object(obj) !== obj;
}

export class Redactor {
    constructor(private fieldNames: string[] = []) {}

    addFieldName(fieldName: string) {
        this.fieldNames.push(fieldName);
    }

    sanitize(
        obj: any,
        dropFields: string[] = [],
        maxFieldLength: number = 96
    ): any {
        if (isPrimitveType(obj)) {
            if (typeof obj === "string") {
                return onlyNBytes(obj, maxFieldLength);
            }
            if (obj instanceof String) {
                return onlyNBytes(obj.toString(), maxFieldLength);
            }
            return obj;
        }

        if (Array.isArray(obj)) {
            return obj.map((e) => this.sanitize(e, dropFields, maxFieldLength));
        }

        //make a copy of the object
        obj = JSON.parse(JSON.stringify(obj));
        for (let key in obj) {
            if (dropFields.includes(key)) {
                delete obj[key];
            } else if (
                isPrimitveType(obj[key]) &&
                this.fieldNames.includes(key)
            ) {
                obj[key] = "***REDACTED***";
            } else {
                obj[key] = this.sanitize(obj[key], dropFields, maxFieldLength);
            }
        }

        return obj;
    }
}

export const defaultRedactor = new Redactor([
    "string_value",
    "token_value",
    "content",
]);
