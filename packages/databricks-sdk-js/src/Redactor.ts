export class Redactor {
    constructor(
        private patterns: (RegExp | string)[] = [],
        private paths: string[] = []
    ) {}

    addPattern(patternOrExact: RegExp | string) {
        this.patterns.push(patternOrExact);
    }

    addPath(...pathComponents: string[]) {
        this.paths.push(pathComponents.join("."));
    }

    getNewChildRedactor() {
        //We want to pass a copy of the patterns and paths to the child redactor,
        //since we don't want any changes in the child redactor to persist in the
        //parent. Slice with no params to creates a copy.
        return new Redactor(this.patterns.slice(), this.paths.slice());
    }

    redactToString(obj: any) {
        let jsonString = typeof obj === "string" ? obj : JSON.stringify(obj);
        this.patterns.forEach((pattern) => {
            jsonString =
                typeof pattern === "string"
                    ? jsonString.replaceAll(pattern, "REDACTED")
                    : jsonString.replace(pattern, "REDACTED");
        });

        //TODO: add functinoailty to redact fields by path

        return jsonString;
    }
}

export const defaultRedactor = new Redactor();
