interface IDocItem {
    readonly aws?: string;
    readonly gcp?: string;
    readonly azure?: string;
    readonly default?: string;
}

type Cloud = "aws" | "azure" | "gcp" | "default";
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

    toString() {
        return this[this.cloud];
    }

    constructor(
        readonly details: Omit<IDocItem, "default"> &
            Required<Pick<IDocItem, "default">>,
        readonly cloud: Cloud = "default",
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
    visibleString(params?: P, cloud: Cloud = "default") {
        return this.data.visibleStr({docs: this.processDocs(cloud), params});
    }

    constructor(
        readonly data: IUserFacingStringItem<D, P>,
        readonly defaultDocs: Doc,
        readonly location: StringLocation = "default"
    ) {}

    private processDocs(cloud: Cloud = "default") {
        if (this.data.docs === undefined) {
            return {defaultDocs: this.defaultDocs};
        }

        const copyDocs: any = {};
        Object.keys(this.data.docs).forEach((key) => {
            copyDocs[key] = new Doc(
                {
                    ...this.defaultDocs.details,
                    ...(this.data.docs as Record<string, IDocItem>)[key],
                },
                cloud,
                this.location
            );
        });

        return copyDocs as ProcessedDocs<D, P>;
    }
}
