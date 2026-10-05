"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signUp } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await (mode === "signin"
      ? signIn.email({ email, password })
      : signUp.email({ email, password, name }));
    if (error) return setError(error.message ?? "Something went wrong.");
    router.push("/dashboard");
  }

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="bg-primary h-8 w-8 rounded-md" aria-hidden />
          <h1 className="text-lg font-semibold">Qrati API Demo</h1>
          <p className="text-muted-foreground text-sm">Live reference app for the /v1 REST API</p>
        </div>

        <form onSubmit={onSubmit} className="card flex flex-col gap-3">
          <h2 className="text-sm font-medium">{mode === "signin" ? "Welcome back" : "Create an account"}</h2>
          {mode === "signup" && (
            <input
              className="input-field"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <input
            className="input-field"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="input-field"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-destructive text-xs">{error}</p>}
          <button className="btn-primary">{mode === "signin" ? "Sign in" : "Sign up"}</button>
          <button
            type="button"
            className="text-muted-foreground text-xs underline underline-offset-2"
            onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
          >
            {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
