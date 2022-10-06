export function onlyNBytes(str: string, numBytes: number) {
    return str.length > numBytes
        ? str.slice(0, numBytes) + `...(${str.length - numBytes} more bytes)`
        : str;
}
