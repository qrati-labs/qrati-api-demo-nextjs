import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DashboardError from "./error";

describe("DashboardError boundary", () => {
  it("shows the error message and calls reset on retry", () => {
    const reset = vi.fn();
    render(<DashboardError error={new Error("QRATI_API_KEY is not set")} reset={reset} />);

    expect(screen.getByText("QRATI_API_KEY is not set")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry"));
    expect(reset).toHaveBeenCalled();
  });

  it("shows a generic message instead of Next's redacted production message (it carries a digest)", () => {
    const error = Object.assign(new Error("An error occurred in the Server Components render."), { digest: "123" });
    render(<DashboardError error={error} reset={() => {}} />);

    expect(screen.getByText("Something went wrong while loading this page.")).toBeInTheDocument();
    expect(screen.queryByText(/Server Components render/)).not.toBeInTheDocument();
  });
});
