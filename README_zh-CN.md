# VSCode 的 Databricks 扩展

<!-- hy-mt2-i18n:start -->
[English](./README.md) | **中文** | [日本語](./README_ja.md) | [Español](./README_es.md)
<!-- hy-mt2-i18n:end -->


| 系统                                                                                   | 状态                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 构建版本（[主分支](https://github.com/databricks/databricks-vscode/commits/main)）      | [![GitHub CI 状态](https://github.com/databricks/databricks-vscode/actions/workflows/push.yml/badge.svg?branch=main)](https://github.com/databricks/databricks-vscode/actions/workflows/push.yml) [![codecov](https://codecov.io/gh/databricks/databricks-vscode/branch/main/graph/badge.svg?token=PUN77X0W3Z)](https://codecov.io/gh/databricks/databricks-vscode) |
| [VSCode 市场店](https://marketplace.visualstudio.com/items?itemName=databricks.databricks) | [![市场店版本](https://img.shields.io/vscode-marketplace/v/databricks.databricks.svg)![市场店下载量](https://img.shields.io/vscode-marketplace/d/databricks.databricks.svg)](https://marketplace.visualstudio.com/items?itemName=databricks.databricks)                                                                                            |

## 简介

该仓库包含了用于 VSCode 的 Databricks 扩展的源代码。

目前，我们拥有以下包：

-   [databricks-vscode](https://github.com/databricks/databricks-vscode/tree/main/packages/databricks-vscode)
    发布在 VSCode 市场上的 Databricks VSCode 扩展。
-   [databricks-vscode-types](https://github.com/databricks/databricks-vscode/tree/main/packages/databricks-vscode-types)
    该 VSCode 扩展公共 API 的类型定义。

### 入门指南

准备 Yarn：

```
npm install -g yarn@3
yarn install
```

Databricks JavaScript SDK（`@databricks/sdk-experimental`）是普通的 npm 依赖项，会通过 `yarn install` 自动安装——无需额外操作。

准备 Databricks CLI：

在 Yarn 工作空间中执行命令：`databricks run package:cli:fetch`

之后您就可以开始构建和测试 `databricks-vscode` 扩展了。

### 发现问题了？

如果您发现了问题/漏洞或有功能需求，请在此处提交 issue：https://github.com/databricks/databricks-vscode/issues/new

同时，请按照此说明附上日志：https://docs.databricks.com/dev-tools/vscode-ext.html#send-usage-logs-to-databricks。
