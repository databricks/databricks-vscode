/* eslint-disable @typescript-eslint/naming-convention */
import {ApiClient} from "../api-client";

export interface LibrariesInstallRequest {
    cluster_id: string;
    libraries: Array<
        | {
              jar: string;
          }
        | {
              egg: string;
          }
        | {
              whl: string;
          }
        | {
              maven: {
                  coordinates: string;
                  exclusions?: Array<string>;
              };
          }
        | {
              pypi: {
                  package: string;
                  repo?: string;
              };
          }
        | {
              cran: {
                  package: string;
                  repo?: string;
              };
          }
    >;
}

interface LibrariesInstallResponse {}

export class LibrariesApi {
    constructor(readonly client: ApiClient) {}

    async install(
        req: LibrariesInstallRequest
    ): Promise<LibrariesInstallResponse> {
        return (await this.client.request(
            "/api/2.0/libraries/install",
            "POST",
            req
        )) as LibrariesInstallResponse;
    }
}
