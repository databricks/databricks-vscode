import {VSCodeButton} from "@vscode/webview-ui-toolkit/react";
import * as React from "react";
import {default as SyntaxHighlighter} from "react-syntax-highlighter";

export class CodeBlock extends React.Component {
    constructor(props) {
        super(props);
    }

    onCopy() {
        this.props.vscode.postMessage({
            command: "copy",
            text: this.props.children,
        });
    }

    render() {
        return (
            <div>
                <button
                    className='code-block-button'
                    onClick={this.onCopy.bind(this)}
                >
                    <span className='codicon codicon-clippy'></span>
                </button>
                <button className='code-block-button'>
                    <span className='codicon codicon-play'></span>
                </button>
                <SyntaxHighlighter
                    className='code-block'
                    {...this.props}
                    children={String(this.props.children).replace(/\n$/, "")}
                    language={this.props.language}
                    PreTag='div'
                />
            </div>
        );
    }
}
