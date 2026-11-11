import { PipelinesClient } from "@databricks/sdk-pipelines/v2";
import type { PipelineEvent as SdkPipelineEvent } from "@databricks/sdk-pipelines/v2";
import type { CallOptions } from "@databricks/sdk-options/call";
import { z } from "zod";
import type { ApiClients } from "./ApiClients";

/*
 * Pipeline events through the SDK. Its schemas drop two undocumented
 * fields the explorer reads: `details.dataset_definition` (a dataset's type
 * and columns) and `origin.source_code_location` (where an event happened in
 * the source). So each page's client keeps the raw body, and the fields are
 * read from it, as the old extension read them from V1's raw JSON. When in
 * doubt, a field is dropped rather than attached to the wrong event.
 */

const sourceCodeLocation = z
    .looseObject({
        path: z.string().optional(),
        line_number: z.number().optional(),
        notebook_cell_number: z.number().optional(),
    })
    .transform((l) => ({
        path: l.path,
        lineNumber: l.line_number,
        notebookCellNumber: l.notebook_cell_number,
    }));

const datasetDefinition = z
    .looseObject({
        dataset_type: z.string().optional(),
        schema: z
            .array(z.looseObject({ name: z.string().optional(), data_type: z.string().optional() }))
            .optional(),
    })
    .transform((d) => ({
        datasetType: d.dataset_type,
        schema: d.schema?.map((f) => ({ name: f.name, dataType: f.data_type })),
    }));

// Each field is caught on its own, so a malformed one drops only itself.
const rawPage = z.looseObject({
    events: z
        .array(
            z.looseObject({
                id: z.string().optional().catch(undefined),
                details: z
                    .looseObject({
                        dataset_definition: datasetDefinition.optional().catch(undefined),
                    })
                    .optional()
                    .catch(undefined),
                origin: z
                    .looseObject({
                        source_code_location: sourceCodeLocation.optional().catch(undefined),
                    })
                    .optional()
                    .catch(undefined),
            }),
        )
        .optional()
        .catch(undefined),
});

/** A pipeline event, with the two undocumented fields the SDK drops. */
export interface PipelineEvent extends SdkPipelineEvent {
    readonly origin?:
        | (NonNullable<SdkPipelineEvent["origin"]> & {
              /** Undocumented: where in the pipeline's source the event happened. */
              readonly sourceCodeLocation?:
                  | {
                        readonly path?: string | undefined;
                        readonly lineNumber?: number | undefined;
                        readonly notebookCellNumber?: number | undefined;
                    }
                  | undefined;
          })
        | undefined;
    /** Undocumented (`details.dataset_definition`): a dataset's type and columns. */
    readonly datasetDefinition?:
        | {
              readonly datasetType?: string | undefined;
              readonly schema?:
                  | readonly {
                        readonly name?: string | undefined;
                        readonly dataType?: string | undefined;
                    }[]
                  | undefined;
          }
        | undefined;
}

export interface ListPipelineEventsRequest {
    readonly pipelineId: string;
    /** For example `update_id = '…' AND timestamp > '…'`. */
    readonly filter?: string;
    readonly orderBy?: readonly string[];
    readonly maxResults?: number;
}

/** `GET /api/2.0/pipelines/{id}/events`, page by page. */
export async function* listPipelineEvents(
    api: ApiClients,
    req: ListPipelineEventsRequest,
    options: CallOptions = {},
): AsyncGenerator<PipelineEvent> {
    const { pipelineId, maxResults } = req;
    let pageToken: string | undefined;
    do {
        const okBodies: Uint8Array[] = [];
        const client = api.fresh(PipelinesClient, (transport) => ({
            async send(request) {
                const response = await transport.send(request);
                const body = new Uint8Array(await new Response(response.body).arrayBuffer());
                if (response.statusCode >= 200 && response.statusCode < 300) {
                    okBodies.push(body);
                }
                return { ...response, body: new Response(body).body };
            },
        }));
        // The API refuses a filter or an order alongside a page token, so
        // later pages send only the token (`eventsIter` resends everything).
        const page = await client.events(
            pageToken === undefined
                ? {
                      pipelineId,
                      filter: req.filter,
                      orderBy: req.orderBy && [...req.orderBy],
                      maxResults,
                  }
                : { pipelineId, pageToken, maxResults },
            options,
        );
        const events = page.events ?? [];
        // With more than one successful response, which one the SDK parsed is unknown.
        const raw =
            events.length === 0 || okBodies.length !== 1
                ? []
                : (rawPage.parse(JSON.parse(new TextDecoder().decode(okBodies[0]))).events ?? []);
        const byId = new Map(raw.map((e) => [e.id, e]));
        for (const event of events) {
            const extra = event.id === undefined ? undefined : byId.get(event.id);
            const location = extra?.origin?.source_code_location;
            yield {
                ...event,
                ...(location !== undefined
                    ? { origin: { ...event.origin, sourceCodeLocation: location } }
                    : {}),
                datasetDefinition: extra?.details?.dataset_definition,
            };
        }
        pageToken = page.nextPageToken || undefined;
    } while (pageToken !== undefined);
}
