export function humaniseMode(mode?: string) {
    if (mode === undefined) {
        return "";
    }
    return mode.charAt(0).toUpperCase() + mode.slice(1);
}
