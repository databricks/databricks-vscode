export function toString(date: Date): string {
    return toDateString(date) + " " + toTimeString(date);
}

export function toDateString(date: Date): string {
    const day = date.getDay();
    const month = date.toLocaleString("default", {month: "short"});
    const year = date.getFullYear();

    return `${day} ${month}, ${year}`;
}

export function toTimeString(date: Date): string {
    return date.toLocaleTimeString();
}
