import { describe, expect, it } from "vitest";
import { fetchFailed } from "../../test-support/fakeHttp";
import { AccountApiProfileError, NoWorkspaceProfileError } from "./accountOnly";
import { fixFor } from "./fix";
import { unreachableError } from "./unreachable";

const HOST = "https://a.cloud.databricks.com";
const unreachable = unreachableError(HOST, fetchFailed("ENOTFOUND"))!;

describe("fixFor", () => {
    it.each([
        { remedy: "signInAgain" as const, kind: "signInAgain", title: "Sign in again" },
        {
            remedy: "selectWorkspace" as const,
            kind: "selectWorkspace",
            title: "Select a workspace",
        },
    ])(
        "offers $title for the remedy $remedy, on the host it failed on",
        ({ remedy, kind, title }) => {
            expect(fixFor({ remedy, host: HOST, error: new Error("expired") })).toEqual({
                kind,
                title,
            });
        },
    );

    it("needs the host for the two remedies, and otherwise looks at the error", () => {
        expect(fixFor({ remedy: "signInAgain", error: new Error("expired") })).toBeUndefined();
        expect(fixFor({ remedy: "selectWorkspace", error: unreachable })).toEqual({
            kind: "retry",
            title: "Retry",
        });
    });

    it("offers Select a profile for a profile for account APIs", () => {
        expect(fixFor({ error: new AccountApiProfileError("DEFAULT") })).toEqual({
            kind: "selectProfile",
            title: "Select a profile",
        });
    });

    it("offers Select a profile for a token profile that names no workspace on a unified host", () => {
        expect(fixFor({ host: HOST, error: new NoWorkspaceProfileError("PAT", HOST) })).toEqual({
            kind: "selectProfile",
            title: "Select a profile",
        });
    });

    it("offers Retry for a host that couldn't be reached", () => {
        expect(fixFor({ host: HOST, error: unreachable })).toEqual({
            kind: "retry",
            title: "Retry",
        });
    });

    it("prefers the remedy to the error's type", () => {
        expect(
            fixFor({
                remedy: "selectWorkspace",
                host: HOST,
                error: new AccountApiProfileError("DEFAULT"),
            }),
        ).toEqual({ kind: "selectWorkspace", title: "Select a workspace" });
    });

    it("offers nothing for a session's rejected token, or any other error", () => {
        expect(fixFor({ remedy: "restartSession", host: HOST, error: new Error("x") })).toBe(
            undefined,
        );
        expect(fixFor({ host: HOST, error: new Error("x") })).toBeUndefined();
    });
});
