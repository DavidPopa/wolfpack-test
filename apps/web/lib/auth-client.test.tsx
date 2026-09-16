import { createAuthClient } from "better-auth/react";
import { AUTH_BASE_PATH, authClient } from "./auth-client";

jest.mock("better-auth/react", () => ({ createAuthClient: jest.fn(() => ({ client: "singleton" })) }));

describe("Better Auth browser client configuration", () => {
  it("constructs one same-origin client at the API auth base path", () => {
    expect(createAuthClient).toHaveBeenCalledTimes(1);
    expect(createAuthClient).toHaveBeenCalledWith({ basePath: "/api/auth" });
    expect(AUTH_BASE_PATH).toBe("/api/auth");
    expect(authClient).toEqual({ client: "singleton" });
  });
});
