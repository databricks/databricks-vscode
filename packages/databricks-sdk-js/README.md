# JavaScript SDK for Databricks

This package contains the experimental JavaScript SDK for Databricks as used by the Databricks extension for VSCode.

## Structure

-   **src/services**: Dumb wrapper around the official Databricks REST API
-   **src/services**: Higher level abstractions that makes it easier to interact with the Databricks API

## Testing

### Unit Tests

Run unit tests by calling:

```
npm run test
```

### Integration Tests

Most of the tests are integrations tests and must be run against a life cluster. To run the integration tests you need to configure the following environment variables:

| Name                       | Value                                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| DATABRICKS_HOST            | Hostname of the Databricks workspace (starts with https://)                                               |
| TEST_PERSONAL_ACCESS_TOKEN | Personal access token                                                                                     |
| TEST_DEFAULT_CLUSTER_ID    | (optional) ID of a cluster to run the tests agains. If missing the tests will create a cluster on demand. |
