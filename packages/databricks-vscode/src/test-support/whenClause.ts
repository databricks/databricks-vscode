/**
 * VS Code when-clauses, read with three values, for contract tests that ask
 * whether a clause can hold where only some keys are known: `true`, `false`,
 * or `undefined` when it depends on the others. Logic is Kleene's: `false &&
 * x` is false and `true || x` true, whatever `x` is. It reads what
 * `package.json` uses: `!`, `&&`, `||`, parentheses, bare keys, and
 * `key <op> value` with `==`, `!=`, `=~ /regex/`, `<`, `<=`, `>`, `>=`.
 */

export type Truth = boolean | undefined;

/** One key, alone or compared: its truth, or undefined when unknown. */
export type Atom = (key: string, op?: string, value?: string) => Truth;

type Token = { kind: "(" | ")" | "!" | "&&" | "||" | "op" | "word"; text: string };

function tokenize(clause: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    while (i < clause.length) {
        const rest = clause.slice(i);
        const space = /^\s+/.exec(rest);
        if (space) {
            i += space[0].length;
            continue;
        }
        const symbol = /^(&&|\|\||==|!=|=~|<=|>=|<|>|\(|\)|!)/.exec(rest);
        if (symbol) {
            const text = symbol[0];
            const kind = ["(", ")", "!", "&&", "||"].includes(text)
                ? (text as Token["kind"])
                : "op";
            tokens.push({ kind, text });
            i += text.length;
            // After `=~` comes a regex literal, which may hold any of the symbols.
            if (text === "=~") {
                const regex = /^\s*(\/(?:[^/\\]|\\.)*\/[a-z]*)/.exec(clause.slice(i));
                if (regex) {
                    tokens.push({ kind: "word", text: regex[1]! });
                    i += regex[0].length;
                }
            }
            continue;
        }
        const quoted = /^'([^']*)'/.exec(rest);
        if (quoted) {
            tokens.push({ kind: "word", text: quoted[1]! });
            i += quoted[0].length;
            continue;
        }
        const word = /^[^\s()!&|=<>~']+/.exec(rest);
        if (!word) {
            throw new Error(`Can't read "${clause}" at ${i}`);
        }
        tokens.push({ kind: "word", text: word[0] });
        i += word[0].length;
    }
    return tokens;
}

const not = (t: Truth): Truth => (t === undefined ? undefined : !t);
const and = (a: Truth, b: Truth): Truth =>
    a === false || b === false ? false : a === true && b === true ? true : undefined;
const or = (a: Truth, b: Truth): Truth =>
    a === true || b === true ? true : a === false && b === false ? false : undefined;

/** The clause's truth when each atom's is `atom`'s. Throws on what it can't read. */
export function evaluateWhen(clause: string, atom: Atom): Truth {
    const tokens = tokenize(clause);
    let pos = 0;
    const peek = () => tokens[pos];
    const take = (kind: Token["kind"]) => {
        const token = tokens[pos];
        if (token?.kind !== kind) {
            throw new Error(`Expected ${kind} in "${clause}"`);
        }
        pos++;
        return token;
    };
    const expression = (): Truth => {
        let value = conjunction();
        while (peek()?.kind === "||") {
            pos++;
            value = or(value, conjunction());
        }
        return value;
    };
    const conjunction = (): Truth => {
        let value = unary();
        while (peek()?.kind === "&&") {
            pos++;
            value = and(value, unary());
        }
        return value;
    };
    const unary = (): Truth => {
        if (peek()?.kind === "!") {
            pos++;
            return not(unary());
        }
        if (peek()?.kind === "(") {
            pos++;
            const value = expression();
            take(")");
            return value;
        }
        const key = take("word").text;
        if (peek()?.kind === "op") {
            const op = take("op").text;
            return atom(key, op, take("word").text);
        }
        return atom(key);
    };
    const value = expression();
    if (pos !== tokens.length) {
        throw new Error(`Can't read "${clause}" past ${tokens[pos]?.text}`);
    }
    return value;
}
