import {expect} from "chai";
import {parseUvWorkspace, uvWorkspaceIncludes} from "./uvWorkspace";

describe("parseUvWorkspace", () => {
    it("reads members and exclude from a [tool.uv.workspace] table", () => {
        const toml = [
            "[tool.uv.workspace]",
            'members = ["bundles/*", "libs/*"]',
            "exclude = ['bundles/legacy'] # not ready",
        ].join("\n");
        expect(parseUvWorkspace(toml)).to.deep.equal({
            members: ["bundles/*", "libs/*"],
            exclude: ["bundles/legacy"],
        });
    });

    it("reads a members array that spans lines", () => {
        const toml = [
            "[ tool.uv.workspace ]",
            "members = [",
            '    "bundles/*", # bundles',
            '    "libs/*",',
            "]",
        ].join("\n");
        expect(parseUvWorkspace(toml)?.members).to.deep.equal([
            "bundles/*",
            "libs/*",
        ]);
    });

    it("reads an inline workspace table under [tool.uv]", () => {
        const toml =
            '[tool.uv]\nworkspace = { members = ["bundles/*"], exclude = ["bundles/x"] }\n';
        expect(parseUvWorkspace(toml)).to.deep.equal({
            members: ["bundles/*"],
            exclude: ["bundles/x"],
        });
    });

    it("reads dotted workspace keys under [tool.uv]", () => {
        const toml =
            '[tool.uv]\nworkspace.members = ["bundles/*"]\nworkspace.exclude = ["bundles/x"]\n';
        expect(parseUvWorkspace(toml)).to.deep.equal({
            members: ["bundles/*"],
            exclude: ["bundles/x"],
        });
    });

    it("skips a multi-line value of another key, even one with nested arrays", () => {
        const toml = [
            "[tool.uv]",
            "conflicts = [",
            '    [{extra = "a"}, {extra = "b"}],',
            "]",
            'workspace = { members = ["pkgs/*"] }',
        ].join("\n");
        expect(parseUvWorkspace(toml)?.members).to.deep.equal(["pkgs/*"]);
    });

    it("keeps brackets that are inside a quoted glob of an inline table", () => {
        const toml =
            '[tool.uv]\nworkspace = { members = ["bundles/[ab]", "libs/*"] }\n';
        expect(parseUvWorkspace(toml)?.members).to.deep.equal([
            "bundles/[ab]",
            "libs/*",
        ]);
    });

    it("reads a header with quoted keys", () => {
        const toml = '[tool."uv".workspace]\nmembers = ["pkgs/*"]\n';
        expect(parseUvWorkspace(toml)?.members).to.deep.equal(["pkgs/*"]);
    });

    it("ignores configuration text inside a multi-line string", () => {
        const toml = [
            "[project]",
            'description = """Example:',
            "[tool.uv.workspace]",
            'members = ["bundles/*"]',
            '"""',
        ].join("\n");
        expect(parseUvWorkspace(toml)).to.equal(undefined);
    });

    it("ignores triple quotes inside a comment", () => {
        const toml = [
            '# long text uses """',
            "[tool.uv.workspace]",
            'members = ["pkgs/*"]',
            "[project]",
            'description = """x"""',
        ].join("\n");
        expect(parseUvWorkspace(toml)?.members).to.deep.equal(["pkgs/*"]);
    });

    it("skips brackets inside a multi-line string", () => {
        const toml = [
            "[project]",
            'description = """See [docs',
            '[here]"""',
            "[tool.uv.workspace]",
            'members = ["pkgs/*"]',
        ].join("\n");
        expect(parseUvWorkspace(toml)?.members).to.deep.equal(["pkgs/*"]);
    });

    it("keeps a # that is inside a quoted glob", () => {
        const toml =
            '[tool.uv.workspace]\nmembers = ["libs/#internal", "pkgs/*"] # x\n';
        expect(parseUvWorkspace(toml)?.members).to.deep.equal([
            "libs/#internal",
            "pkgs/*",
        ]);
    });

    it("reads a workspace table that declares no members", () => {
        expect(parseUvWorkspace("[tool.uv.workspace]\n")).to.deep.equal({
            members: [],
            exclude: [],
        });
    });

    it("ignores keys of other tables", () => {
        const toml = [
            "[tool.uv.workspace]",
            'members = ["bundles/*"]',
            "[project]",
            'exclude = ["not-uv"]',
        ].join("\n");
        expect(parseUvWorkspace(toml)?.exclude).to.deep.equal([]);
    });

    it("reads quoted keys inside an inline workspace table", () => {
        const toml =
            '[tool.uv]\nworkspace = { "members" = ["pkgs/*"], \'exclude\' = ["pkgs/a"] }\n';
        expect(parseUvWorkspace(toml)).to.deep.equal({
            members: ["pkgs/*"],
            exclude: ["pkgs/a"],
        });
    });

    it("does not read an inline key name inside a quoted string", () => {
        const toml =
            '[tool.uv]\nworkspace = { exclude = ["x members = [y]"], members = ["pkgs/*"] }\n';
        expect(parseUvWorkspace(toml)?.members).to.deep.equal(["pkgs/*"]);
    });

    it("keeps its table after a quoted key with a multi-line value", () => {
        const toml = [
            "[tool.uv]",
            '"a+b" = [',
            '    ["x"],',
            "]",
            'workspace = { members = ["pkgs/*"] }',
        ].join("\n");
        expect(parseUvWorkspace(toml)?.members).to.deep.equal(["pkgs/*"]);
    });

    it("does not end a multi-line string at an escaped quote", () => {
        const toml = [
            "[project]",
            'description = """say \\""" hi"""',
            "[tool.uv.workspace]",
            'members = ["pkgs/*"]',
        ].join("\n");
        expect(parseUvWorkspace(toml)?.members).to.deep.equal(["pkgs/*"]);
    });

    it("decodes escapes in basic strings", () => {
        const toml =
            '[tool.uv.workspace]\nmembers = ["pkgs/*"]\nexclude = ["pkgs/\\u0061"]\n';
        expect(parseUvWorkspace(toml)?.exclude).to.deep.equal(["pkgs/a"]);
    });

    it("keeps a single-line triple-quoted value", () => {
        const toml =
            "[tool.uv.workspace]\nmembers = ['pkgs/*']\nexclude = ['''pkgs/a''']\n";
        expect(parseUvWorkspace(toml)?.exclude).to.deep.equal(["pkgs/a"]);
    });

    it("returns undefined without a workspace declaration", () => {
        expect(parseUvWorkspace(undefined)).to.equal(undefined);
        expect(parseUvWorkspace("[tool.uv]\npackage = false\n")).to.equal(
            undefined
        );
        expect(parseUvWorkspace("[[tool.uv.index]]\n")).to.equal(undefined);
        expect(parseUvWorkspace("# [tool.uv.workspace]\n")).to.equal(undefined);
        expect(parseUvWorkspace('desc = "[tool.uv.workspace]"\n')).to.equal(
            undefined
        );
    });
});

describe("uvWorkspaceIncludes", () => {
    const workspace = {members: ["bundles/*", "libs/core"], exclude: []};

    it("includes a folder that a member glob matches", () => {
        expect(uvWorkspaceIncludes(workspace, "bundles/a")).to.equal(true);
        expect(uvWorkspaceIncludes(workspace, "libs/core")).to.equal(true);
    });

    it("does not let a single star cross a folder boundary", () => {
        expect(uvWorkspaceIncludes(workspace, "bundles/a/b")).to.equal(false);
    });

    it("does not include a folder that no member glob matches", () => {
        expect(uvWorkspaceIncludes(workspace, "tools/a")).to.equal(false);
    });

    it("lets an exclude star cross folders, as uv does", () => {
        // uv finds members by walking folders but matches exclude as a plain
        // pattern, where `*` also matches `/`.
        expect(
            uvWorkspaceIncludes(
                {members: ["bundles/x/a"], exclude: ["bundles/*"]},
                "bundles/x/a"
            )
        ).to.equal(false);
    });

    it("matches ** as zero or more folders", () => {
        const workspace = {members: ["bundles/**/app"], exclude: []};
        expect(uvWorkspaceIncludes(workspace, "bundles/app")).to.equal(true);
        expect(uvWorkspaceIncludes(workspace, "bundles/x/y/app")).to.equal(
            true
        );
        expect(uvWorkspaceIncludes(workspace, "libs/app")).to.equal(false);
    });

    it("matches character classes, including negated ones", () => {
        const workspace = {members: ["pkgs/[!b]"], exclude: []};
        expect(uvWorkspaceIncludes(workspace, "pkgs/a")).to.equal(true);
        expect(uvWorkspaceIncludes(workspace, "pkgs/b")).to.equal(false);
    });

    it("reads a ] right after [! as part of the class", () => {
        const workspace = {members: ["pkgs/[!]a]"], exclude: []};
        expect(uvWorkspaceIncludes(workspace, "pkgs/z")).to.equal(true);
        expect(uvWorkspaceIncludes(workspace, "pkgs/a")).to.equal(false);
        expect(uvWorkspaceIncludes(workspace, "pkgs/]")).to.equal(false);
    });

    it("keeps a member class inside one folder, but not an exclude class", () => {
        expect(
            uvWorkspaceIncludes({members: ["x[!a]y"], exclude: []}, "x/y")
        ).to.equal(false);
        expect(
            uvWorkspaceIncludes({members: ["x/y"], exclude: ["x[!a]y"]}, "x/y")
        ).to.equal(false);
    });

    it("lets consecutive ** folders match zero folders", () => {
        expect(
            uvWorkspaceIncludes(
                {members: ["pkgs/*"], exclude: ["**/**/a"]},
                "pkgs/a"
            )
        ).to.equal(false);
    });

    it("reads ^ literally inside a character class, as uv does", () => {
        const workspace = {members: ["pkgs/[^b]"], exclude: []};
        expect(uvWorkspaceIncludes(workspace, "pkgs/a")).to.equal(false);
        expect(uvWorkspaceIncludes(workspace, "pkgs/^")).to.equal(true);
    });

    it("matches braces literally, as uv does", () => {
        expect(
            uvWorkspaceIncludes(
                {members: ["pkgs/{a,b}"], exclude: []},
                "pkgs/a"
            )
        ).to.equal(false);
    });

    it("ignores a trailing slash or a leading ./ in a glob", () => {
        expect(
            uvWorkspaceIncludes({members: ["./pkgs/a/"], exclude: []}, "pkgs/a")
        ).to.equal(true);
    });

    it("does not include an excluded folder", () => {
        expect(
            uvWorkspaceIncludes(
                {members: ["bundles/*"], exclude: ["bundles/a"]},
                "bundles/a"
            )
        ).to.equal(false);
    });
});
