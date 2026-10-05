import { describe, expect, it, vi } from "vitest";

vi.mock("better-auth/cookies", () => ({
  getSessionCookie: vi.fn(),
}));

import { getSessionCookie } from "better-auth/cookies";
import { proxy } from "./proxy";

function req(url: string) {
  return { url } as never;
}

describe("proxy — /dashboard auth gate", () => {
  it("redirects to /login when there is no session cookie", () => {
    vi.mocked(getSessionCookie).mockReturnValue(null);
    const res = proxy(req("http://localhost:3010/dashboard"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3010/login");
  });

  it("passes the request through when a session cookie is present", () => {
    vi.mocked(getSessionCookie).mockReturnValue("some-cookie");
    const res = proxy(req("http://localhost:3010/dashboard"));
    expect(res.headers.get("location")).toBeNull();
  });
});
