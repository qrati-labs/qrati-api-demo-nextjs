"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="text-muted-foreground text-xs underline underline-offset-2"
      onClick={async () => {
        await signOut();
        router.push("/login");
      }}
    >
      Sign out
    </button>
  );
}
