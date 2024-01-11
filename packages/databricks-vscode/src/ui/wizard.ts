// -------------------------------------------------------
// Helper code that wraps the API for the multi-step case.
// -------------------------------------------------------

// from https://github.com/microsoft/vscode-extension-samples/tree/main/quickinput-sample/src

import {
    QuickPickItem,
    QuickInputButton,
    QuickInput,
    Disposable,
    window,
    QuickInputButtons,
    InputBoxValidationSeverity,
} from "vscode";

export class InputFlowAction {
    static back = new InputFlowAction();
    static cancel = new InputFlowAction();
    static resume = new InputFlowAction();
}

interface EditItem {
    label: string;
    detail?: string;
    edit: boolean;
    error: boolean;
}

export type InputStep = (input: MultiStepInput) => Thenable<InputStep | void>;
export type ValidationMessageType = {
    message: string;
    type: "error" | "warning";
};

// eslint-disable-next-line @typescript-eslint/naming-convention
const ValidationMessageTypeToInputBoxSeverity = {
    error: InputBoxValidationSeverity.Error,
    warning: InputBoxValidationSeverity.Warning,
};

interface QuickAutoCompleteParameters {
    title: string;
    step: number;
    totalSteps: number;
    placeholder: string;
    validate: (
        value: string
    ) => Promise<string | undefined | ValidationMessageType>;
    buttons?: QuickInputButton[];
    shouldResume: () => Thenable<boolean>;
    items: Array<QuickPickItem>;
    ignoreFocusOut: boolean;
}

interface QuickPickParameters<T extends QuickPickItem> {
    title: string;
    step: number;
    totalSteps: number;
    items: T[];
    activeItem?: T;
    placeholder: string;
    buttons?: QuickInputButton[];
    shouldResume: () => Thenable<boolean>;
    ignoreFocusOut: boolean;
}

interface InputBoxParameters {
    title: string;
    step: number;
    totalSteps: number;
    placeholder: string;
    initialValue?: string;
    validate: (
        value: string
    ) => Promise<string | undefined | ValidationMessageType>;
    buttons?: QuickInputButton[];
    ignoreFocusOut: boolean;
}

export class MultiStepInput {
    static async run(start: InputStep) {
        const input = new MultiStepInput();
        return input.stepThrough(start);
    }

    private current?: QuickInput;
    private steps: InputStep[] = [];

    private async stepThrough(start: InputStep) {
        let step: InputStep | void = start;
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
                    step = undefined;
                } else {
                    throw err;
                }
            }
        }
        if (this.current) {
            this.current.dispose();
        }
    }

    /**
     * Creates a quick inout box with an auto completion list.
     *
     * VSCode doesn't have a built-in way to do this, so we have to create a custom quick pick.
     */
    async showQuickAutoComplete({
        title,
        step,
        totalSteps,
        placeholder,
        validate,
        buttons,
        shouldResume,
        items,
        ignoreFocusOut,
    }: QuickAutoCompleteParameters): Promise<
        | string
        | (QuickAutoCompleteParameters extends {buttons: (infer I)[]}
              ? I
              : never)
    > {
        const disposables: Disposable[] = [];
        try {
            return await new Promise<
                | string
                | (QuickAutoCompleteParameters extends {buttons: (infer I)[]}
                      ? I
                      : never)
            >((resolve, reject) => {
                const input = window.createQuickPick<
                    QuickPickItem | EditItem
                >();
                input.title = title;
                input.step = step;
                input.totalSteps = totalSteps;
                input.placeholder = placeholder;
                input.items = [...items];
                input.ignoreFocusOut = ignoreFocusOut;

                disposables.push(
                    input.onDidChangeValue(async () => {
                        // INJECT user values into proposed values
                        for (const item of items) {
                            if (item.label.indexOf(input.value) !== -1) {
                                if (
                                    (input.items[0] as EditItem).edit === true
                                ) {
                                    input.items = [...items];
                                }
                                return;
                            }
                        }

                        if (
                            input.value === "" &&
                            input.items[0] &&
                            (input.items[0] as EditItem).edit === true
                        ) {
                            input.items = [...items];
                        } else if (input.value !== "") {
                            let validationMessage = validate
                                ? await validate(input.value)
                                : undefined;

                            if (typeof validationMessage === "string") {
                                validationMessage = {
                                    message: validationMessage,
                                    type: "error",
                                };
                            }

                            input.items = [
                                {
                                    label: input.value,
                                    detail: validationMessage
                                        ? `$(${validationMessage.type}) ${validationMessage.message}`
                                        : undefined,
                                    edit: true,
                                    error: validationMessage?.type === "error",
                                } as EditItem,
                                ...items,
                            ];
                        }
                    })
                );

                input.buttons = [
                    ...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
                    ...(buttons || []),
                ];
                disposables.push(
                    input.onDidTriggerButton((item) => {
                        if (item === QuickInputButtons.Back) {
                            reject(InputFlowAction.back);
                        } else {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            resolve(item as any);
                        }
                    }),
                    input.onDidChangeSelection((items) => {
                        const firstItem = items[0] as EditItem;
                        if (!firstItem || (firstItem.edit && firstItem.error)) {
                            return;
                        }

                        resolve(items[0].label);
                    }),
                    input.onDidHide(() => {
                        (async () => {
                            reject(
                                shouldResume && (await shouldResume())
                                    ? InputFlowAction.resume
                                    : InputFlowAction.cancel
                            );
                        })().catch(reject);
                    })
                );
                if (this.current) {
                    this.current.dispose();
                }
                this.current = input;
                this.current.show();
            });
        } finally {
            disposables.forEach((d) => d.dispose());
        }
    }

    async showQuickPick<
        T extends QuickPickItem,
        P extends QuickPickParameters<T>,
    >({
        title,
        step,
        totalSteps,
        items,
        activeItem,
        placeholder,
        buttons,
        shouldResume,
        ignoreFocusOut,
    }: P) {
        const disposables: Disposable[] = [];
        try {
            return await new Promise<
                T | (P extends {buttons: (infer I)[]} ? I : never)
            >((resolve, reject) => {
                const input = window.createQuickPick<T>();
                input.title = title;
                input.step = step;
                input.totalSteps = totalSteps;
                input.placeholder = placeholder;
                input.items = items;
                input.ignoreFocusOut = ignoreFocusOut;
                if (activeItem) {
                    input.activeItems = [activeItem];
                }
                input.buttons = [
                    ...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
                    ...(buttons || []),
                ];
                disposables.push(
                    input.onDidTriggerButton((item) => {
                        if (item === QuickInputButtons.Back) {
                            reject(InputFlowAction.back);
                        } else {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            resolve(<any>item);
                        }
                    }),
                    input.onDidChangeSelection((items) => resolve(items[0])),
                    input.onDidHide(() => {
                        (async () => {
                            reject(
                                shouldResume && (await shouldResume())
                                    ? InputFlowAction.resume
                                    : InputFlowAction.cancel
                            );
                        })().catch(reject);
                    })
                );
                if (this.current) {
                    this.current.dispose();
                }
                this.current = input;
                this.current.show();
            });
        } finally {
            disposables.forEach((d) => d.dispose());
        }
    }

    async showInputBox({
        title,
        step,
        totalSteps,
        placeholder,
        initialValue,
        buttons,
        validate,
        ignoreFocusOut,
    }: InputBoxParameters) {
        const disposables: Disposable[] = [];
        try {
            return await new Promise<string | undefined>((resolve, reject) => {
                const input = window.createInputBox();
                input.title = title;
                input.step = step;
                input.totalSteps = totalSteps;
                input.placeholder = placeholder;
                input.ignoreFocusOut = ignoreFocusOut;
                input.value = initialValue ?? "";
                input.buttons = [
                    ...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
                    ...(buttons || []),
                ];

                disposables.push(
                    input.onDidTriggerButton((item) => {
                        if (item === QuickInputButtons.Back) {
                            reject(InputFlowAction.back);
                        } else {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            resolve(<any>item);
                        }
                    }),
                    input.onDidHide(() => reject(InputFlowAction.cancel)),
                    input.onDidChangeValue(async (value) => {
                        const validationMessage = validate
                            ? await validate(value)
                            : undefined;

                        if (
                            validationMessage === undefined ||
                            typeof validationMessage === "string"
                        ) {
                            input.validationMessage = validationMessage;
                        } else {
                            input.validationMessage = {
                                message: validationMessage.message,
                                severity:
                                    ValidationMessageTypeToInputBoxSeverity[
                                        validationMessage.type
                                    ],
                            };
                        }
                    }),
                    input.onDidAccept(() => {
                        resolve(input.value);
                    })
                );

                if (this.current) {
                    this.current.dispose();
                }
                this.current = input;
                this.current.show();
            });
        } finally {
            disposables.forEach((d) => d.dispose());
        }
    }
}
