/* eslint-disable no-console */
import {ESLintUtils, AST_NODE_TYPES} from "@typescript-eslint/utils";

const rule = ESLintUtils.RuleCreator.withoutDocs({
    create(context) {
        return {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            Decorator(node) {
                if (
                    node.expression.type === "CallExpression" &&
                    node.expression.callee.type ===
                        AST_NODE_TYPES.MemberExpression &&
                    node.expression.callee.object.type ===
                        AST_NODE_TYPES.Identifier &&
                    node.expression.callee.object.name === "Mutex" &&
                    node.expression.callee.property.type ===
                        AST_NODE_TYPES.Identifier &&
                    node.expression.callee.property.name === "synchronise" &&
                    node.expression.arguments.length > 0
                ) {
                    const mutexName =
                        node.expression.arguments[0].type ===
                        AST_NODE_TYPES.Literal
                            ? (node.expression.arguments[0].value as string)
                            : "";

                    if (node.parent.parent?.type !== AST_NODE_TYPES.ClassBody) {
                        return context.report({
                            node,
                            messageId: "decoratorNotInClass",
                        });
                    }

                    const exists = node.parent.parent.body.some((element) => {
                        return (
                            element.type ===
                                AST_NODE_TYPES.PropertyDefinition &&
                            element.key.type === AST_NODE_TYPES.Identifier &&
                            element.key.name === mutexName
                        );
                    });

                    const className =
                        node.parent.parent.parent?.type ===
                        AST_NODE_TYPES.ClassDeclaration
                            ? node.parent.parent.parent.id?.name
                            : undefined;

                    if (!exists) {
                        return context.report({
                            node,
                            messageId: "synchronisedMutexNotInClass",
                            data: {
                                mutexName,
                                className,
                            },
                        });
                    }
                }
            },
        };
    },
    meta: {
        type: "problem",
        schema: [],
        messages: {
            decoratorNotInClass:
                "Mutex.synchronized() should be used inside a class",
            synchronisedMutexNotInClass:
                'Mutex "{{mutexName}}" is not defined in class "{{className}}".',
        },
    },
    defaultOptions: [],
});

export default rule;
