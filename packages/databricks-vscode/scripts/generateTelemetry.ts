import fs from 'fs';
import { EventTypes } from "../src/telemetry/constants";

function writeSerializedClassToFile(outputPath: string): void {
  const json = JSON.stringify(new EventTypes(), null, 2);
  fs.writeFileSync(outputPath, json, 'utf8');
}

writeSerializedClassToFile("telemetry.json");
