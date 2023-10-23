#!/bin/bash

workspaces="yarn workspaces foreach --exclude '@databricks/databricks-vscode'" #this excludes the root workspace

$workspaces remove @databricks/databricks-sdk;

$workspaces cache clean
$workspaces cache clean --mirror
$workspaces add @databricks/databricks-sdk@file:../../vendor/databricks-sdk.tgz

$workspaces cache clean
$workspaces cache clean --mirror
$workspaces install


