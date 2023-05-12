/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-inner-declarations */

import * as React from "react";
import * as ReactDOM from "react-dom/client";
import {VSCodeButton, VSCodeTextArea} from "@vscode/webview-ui-toolkit/react";
import ReactMarkdown from "react-markdown";
import {CodeBlock} from "./CodeBlock";

interface MessageProps {
    user: string;
    text: string;
}

const Message = (props: MessageProps & {vscode: any}) => {
    const vscode = props.vscode;
    return (
        <div className='message'>
            <div className='message_user'>{props.user}</div>
            <ReactMarkdown
                className='message_text'
                children={props.text}
                components={{
                    code({node, inline, className, children, ...props}) {
                        const match = /language-(\w+)/.exec(className || "");
                        return !inline && match ? (
                            <CodeBlock
                                {...props}
                                children={String(children).replace(/\n$/, "")}
                                language={match[1]}
                                vscode={vscode}
                                PreTag='div'
                            />
                        ) : (
                            <code {...props} className={className}>
                                {children}
                            </code>
                        );
                    },
                }}
            />
        </div>
    );
};

class Assistant extends React.Component {
    messages: Array<MessageProps>;
    vscode: any;
    textValue: string;
    state: Record<string, any>;

    constructor(props: {vscode: any}) {
        super(props);

        this.vscode = props.vscode;

        this.state = {
            textValue: "print hello world in python",
            messages: [
                {
                    user: "Assistant",
                    text: "Hello, I'm your assistant. How can I help you?",
                },
            ],
        };

        window.addEventListener("message", (event) => {
            const data = event.data;
            // If the message is a new message
            if (data.command === "message") {
                this.state.messages.push(data);
                this.setState((state) => {
                    return {
                        ...state,
                        messages: state.messages,
                    };
                });
            } else if (data.command === "reset") {
                this.setState((state) => {
                    return {
                        ...state,
                        messages: [
                            {
                                user: "Assistant",
                                text: "Hello, I'm your assistant. How can I help you?",
                            },
                        ],
                    };
                });
            }
        });
    }

    componentDidMount() {
        const oldState = vscode.getState();
        if (oldState) {
            this.setState((state) => {
                return oldState;
            });
        }
    }

    onClick() {
        this.send();
    }

    onTextChange(e) {
        // todo move to state
        this.state.textValue = e.target.value;
    }

    send() {
        // Send a message to the extension
        this.vscode.postMessage({
            command: "submit",
            text: this.state.textValue,
        });

        this.setState((state) => {
            return {
                ...state,
                textValue: "",
            };
        });
    }

    setState(mutator) {
        super.setState(mutator);
        this.vscode.setState(this.state);
    }

    render() {
        return (
            <div className='container'>
                <div id='chat'>
                    {this.state.messages
                        .concat()
                        .reverse()
                        .map((message) => {
                            return (
                                <Message
                                    user={message.user}
                                    text={message.text}
                                    vscode={this.vscode}
                                />
                            );
                        })}
                </div>
                <VSCodeTextArea
                    id='text-area'
                    placeholder='Enter your message'
                    value={this.state.textValue}
                    onInput={this.onTextChange.bind(this)}
                    onKeyPress={(e) => {
                        if (e.key === "Enter") {
                            this.send();
                        }
                    }}
                    autofocus
                ></VSCodeTextArea>
                <VSCodeButton onClick={this.onClick.bind(this)}>
                    Submit
                </VSCodeButton>
            </div>
        );
    }
}

let vscode;

if (typeof (window as any).acquireVsCodeApi !== "undefined") {
    vscode = (window as any).acquireVsCodeApi();
}

const root = ReactDOM.createRoot(
    document.getElementById("root") as HTMLElement
);
root.render(<Assistant vscode={vscode} />);
