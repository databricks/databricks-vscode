import fs from "fs";
import {EventTypes, MetadataTypes} from "../src/telemetry/constants";

function writeSerializedClassToFile(outputPath: string): void {
    const res = {
        events: new EventTypes(),
        metadata: new MetadataTypes(),
    };
    const json = JSON.stringify(res, null, 2);
    fs.writeFileSync(outputPath, json, "utf8");
}

writeSerializedClassToFile("telemetry.json");
