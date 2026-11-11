import {
    InputBoxValidationSeverity,
    QuickInputButtons,
    QuickPickItemKind,
    window,
    type Disposable,
    type Event,
    type InputBox,
    type QuickInput,
    type QuickInputButton,
    type QuickPick,
    type QuickPickItem,
} from "vscode";
import { CancelledError } from "../errors";

/**
 * The quick-pick kit every wizard uses: multi-step inputs with Back, a
 * quick pick that accepts free text, and pickers whose items load
 * asynchronously. Ported from the old `ui/MultiStepInputWizard.ts`, which
 * came from the VS Code `quickinput-sample`
 * (https://github.com/microsoft/vscode-extension-samples/tree/main/quickinput-sample/src).
 */

/** Thrown inside a step to navigate; never escapes `MultiStepInput.run`. */
const InputFlowAction = {
    back: Symbol("back"),
    cancel: Symbol("cancel"),
    resume: Symbol("resume"),
} as const;

export type InputStep = (input: MultiStepInput) => Thenable<InputStep | void>;

type ValidationMessage = {
    message: string;
    type: "error" | "warning";
};

type Validator = (value: string) => Promise<string | undefined | ValidationMessage>;

const SEVERITY = {
    error: InputBoxValidationSeverity.Error,
    warning: InputBoxValidationSeverity.Warning,
};

/** The `vscode.window` factories the kit uses; injectable for tests. */
export interface QuickInputFactory {
    createQuickPick<T extends QuickPickItem>(): QuickPick<T>;
    createInputBox(): InputBox;
}

interface StepParameters {
    title: string;
    step: number;
    totalSteps: number;
    placeholder: string;
    buttons?: QuickInputButton[];
    /** Called for buttons other than Back. */
    onButton?: (button: QuickInputButton) => void;
    ignoreFocusOut?: boolean;
    /** Whether hiding the input pauses the wizard rather than cancelling it. */
    shouldResume?: () => Thenable<boolean>;
}

export interface QuickAutoCompleteParameters extends StepParameters {
    items: QuickPickItem[];
    /** Listed first and focused, so Enter accepts it. */
    activeItem?: QuickPickItem;
    validate?: Validator;
    /** What typed text names: see `TypedMatch`. */
    matchesTyped?: (typed: string) => TypedMatch;
}

/**
 * What typed text names. `rows` are the items that show whatever their labels
 * say, first; typed text that finds some isn't offered as a new item. A
 * `refusal` replaces the list with an error item, even where a label contains
 * the text.
 */
export interface TypedMatch {
    readonly rows: readonly QuickPickItem[];
    readonly refusal?: string;
}

export interface QuickPickParameters<T extends QuickPickItem, L = never> extends StepParameters {
    /** A promise shows the picker busy until it settles. */
    items: T[] | Promise<T[]>;
    activeItem?: T | ((items: T[]) => T | undefined);
    /** Filters on each item's description too, as on its label. */
    matchOnDescription?: boolean;
    /** Items that load while the picker is open, with `items` shown meanwhile. */
    loading?: LoadingItems<T, L>;
}

interface LoadingItems<T extends QuickPickItem, L> {
    /** Settles with what loaded. A rejection keeps the items shown. */
    readonly loaded: Promise<L>;
    /** All the items to show once `loaded` settles, including those shown meanwhile. */
    readonly withLoaded: (loaded: L) => T[];
    /**
     * Picks this item instead, when `loaded` settles before the user has
     * typed or moved to another item: the choice is made for them. Undefined
     * shows the items as usual.
     */
    readonly pickIfUntouched?: (loaded: L) => T | undefined;
}

export interface InputBoxParameters extends StepParameters {
    initialValue?: string;
    password?: boolean;
    validate?: Validator;
    /** Runs once `validate` passes on Enter, with the input busy: for a check too slow to run on every keystroke. */
    validateOnAccept?: Validator;
}

/** What quick picks and input boxes have in common, beyond `QuickInput`. */
type PresentableInput = QuickInput & {
    placeholder: string | undefined;
    buttons: readonly QuickInputButton[];
    readonly onDidTriggerButton: Event<QuickInputButton>;
};

interface EditItem extends QuickPickItem {
    edit: true;
    error: boolean;
}

function isEditItem(item: QuickPickItem | undefined): item is EditItem {
    return (item as EditItem | undefined)?.edit === true;
}

export class MultiStepInput {
    private current?: QuickInput;
    private steps: InputStep[] = [];

    private constructor(private readonly factory: QuickInputFactory) {}

    /**
     * Runs the steps until one returns nothing. Back, cancel and resume are
     * handled here. A cancelled wizard throws `CancelledError`, which the
     * command registry keeps silent.
     */
    static async run(start: InputStep, factory: QuickInputFactory = window): Promise<void> {
        const input = new MultiStepInput(factory);
        await input.stepThrough(start);
    }

    hide() {
        this.current?.hide();
    }

    show() {
        this.current?.show();
    }

    private async stepThrough(start: InputStep) {
        let step: InputStep | void = start;
        let cancelled = false;
        try {
            while (step) {
                this.steps.push(step);
                if (this.current) {
                    this.current.enabled = false;
                    this.current.busy = true;
                }
                try {
                    step = await step(this);
                } catch (err) {
                    if (err === InputFlowAction.back) {
                        this.steps.pop();
                        step = this.steps.pop();
                    } else if (err === InputFlowAction.resume) {
                        step = this.steps.pop();
                    } else if (err === InputFlowAction.cancel) {
                        cancelled = true;
                        step = undefined;
                    } else {
                        throw err;
                    }
                }
            }
        } finally {
            this.current?.dispose();
        }
        if (cancelled) {
            throw new CancelledError();
        }
    }

    /**
     * A quick pick that also accepts free text. Typed text that matches no
     * item becomes item 0, with the validation message as its detail; an
     * error blocks accepting it. VS Code has no built-in input like this.
     */
    async showQuickAutoComplete(params: QuickAutoCompleteParameters): Promise<string> {
        const { validate } = params;
        const items = params.activeItem
            ? [params.activeItem, ...params.items.filter((i) => i !== params.activeItem)]
            : [...params.items];
        return this.present<string, QuickPick<QuickPickItem>>(
            this.factory.createQuickPick<QuickPickItem>(),
            params,
            (input, resolve, disposables) => {
                input.items = items;
                if (params.activeItem) {
                    input.activeItems = [params.activeItem];
                }
                // Labels match case-insensitively, as VS Code's filter does.
                let shown: readonly QuickPickItem[] = [];
                disposables.push(
                    input.onDidChangeValue(async () => {
                        const value = input.value;
                        const match: TypedMatch =
                            value === ""
                                ? { rows: [] }
                                : (params.matchesTyped?.(value) ?? { rows: [] });
                        const named = [...match.rows];
                        const refusal = match.refusal;
                        const changed =
                            named.length !== shown.length ||
                            named.some((item, k) => item !== shown[k]);
                        if (changed) {
                            const namedSet = new Set(named);
                            for (const item of items) {
                                item.alwaysShow = namedSet.has(item);
                            }
                            shown = named;
                        }
                        if (refusal !== undefined) {
                            const refused: EditItem = {
                                label: value,
                                detail: `$(error) ${refusal}`,
                                edit: true,
                                error: true,
                            };
                            input.items = [refused];
                            input.activeItems = [refused];
                            return;
                        }
                        if (changed || isEditItem(input.items[0])) {
                            input.items = items;
                        }
                        if (named.length > 0) {
                            input.activeItems = [named[0]!];
                        }
                        const typed = value.toLowerCase();
                        if (
                            value === "" ||
                            named.length > 0 ||
                            items.some((item) => item.label.toLowerCase().includes(typed))
                        ) {
                            return;
                        }
                        let message = validate ? await validate(value) : undefined;
                        if (input.value !== value) {
                            // The user kept typing while we validated.
                            return;
                        }
                        if (typeof message === "string") {
                            message = { message, type: "error" };
                        }
                        const edit: EditItem = {
                            label: value,
                            detail: message ? `$(${message.type}) ${message.message}` : undefined,
                            edit: true,
                            error: message?.type === "error",
                        };
                        input.items = [edit, ...items];
                    }),
                    input.onDidChangeSelection((selected) => {
                        const first = selected[0];
                        if (!first || (isEditItem(first) && first.error)) {
                            return;
                        }
                        resolve(first.label);
                    }),
                );
            },
        );
    }

    async showQuickPick<T extends QuickPickItem, L = never>(
        params: QuickPickParameters<T, L>,
    ): Promise<T> {
        return this.present<T, QuickPick<T>>(
            this.factory.createQuickPick<T>(),
            params,
            (input, resolve, disposables, reject) => {
                const apply = (items: T[]) => {
                    input.items = items;
                    const active =
                        typeof params.activeItem === "function"
                            ? params.activeItem(items)
                            : params.activeItem;
                    if (active) {
                        input.activeItems = [active];
                    }
                };
                if (params.matchOnDescription) {
                    input.matchOnDescription = true;
                }
                if (Array.isArray(params.items)) {
                    apply(params.items);
                } else {
                    input.busy = true;
                    params.items
                        .then(apply, reject)
                        .finally(() => {
                            // The old pickers stayed busy after loading.
                            input.busy = false;
                        })
                        .catch(() => {});
                }
                if (params.loading !== undefined) {
                    const { loaded, withLoaded, pickIfUntouched } = params.loading;
                    // VS Code focuses the first item when the picker opens; moving off it is a choice.
                    const shown = Array.isArray(params.items) ? params.items : [];
                    const focused = shown.find((i) => i.kind !== QuickPickItemKind.Separator);
                    let touched = false;
                    let open = true;
                    disposables.push(
                        input.onDidChangeValue(() => {
                            touched = true;
                        }),
                        input.onDidChangeActive((active) => {
                            if (active[0]?.label !== focused?.label) {
                                touched = true;
                            }
                        }),
                        { dispose: () => (open = false) },
                    );
                    input.busy = true;
                    loaded
                        .then(
                            (result) => {
                                if (!open) {
                                    return;
                                }
                                const pick = touched ? undefined : pickIfUntouched?.(result);
                                if (pick !== undefined) {
                                    resolve(pick);
                                    return;
                                }
                                input.busy = false;
                                apply(withLoaded(result));
                            },
                            () => {
                                if (open) {
                                    input.busy = false;
                                }
                            },
                        )
                        .catch(reject);
                }
                disposables.push(
                    input.onDidChangeSelection((selected) => selected[0] && resolve(selected[0])),
                );
            },
        );
    }

    async showInputBox(params: InputBoxParameters): Promise<string> {
        const { validate } = params;
        return this.present<string, InputBox>(
            this.factory.createInputBox(),
            params,
            (input, resolve, disposables) => {
                input.value = params.initialValue ?? "";
                input.password = params.password ?? false;
                let blocked = false;
                const check = async (value: string) => {
                    const message = validate ? await validate(value) : undefined;
                    blocked =
                        message !== undefined &&
                        (typeof message === "string" || message.type === "error");
                    input.validationMessage =
                        message === undefined || typeof message === "string"
                            ? message
                            : { message: message.message, severity: SEVERITY[message.type] };
                };
                disposables.push(
                    input.onDidChangeValue((value) => void check(value)),
                    input.onDidAccept(async () => {
                        const value = input.value;
                        await check(value);
                        if (blocked) {
                            return;
                        }
                        if (params.validateOnAccept !== undefined) {
                            input.busy = true;
                            let message;
                            try {
                                message = await params.validateOnAccept(value);
                            } finally {
                                input.busy = false;
                            }
                            if (input.value !== value) {
                                // The user kept typing while we checked.
                                return;
                            }
                            if (message !== undefined) {
                                input.validationMessage =
                                    typeof message === "string"
                                        ? message
                                        : {
                                              message: message.message,
                                              severity: SEVERITY[message.type],
                                          };
                                if (typeof message === "string" || message.type === "error") {
                                    return;
                                }
                            }
                        }
                        resolve(value);
                    }),
                );
            },
        );
    }

    /** Shared wiring: title and steps, Back, hide, and replacing the previous input. */
    private async present<R, I extends PresentableInput>(
        input: I,
        params: StepParameters,
        wire: (
            input: I,
            resolve: (value: R) => void,
            disposables: Disposable[],
            reject: (reason: unknown) => void,
        ) => void,
    ): Promise<R> {
        const disposables: Disposable[] = [];
        try {
            return await new Promise<R>((resolve, reject) => {
                input.title = params.title;
                input.step = params.step;
                input.totalSteps = params.totalSteps;
                input.placeholder = params.placeholder;
                input.ignoreFocusOut = params.ignoreFocusOut ?? true;
                input.buttons = [
                    ...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
                    ...(params.buttons ?? []),
                ];
                disposables.push(
                    input.onDidTriggerButton((button) => {
                        if (button === QuickInputButtons.Back) {
                            reject(InputFlowAction.back);
                        } else {
                            params.onButton?.(button);
                        }
                    }),
                    input.onDidHide(() => {
                        (async () => {
                            reject(
                                params.shouldResume && (await params.shouldResume())
                                    ? InputFlowAction.resume
                                    : InputFlowAction.cancel,
                            );
                        })().catch(reject);
                    }),
                );
                wire(input, resolve, disposables, reject);
                this.current?.dispose();
                this.current = input;
                this.current.show();
            });
        } finally {
            disposables.forEach((d) => d.dispose());
        }
    }
}
