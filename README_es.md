# Extensión de Databricks para VSCode

<!-- hy-mt2-i18n:start -->
[English](./README.md) | [中文](./README_zh-CN.md) | [日本語](./README_ja.md) | **Español**
<!-- hy-mt2-i18n:end -->


| Sistema                                                                                   | Estado                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compilación ([rama principal](https://github.com/databricks/databricks-vscode/commits/main))      | [![Estado de GitHub CI](https://github.com/databricks/databricks-vscode/actions/workflows/push.yml/badge.svg?branch=main)](https://github.com/databricks/databricks-vscode/actions/workflows/push.yml) [![codecov](https://codecov.io/gh/databricks/databricks-vscode/branch/main/graph/badge.svg?token=PUN77X0W3Z)](https://codecov.io/gh/databricks/databricks-vscode) |
| [Marketplace](https://marketplace.visualstudio.com/items?itemName=databricks.databricks) | [![Versión en Marketplace](https://img.shields.io/vscode-marketplace/v/databricks.databricks.svg)![Descargas en Marketplace](https://img.shields.io/vscode-marketplace/d/databricks.databricks.svg)](https://marketplace.visualstudio.com/items?itemName=databricks.databricks)                                                                                            |

## Introducción

Este repositorio contiene el código fuente de las extensiones de Databricks para VSCode.

Actualmente, contamos con los siguientes paquetes:

-   [databricks-vscode](https://github.com/databricks/databricks-vscode/tree/main/packages/databricks-vscode)
    La extensión para VSCode de Databricks publicada en el marketplace de VSCode.
-   [databricks-vscode-types](https://github.com/databricks/databricks-vscode/tree/main/packages/databricks-vscode-types)
    Definiciones de tipos para la API pública de la extensión para VSCode.

### Primeros pasos

Preparar Yarn:

```
npm install -g yarn@3
yarn install
```

El SDK de JavaScript de Databricks (`@databricks/sdk-experimental`) es una dependencia habitual de npm y se instala automáticamente mediante `yarn install`; no se requiere ningún paso adicional.

Preparar la CLI de Databricks:

```
yarn workspace databricks run package:cli:fetch
```

Después de eso, estará listo para compilar y probar la extensión `databricks-vscode`.

### ¿Encontró un problema?

Si encuentra algún problema o error, o tiene una solicitud de funcionalidad, por favor cree un ticket aquí: https://github.com/databricks/databricks-vscode/issues/new

Por favor, adjunte también los registros siguiendo estas instrucciones: https://docs.databricks.com/dev-tools/vscode-ext.html#send-usage-logs-to-databricks.
