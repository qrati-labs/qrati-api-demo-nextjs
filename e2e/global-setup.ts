import { request, type FullConfig } from "@playwright/test";

export const USER = { email: "e2e@example.com", password: "Passw0rd!Passw0rd", name: "E2E Tester" };

// Creates (or signs in) the test user once and saves the session for every spec.
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL as string;
  const ctx = await request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL } });
  const signUp = await ctx.post("/api/auth/sign-up/email", { data: USER });
  if (!signUp.ok()) {
    const signIn = await ctx.post("/api/auth/sign-in/email", { data: { email: USER.email, password: USER.password } });
    if (!signIn.ok()) throw new Error(`Could not sign up or sign in the e2e user: ${signIn.status()}`);
  }
  await ctx.storageState({ path: "e2e/.auth/state.json" });
  await ctx.dispose();
}
