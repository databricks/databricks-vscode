/* eslint-disable @typescript-eslint/naming-convention */

import {mock, instance} from "ts-mockito";
import {ConnectionManager} from "./ConnectionManager";
import {Disposable} from "vscode";
import {CliWrapper} from "../cli/CliWrapper";

describe(__filename, () => {
    let mockedCliWrapper: CliWrapper;
    let disposables: Array<Disposable>;

    beforeEach(() => {
        disposables = [];
        mockedCliWrapper = mock(CliWrapper);
    });

    afterEach(() => {
        disposables.forEach((d) => d.dispose());
    });

    it("should create an instance", async () => {
        new ConnectionManager(instance(mockedCliWrapper));
    });

    // TODO
    // login
    // logout
    // configure
    // attach cluster
    // detach cluster
    // attach workspace
    // detach workspace
});
