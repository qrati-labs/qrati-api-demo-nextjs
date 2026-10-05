import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import DashboardLayout from "./layout";

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/components/SignOutButton", () => ({ SignOutButton: () => <button>Sign out</button> }));

import { auth } from "@/lib/auth";

describe("DashboardLayout (server component)", () => {
  afterEach(() => vi.clearAllMocks());

  it("renders the signed-in user's email and children", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { email: "ada@example.com" } } as never);
    render(await DashboardLayout({ children: <div>page content</div> }));
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  it("renders without crashing when there is no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    render(await DashboardLayout({ children: <div>page content</div> }));
    expect(screen.getByText("page content")).toBeInTheDocument();
  });
});
