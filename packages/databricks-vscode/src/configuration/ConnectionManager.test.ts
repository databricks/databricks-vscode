/* eslint-disable @typescript-eslint/naming-convention */

import {Disposable} from "vscode";

describe(__filename, () => {
    let disposables: Array<Disposable>;

    beforeEach(() => {
        disposables = [];
    });

    afterEach(() => {
        disposables.forEach((d) => d.dispose());
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
