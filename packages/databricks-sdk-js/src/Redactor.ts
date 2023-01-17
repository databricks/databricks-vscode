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
    count = 0;
    addFieldName(fieldName: string) {
        this.fieldNames.push(fieldName);
    }

    sanitize(
        obj?: any,
        dropFields: string[] = [],
        seen: Set<any> = new Set()
    ): any {
        if (seen.has(obj)) {
            return `circular ref`;
        }
        seen.add(obj);
        if (obj === undefined) {
            return undefined;
        }

        if (isPrimitveType(obj)) {
            return obj;
        }
        if (Array.isArray(obj)) {
            return obj.map((e) => this.sanitize(e, dropFields, seen));
        }
        this.count += 1;
        if (this.count === 4) {
            return;
        }

        //make a copy of the object
        const copyObj = Object.assign({}, obj);
        for (const key in copyObj) {
            if (dropFields.includes(key)) {
                delete copyObj[key];
            } else if (
                isPrimitveType(obj[key]) &&
                this.fieldNames.includes(key)
            ) {
                copyObj[key] = "***REDACTED***";
            } else {
                copyObj[key] = this.sanitize(obj[key], dropFields, seen);
            }
        }

        return copyObj;
    }
}

export const defaultRedactor = new Redactor([
    "string_value",
    "token_value",
    "content",
]);
