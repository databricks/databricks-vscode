import {expect} from "chai";
import {collectBundleServerlessVersions} from "./bundleServerlessVersions";

describe("collectBundleServerlessVersions", () => {
    it("finds a serverless environment_version in a job's environments", () => {
        const bundle = {
            resources: {
                jobs: {
                    my_job: {
                        environments: [
                            {
                                environment_key: "default",
                                spec: {environment_version: "5"},
                            },
                        ],
                    },
                },
            },
        };

        expect(collectBundleServerlessVersions(bundle)).to.deep.equal([
            {version: "5", source: "bundleYaml"},
        ]);
    });

    it("collects versions from multiple resources and dedupes them", () => {
        const bundle = {
            resources: {
                jobs: {
                    a: {
                        environments: [
                            {spec: {environment_version: "5"}},
                            {spec: {environment_version: "4"}},
                        ],
                    },
                    b: {
                        environments: [{spec: {environment_version: "5"}}],
                    },
                },
            },
        };

        const observed = collectBundleServerlessVersions(bundle);
        // "5" appears twice but is emitted once; order follows first sight.
        expect(observed).to.deep.equal([
            {version: "5", source: "bundleYaml"},
            {version: "4", source: "bundleYaml"},
        ]);
    });

    it("coerces a numeric environment_version to a bare string", () => {
        // YAML may parse an unquoted version as a number.
        const bundle = {
            resources: {jobs: {a: {environments: [{spec: {environment_version: 5}}]}}},
        };

        expect(collectBundleServerlessVersions(bundle)).to.deep.equal([
            {version: "5", source: "bundleYaml"},
        ]);
    });

    it("ignores string-valued (unresolved) spec/environment nodes without throwing", () => {
        // Bundle nodes can be raw strings (variable interpolation) rather than
        // objects; the walk must tolerate that.
        const bundle = {
            resources: {
                jobs: {a: {environments: "${var.envs}"}},
                pipelines: {p: "${var.pipeline}"},
            },
        };

        expect(collectBundleServerlessVersions(bundle)).to.deep.equal([]);
    });

    it("returns nothing for an empty or version-less bundle", () => {
        expect(collectBundleServerlessVersions(undefined)).to.deep.equal([]);
        expect(collectBundleServerlessVersions({})).to.deep.equal([]);
        expect(
            collectBundleServerlessVersions({
                resources: {jobs: {a: {tasks: []}}},
            })
        ).to.deep.equal([]);
    });

    it("skips empty or non-scalar environment_version values", () => {
        const bundle = {
            resources: {
                jobs: {
                    a: {environments: [{spec: {environment_version: ""}}]},
                    b: {environments: [{spec: {environment_version: {}}}]},
                },
            },
        };

        expect(collectBundleServerlessVersions(bundle)).to.deep.equal([]);
    });
});
