import { AzureCliCredential, ChainedTokenCredential, DefaultAzureCredential, TokenCredential } from "@azure/identity";
import { AccountInfo, AuthenticationResult, PublicClientApplication } from "@azure/msal-node";
import { Buffer } from "node:buffer";
import open from "open";

const PAT_ENV_VARIABLE = "AZURE_DEVOPS_PAT";

type AuthenticationKind = "aad" | "pat";

interface Authenticator {
  kind: AuthenticationKind;
  getToken: () => Promise<string>;
  getAuthorizationHeader: () => Promise<string>;
}

const scopes = ["499b84ac-1321-427f-aa17-267ca6975798/.default"];

class OAuthAuthenticator {
  static clientId = "0d50963b-7bb9-4fe7-94c7-a99af00b5136";
  static defaultAuthority = "https://login.microsoftonline.com/common";

  private accountId: AccountInfo | null;
  private publicClientApp: PublicClientApplication;

  constructor(tenantId?: string) {
    this.accountId = null;
    this.publicClientApp = new PublicClientApplication({
      auth: {
        clientId: OAuthAuthenticator.clientId,
        authority: tenantId ? `https://login.microsoftonline.com/${tenantId}` : OAuthAuthenticator.defaultAuthority,
      },
    });
  }

  public async getToken(): Promise<string> {
    let authResult: AuthenticationResult | null = null;
    if (this.accountId) {
      try {
        authResult = await this.publicClientApp.acquireTokenSilent({
          scopes,
          account: this.accountId,
        });
      } catch (error) {
        authResult = null;
      }
    }
    if (!authResult) {
      authResult = await this.publicClientApp.acquireTokenInteractive({
        scopes,
        openBrowser: async (url) => {
          open(url);
        },
      });
      this.accountId = authResult.account;
    }

    if (!authResult.accessToken) {
      throw new Error("Failed to obtain Azure DevOps OAuth token.");
    }
    return authResult.accessToken;
  }
}

function createAuthenticator(type: string, tenantId?: string): Authenticator {
  switch (type) {
    case "pat": {
      const personalAccessToken = process.env[PAT_ENV_VARIABLE];
      if (!personalAccessToken) {
        throw new Error(`Personal Access Token authentication requires the ${PAT_ENV_VARIABLE} environment variable to be set.`);
      }
      const basicAuthHeader = `Basic ${Buffer.from(`:${personalAccessToken}`).toString("base64")}`;
      const getToken = async () => personalAccessToken;
      const getAuthorizationHeader = async () => basicAuthHeader;
      return {
        kind: "pat",
        getToken,
        getAuthorizationHeader,
      };
    }
    case "azcli":
    case "env": {
      if (type !== "env") {
        process.env.AZURE_TOKEN_CREDENTIALS = "dev";
      }
      let credential: TokenCredential = new DefaultAzureCredential(); // CodeQL [SM05138] resolved by explicitly setting AZURE_TOKEN_CREDENTIALS
      if (tenantId) {
        // Use Azure CLI credential if tenantId is provided for multi-tenant scenarios
        const azureCliCredential = new AzureCliCredential({ tenantId });
        credential = new ChainedTokenCredential(azureCliCredential, credential);
      }
      const getToken = async () => {
        const result = await credential.getToken(scopes);
        if (!result) {
          throw new Error("Failed to obtain Azure DevOps token. Ensure you have Azure CLI logged or use interactive type of authentication.");
        }
        return result.token;
      };
      return {
        kind: "aad",
        getToken,
        getAuthorizationHeader: async () => `Bearer ${await getToken()}`,
      };
    }

    default: {
      const authenticator = new OAuthAuthenticator(tenantId);
      const getToken = () => {
        return authenticator.getToken();
      };
      return {
        kind: "aad",
        getToken,
        getAuthorizationHeader: async () => `Bearer ${await getToken()}`,
      };
    }
  }
}
export { createAuthenticator };
export type { Authenticator };
