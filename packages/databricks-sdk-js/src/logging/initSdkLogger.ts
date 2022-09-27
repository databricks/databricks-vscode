import {ExposedLoggers} from "./ExposedLoggers";
import {NamedLogger} from "./NamedLogger";
import Transport from "winston-transport";

class WinstonNullTransport extends Transport {
    constructor(opts?: Transport.TransportStreamOptions) {
        super(opts);
    }

    log(info: any, cb: () => void) {
        //NOOP
        cb();
    }
}

NamedLogger.getOrCreate(ExposedLoggers.SDK).configure({
    transports: new WinstonNullTransport(),
});
