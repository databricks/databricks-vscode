export enum TimeUnits {
    milliseconds,
    seconds,
    minutes,
    hours,
}

class InvalidTimeValueError extends Error {}

export default class Time {
    value: number;
    units: TimeUnits;

    constructor(value: number, units: TimeUnits) {
        this.units = units;
        this.value = value;
    }

    public toMillSeconds(): Time {
        let secondsValue = 0;
        switch (this.units) {
            case TimeUnits.hours:
                secondsValue = this.value * 60 * 60 * 1000;
                break;
            case TimeUnits.minutes:
                secondsValue = this.value * 60 * 1000;
                break;
            case TimeUnits.seconds:
                secondsValue = this.value * 1000;
                break;
            case TimeUnits.milliseconds:
                secondsValue = this.value;
                break;
        }
        return new Time(secondsValue, TimeUnits.seconds);
    }

    public add(other: Time): Time {
        return new Time(
            this.toMillSeconds().value + other.toMillSeconds().value,
            TimeUnits.milliseconds
        );
    }

    public sub(other: Time): Time {
        return new Time(
            this.toMillSeconds().value - other.toMillSeconds().value,
            TimeUnits.milliseconds
        );
    }

    public multiply(other: number): Time {
        return new Time(this.value * other, this.units);
    }

    public gt(other: Time): boolean {
        return this.toMillSeconds().value > other.toMillSeconds().value;
    }
}
