# Databricks Extension for VSCode Interfaces and Types

Package with types and interfaces required for extending the Databricks VSCode extension.

## How to extend the Databricks VSCode extension

### Importing and using the API

package.json

```json
{
    ...
    "extensionDependencies": [
		"databricks.databricks-vscode"
	],
    "devDependencies": {
        ...
        "@databricks/databricks-vscode-types": "*",
    }
}
```

src/extension.ts

```js
import {PublicApi} from "@databricks/databricks-vscode-types";

export async function activate(context: vscode.ExtensionContext) {
    const dbExtension =
        extensions.getExtension < PublicApi > "databricks.databricks-vscode";

    if (!dbExtension) {
        throw new Error("Databricks extension not installed");
    }
    await dbExtension.activate();
    const dbApi = dbExtension.exports;
    //...
}
```

### Adding a view to the Databricks activity bar

```js
    "contributes" {
        // ...
		"views": {
			"databricksBar": [
				{
					"id": "databricksJobs",
					"name": "Jobs"
				},
                // ...
            ],
            // ...
        }
    }
```
