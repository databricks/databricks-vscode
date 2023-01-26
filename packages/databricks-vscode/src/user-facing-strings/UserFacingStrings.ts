interface IDocItem {
    readonly aws?: string;
    readonly gcp?: string;
    readonly azure?: string;
    readonly default?: string;
}

export class Doc implements IDocItem {
    get aws() {
        return this.details.aws;
    }
    get gcp() {
        return this.details.gcp;
    }
    get azure() {
        return this.details.azure;
    }
    get default() {
        return this.details.default;
    }
    constructor(
        readonly details: Omit<IDocItem, "default"> &
            Required<Pick<IDocItem, "default">>,
        readonly location: StringLocation = "default"
    ) {}
}

type ProcessedDocs<D extends Exclude<string, "defaultDocs">, P> = Record<
    keyof IUserFacingStringItem<D, P>["docs"],
    Doc
> & {defaultDocs: Doc};

export interface IUserFacingStringItem<
    D extends Exclude<string, "defaultDocs">,
    P
> {
    visibleStr: (data: {docs: ProcessedDocs<D, P>; params?: P}) => string;
    nonVisibleDescription?: string;
    docs?: Record<D, IDocItem>;
}

type StringLocation =
    | "terminal"
    | "notification.toast.error"
    | "notification.toast.warn"
    | "notification.toast.info"
    | "tooltip.hover"
    | "quickpick.items.details"
    | "treeview.item.details"
    | "treeview.item.label"
    | "default";

export class UserFacingString<P, D extends string = string> {
    visibleString(params?: P) {
        return this.data.visibleStr({docs: this.processedDocs, params});
    }

    private processedDocs: ProcessedDocs<D, P>;
    constructor(
        readonly data: IUserFacingStringItem<D, P>,
        defaultDocs: Doc,
        readonly location: StringLocation = "default"
    ) {
        if (data.docs === undefined) {
            this.processedDocs = {defaultDocs};
            return;
        }

        const copyDocs: any = {};
        Object.keys(data.docs).forEach((key) => {
            copyDocs[key] = new Doc(
                {
                    ...defaultDocs.details,
                    ...(data.docs as Record<string, IDocItem>)[key],
                },
                location
            );
        });

        this.processedDocs = copyDocs as ProcessedDocs<D, P>;
    }
}
