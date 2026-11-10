/** Auth types as the sign-in wizard names them. From `LoginWizard.ts`. */
export function humaniseAuthType(authType: string | undefined): string | undefined {
    switch (authType) {
        case "pat":
            return "Personal Access Token";
        case "basic":
            return "Username and Password";
        case "azure-cli":
            return "Azure CLI";
        case "azure-client-secret":
            return "Azure Client Secret";
        case "google-id":
            return "Google Service Account";
        case "databricks-cli":
            return "OAuth";
        case "oauth-m2m":
            return "OAuth M2M (Machine to Machine)";
        default:
            return authType;
    }
}
