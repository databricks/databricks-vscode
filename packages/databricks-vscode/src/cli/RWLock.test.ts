import assert from "assert";
import {Mutex, RWLock} from "./RWLock";

describe(__filename, async () => {
    it("mutext should enforce sequential order", async () => {
        const mutex = new Mutex();
        const outputs: string[] = [];

        async function spawn(name: string) {
            await mutex.wait();
            outputs.push(name);
            mutex.signal();
        }

        await Promise.all([spawn("1"), spawn("2"), spawn("3")]);

        assert.deepEqual(outputs, ["1", "2", "3"]);
    });
    it("should allow writer only after all readers are done processing", async () => {
        const rwLock = new RWLock();
        const outputs: string[] = [];

        async function spawnReader(name: string) {
            await rwLock.readerEntry();
            outputs.push(name);
            await rwLock.readerExit();
        }

        async function spawnWriter(name: string) {
            await rwLock.writerEntry();
            outputs.push(name);
            await rwLock.writerExit();
        }

        await Promise.all([
            spawnReader("r_1"),
            spawnReader("r_2"),
            spawnReader("r_3"),
            spawnReader("r_4"),
            spawnWriter("w_1"),
            spawnReader("r_5"),
            spawnWriter("w_2"),
            spawnReader("r_6"),
            spawnReader("r_7"),
        ]);

        assert.deepEqual(outputs, [
            "r_1",
            "r_2",
            "r_3",
            "r_4",
            "r_5",
            "r_6",
            "r_7",
            "w_1",
            "w_2",
        ]);
    });
});
