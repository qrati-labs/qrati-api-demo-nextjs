import { redirect } from "next/navigation";
import { getSessionCookie } from "better-auth/cookies";
import { headers } from "next/headers";

export default async function Home() {
  const cookie = getSessionCookie(await headers());
  redirect(cookie ? "/dashboard" : "/login");
}
