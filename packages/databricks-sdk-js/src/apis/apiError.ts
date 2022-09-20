import {RetriableError} from "../retries/retries";

export class ApiError extends Error {
    constructor(service: string, method: string, message?: string) {
        super(`${service}.${method}: ${message}`);
    }
}

export class ApiRetriableError extends RetriableError {
    constructor(service: string, method: string, message?: string) {
        super(`${service}.${method}: ${message}`);
    }
}
