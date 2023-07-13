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
} from "vscode";

class InputFlowAction {
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

type InputStep = (input: MultiStepInput) => Thenable<InputStep | void>;

interface QuickAutoCompleteParameters {
    title: string;
    step: number;
    totalSteps: number;
    prompt: string;
    validate: (value: string) => Promise<string | undefined>;
    buttons?: QuickInputButton[];
    shouldResume: () => Thenable<boolean>;
    items: Array<QuickPickItem>;
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
}

interface InputBoxParameters {
    title: string;
    step: number;
    totalSteps: number;
    value: string;
    prompt: string;
    validate: (value: string) => Promise<string | undefined>;
    buttons?: QuickInputButton[];
    shouldResume: () => Thenable<boolean>;
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
        prompt,
        validate,
        buttons,
        shouldResume,
        items,
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
                input.placeholder = prompt;
                input.items = [...items];

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
                            const validationMessage = validate
                                ? await validate(input.value)
                                : undefined;

                            input.items = [
                                {
                                    label: input.value,
                                    detail: validationMessage
                                        ? `$(error) ${validationMessage}`
                                        : undefined,
                                    edit: true,
                                    error: !!validationMessage,
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

    async showInputBox<P extends InputBoxParameters>({
        title,
        step,
        totalSteps,
        value,
        prompt,
        validate,
        buttons,
        shouldResume,
    }: P) {
        const disposables: Disposable[] = [];
        try {
            return await new Promise<
                string | (P extends {buttons: (infer I)[]} ? I : never)
            >((resolve, reject) => {
                const input = window.createInputBox();
                input.title = title;
                input.step = step;
                input.totalSteps = totalSteps;
                input.value = value || "";
                input.prompt = prompt;
                input.ignoreFocusOut = true;
                input.buttons = [
                    ...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
                    ...(buttons || []),
                ];
                let validating = validate("");
                disposables.push(
                    input.onDidTriggerButton((item) => {
                        if (item === QuickInputButtons.Back) {
                            reject(InputFlowAction.back);
                        } else {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            resolve(<any>item);
                        }
                    }),
                    input.onDidAccept(async () => {
                        const value = input.value;
                        input.enabled = false;
                        input.busy = true;
                        if (!(await validate(value))) {
                            resolve(value);
                        }
                        input.enabled = true;
                        input.busy = false;
                    }),
                    input.onDidChangeValue(async (text) => {
                        const current = validate(text);
                        validating = current;
                        const validationMessage = await current;
                        if (current === validating) {
                            input.validationMessage = validationMessage;
                        }
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
}
