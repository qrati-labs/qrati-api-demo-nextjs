import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SignOutButton } from "./SignOutButton";
import { signOut } from "@/lib/auth-client";

vi.mock("@/lib/auth-client", () => ({
  signOut: vi.fn(async () => {}),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("SignOutButton", () => {
  it("signs out then redirects to /login", async () => {
    render(<SignOutButton />);
    fireEvent.click(screen.getByText("Sign out"));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
    expect(signOut).toHaveBeenCalled();
  });
});
