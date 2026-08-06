# VSCode用のDatabricks拡張機能

<!-- hy-mt2-i18n:start -->
[English](./README.md) | [中文](./README_zh-CN.md) | **日本語** | [Español](./README_es.md)
<!-- hy-mt2-i18n:end -->


| システム                                                                                   | ステータス                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ビルド ([main branch](https://github.com/databricks/databricks-vscode/commits/main))      | [![GitHub CI Status](https://github.com/databricks/databricks-vscode/actions/workflows/push.yml/badge.svg?branch=main)](https://github.com/databricks/databricks-vscode/actions/workflows/push.yml) [![codecov](https://codecov.io/gh/databricks/databricks-vscode/branch/main/graph/badge.svg?token=PUN77X0W3Z)](https://codecov.io/gh/databricks/databricks-vscode) |
| [Marketplace](https://marketplace.visualstudio.com/items?itemName=databricks.databricks) | [![Marketplace Version](https://img.shields.io/vscode-marketplace/v/databricks.databricks.svg)![Marketplace Downloads](https://img.shields.io/vscode-marketplace/d/databricks.databricks.svg)](https://marketplace.visualstudio.com/items?itemName=databricks.databricks)                                                                                            |

## はじめに

このリポジトリには、VSCode向けDatabricks拡張機能のソースコードが含まれています。

現在、以下のパッケージがあります：

-   [databricks-vscode](https://github.com/databricks/databricks-vscode/tree/main/packages/databricks-vscode)
    VSCodeマーケットプレイスに公開されているDatabricks用のVSCode拡張機能です。
-   [databricks-vscode-types](https://github.com/databricks/databricks-vscode/tree/main/packages/databricks-vscode-types)
    このVSCode拡張機能のパブリックAPIの型定義です。

### はじめに

yarnを準備する：

```
npm install -g yarn@3
yarn install
```

Databricks JavaScript SDK（`@databricks/sdk-experimental`）は通常のnpm依存関係であり、`yarn install`によって自動的にインストールされるため、別途手動で行う必要はありません。

Databricks CLIの準備：

```
yarn workspace databricks run package:cli:fetch
```

その後で、`databricks-vscode` 拡張機能のビルドとテストを行う準備が整います。

### 問題が見つかりましたか？

問題やバグが見つかった場合、または機能追加のリクエストがある場合は、こちらにIssueを投稿してください：https://github.com/databricks/databricks-vscode/issues/new

また、https://docs.databricks.com/dev-tools/vscode-ext.html#send-usage-logs-to-databricks に記載されている手順に従ってログも添付してください。
