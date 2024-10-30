import {expect} from "chai";
import {toString, toDateString, toTimeString} from "./DateUtils";

describe("DateUtils", () => {
    describe("toString", () => {
        it("should return the correct date and time string", () => {
            const date = new Date("2023-10-05T14:48:00");
            const result = toString(date);
            expect(result).to.equal("5 Oct, 2023 14:48:00");
        });
    });

    describe("toDateString", () => {
        it("should return the correct date string", () => {
            const date = new Date("2023-10-05T14:48:00");
            const result = toDateString(date);
            expect(result).to.equal("5 Oct, 2023");
        });
    });

    describe("toTimeString", () => {
        it("should return the correct time string", () => {
            const date = new Date("2023-10-05T14:48:00");
            const result = toTimeString(date);
            expect(result).to.equal("14:48:00");
        });
    });
});
