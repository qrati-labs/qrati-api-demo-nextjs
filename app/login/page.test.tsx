import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LoginPage from "./page";
import { signIn, signUp } from "@/lib/auth-client";

vi.mock("@/lib/auth-client", () => ({
  signIn: { email: vi.fn() },
  signUp: { email: vi.fn() },
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("LoginPage", () => {
  afterEach(() => vi.clearAllMocks());

  it("signs in and redirects to /dashboard on success", async () => {
    vi.mocked(signIn.email).mockResolvedValue({ error: null } as never);

    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "pw" } });
    fireEvent.click(screen.getByText("Sign in"));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(signIn.email).toHaveBeenCalledWith({ email: "a@b.com", password: "pw" });
    expect(signUp.email).not.toHaveBeenCalled();
  });

  it("shows the error message and does not redirect on sign-in failure", async () => {
    vi.mocked(signIn.email).mockResolvedValue({ error: { message: "Invalid credentials" } } as never);

    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByText("Sign in"));

    expect(await screen.findByText("Invalid credentials")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("switches to sign-up mode, showing the Name field, and calls signUp.email", async () => {
    vi.mocked(signUp.email).mockResolvedValue({ error: null } as never);

    render(<LoginPage />);
    fireEvent.click(screen.getByText("Need an account? Sign up"));
    expect(screen.getByPlaceholderText("Name")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Ada" } });
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "ada@b.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "pw" } });
    fireEvent.click(screen.getByText("Sign up"));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(signUp.email).toHaveBeenCalledWith({ email: "ada@b.com", password: "pw", name: "Ada" });
  });
});
