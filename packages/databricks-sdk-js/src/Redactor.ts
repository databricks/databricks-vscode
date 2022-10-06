import {onlyNBytes} from "./logging";

function isPrimitveType(obj: any) {
    return Object(obj) !== obj;
}

export class Redactor {
    constructor(
        private patterns: (RegExp | string)[] = [],
        private fieldNames: string[] = []
    ) {}

    addPattern(patternOrExact: RegExp | string) {
        this.patterns.push(patternOrExact);
    }

    addFieldName(fieldName: string) {
        this.fieldNames.push(fieldName);
    }

    getNewChildRedactor() {
        //We want to pass a copy of the patterns and fieldNames to the child redactor,
        //since we don't want any changes in the child redactor to persist in the
        //parent. Slice with no params to creates a copy.
        return new Redactor(this.patterns.slice(), this.fieldNames.slice());
    }

    sanitizedToString(obj: any) {
        let jsonString = typeof obj === "string" ? obj : JSON.stringify(obj);
        this.patterns.forEach((pattern) => {
            jsonString =
                typeof pattern === "string"
                    ? jsonString.replaceAll(pattern, "***REDACTED***")
                    : jsonString.replace(pattern, "***REDACTED***");
        });

        return jsonString;
    }

    sanitize(obj: any, dropFields: string[] = [], maxFieldLength: number = 96) {
        if (isPrimitveType(obj)) {
            if (typeof obj === "string") {
                return onlyNBytes(obj, maxFieldLength);
            }
            if (obj instanceof String) {
                return onlyNBytes(obj.toString(), maxFieldLength);
            }
            return obj;
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

export const defaultRedactor = new Redactor(
    [],
    ["string_value", "token_value", "content", "Authorization"]
);
