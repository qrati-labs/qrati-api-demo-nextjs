import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("better-auth/cookies", () => ({ getSessionCookie: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }) }));

import { getSessionCookie } from "better-auth/cookies";
import { redirect } from "next/navigation";
import Home from "./page";

describe("Home — signed-in-state redirect", () => {
  afterEach(() => vi.clearAllMocks());

  it("redirects to /dashboard when a session cookie exists", async () => {
    vi.mocked(getSessionCookie).mockReturnValue("cookie");
    await expect(Home()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("redirects to /login when there is no session cookie", async () => {
    vi.mocked(getSessionCookie).mockReturnValue(null);
    await expect(Home()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
