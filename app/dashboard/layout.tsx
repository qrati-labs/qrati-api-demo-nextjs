import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-border bg-background/80 sticky top-0 z-10 flex items-center justify-between border-b px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="bg-primary h-5 w-5 rounded-md" aria-hidden />
          <span className="text-sm font-semibold">Qrati</span>
          <span className="badge">API Demo</span>
        </div>
        <div className="text-muted-foreground flex items-center gap-3 text-xs">
          <span>{session?.user.email}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
