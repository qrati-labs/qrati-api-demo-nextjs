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
});
