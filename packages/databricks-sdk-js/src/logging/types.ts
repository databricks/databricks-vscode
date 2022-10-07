export interface LogEntry {
    level: string;
    message: string;
    [k: string]: any;
}

export interface Logger {
    log: (level: string, message?: string, meta?: any) => void;
}
