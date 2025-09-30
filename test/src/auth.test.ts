import { describe, expect, it, beforeEach, afterEach, jest } from "@jest/globals";
import { createAuthenticator } from "../../src/auth";

const PAT_ENV_VARIABLE = "AZURE_DEVOPS_PAT";

jest.mock("@azure/identity", () => ({
  AzureCliCredential: jest.fn(),
  ChainedTokenCredential: jest.fn(),
  DefaultAzureCredential: jest.fn().mockImplementation(() => ({
    getToken: jest.fn(),
  })),
}));

jest.mock("@azure/msal-node", () => ({
  PublicClientApplication: jest.fn().mockImplementation(() => ({
    acquireTokenSilent: jest.fn(),
    acquireTokenInteractive: jest.fn(),
  })),
}));

jest.mock("open", () => jest.fn());

describe("createAuthenticator", () => {
  const originalPat = process.env[PAT_ENV_VARIABLE];

  beforeEach(() => {
    delete process.env[PAT_ENV_VARIABLE];
  });

  afterEach(() => {
    if (originalPat !== undefined) {
      process.env[PAT_ENV_VARIABLE] = originalPat;
    } else {
      delete process.env[PAT_ENV_VARIABLE];
    }
  });

  it("throws when PAT authentication is requested without environment variable", () => {
    expect(() => createAuthenticator("pat")).toThrow(`Personal Access Token authentication requires the ${PAT_ENV_VARIABLE} environment variable to be set.`);
  });

  it("returns PAT authenticator with basic authorization header", async () => {
    const patValue = "example-pat";
    process.env[PAT_ENV_VARIABLE] = patValue;

    const authenticator = createAuthenticator("pat");

    expect(authenticator.kind).toBe("pat");
    await expect(authenticator.getToken()).resolves.toBe(patValue);

    const expectedHeader = `Basic ${Buffer.from(`:${patValue}`).toString("base64")}`;
    await expect(authenticator.getAuthorizationHeader()).resolves.toBe(expectedHeader);
  });

  it("returns AAD authenticator for interactive type", () => {
    const authenticator = createAuthenticator("interactive");

    expect(authenticator.kind).toBe("aad");
  });
});
