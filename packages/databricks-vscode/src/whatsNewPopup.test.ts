import {expect} from "chai";
import {findFileFowWhatsNew} from "./whatsNewPopup";
import {SemVer} from "semver";
import * as tmp from "tmp";
import path from "path";
import {mkdir, writeFile} from "fs/promises";

describe(__filename, () => {
    let context: any;
    let removeCallback: () => void;
    let dirname: string;

    before(async () => {
        ({name: dirname, removeCallback} = tmp.dirSync({unsafeCleanup: true}));
        context = {
            asAbsolutePath: (ip: string) => path.join(dirname, ip),
        } as any;

        await mkdir(path.join(dirname, "resources", "whats-new"), {
            recursive: true,
        });
        await writeFile(
            path.join(dirname, "resources", "whats-new", "1.2.md"),
            ""
        );
    });

    after(() => {
        removeCallback();
    });

    it("should use CHANGELOG.md for patch version upgrade", async () => {
        const previousVersion = new SemVer("1.2.1");
        const currentVersion = new SemVer("1.2.2");
        expect(
            await findFileFowWhatsNew(context, previousVersion, currentVersion)
        ).to.equal(path.join(dirname, "CHANGELOG.md"));
    });

    it("should use custom markdown file for minor version upgrade", async () => {
        const previousVersion = new SemVer("1.1.2");
        const currentVersion = new SemVer("1.2.3");
        expect(
            await findFileFowWhatsNew(context, previousVersion, currentVersion)
        ).to.equal(path.join(dirname, "resources", "whats-new", "1.2.md"));
    });

    it("should use custom markdown file for major version upgrade", async () => {
        const previousVersion = new SemVer("0.1.2");
        const currentVersion = new SemVer("1.2.3");
        expect(
            await findFileFowWhatsNew(context, previousVersion, currentVersion)
        ).to.equal(path.join(dirname, "resources", "whats-new", "1.2.md"));
    });

    it("should use CHANGELOG.md if custom markdown file does not exist", async () => {
        const previousVersion = new SemVer("1.1.2");
        const currentVersion = new SemVer("1.3.3");
        expect(
            await findFileFowWhatsNew(context, previousVersion, currentVersion)
        ).to.equal(path.join(dirname, "CHANGELOG.md"));
    });
});
