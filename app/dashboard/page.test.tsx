import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import OrgHomePage from "./page";
import * as actions from "@/app/actions/qrati";

vi.mock("@/app/actions/qrati", () => ({
  getStatus: vi.fn(),
  getReadiness: vi.fn(),
  getOrganization: vi.fn(),
  listFolders: vi.fn(),
  listEvents: vi.fn(),
  searchEvents: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const evt = (id: string) => ({ _id: id, name: `Event ${id}` });

describe("OrgHomePage", () => {
  afterEach(() => vi.clearAllMocks());

  it("renders org name, status, and events", async () => {
    vi.mocked(actions.getStatus).mockResolvedValue({ status: "ok" });
    vi.mocked(actions.getReadiness).mockResolvedValue({ status: "ok" });
    vi.mocked(actions.getOrganization).mockResolvedValue({ name: "demum tui" });
    vi.mocked(actions.listFolders).mockResolvedValue([]);
    vi.mocked(actions.listEvents).mockResolvedValue({ data: [evt("1")] });

    render(<OrgHomePage />);

    expect(await screen.findByText("demum tui")).toBeInTheDocument();
    expect(await screen.findByText("status: ok · ready: ok")).toBeInTheDocument();
    expect(screen.getByText("Moderation").closest("a")).toHaveAttribute("href", "/dashboard/moderation");
    expect(await screen.findByText("Event 1")).toBeInTheDocument();
  });

  it("filters by folder when a folder pill is clicked", async () => {
    vi.mocked(actions.getStatus).mockResolvedValue({ status: "ok" });
    vi.mocked(actions.getReadiness).mockResolvedValue({ status: "ok" });
    vi.mocked(actions.getOrganization).mockResolvedValue({ name: "org" });
    vi.mocked(actions.listFolders).mockResolvedValue([{ _id: "f1", name: "Weddings" }]);
    vi.mocked(actions.listEvents).mockResolvedValue({ data: [evt("1")] });

    render(<OrgHomePage />);
    fireEvent.click(await screen.findByText("Weddings"));

    await waitFor(() => expect(actions.listEvents).toHaveBeenLastCalledWith({ folderId: "f1", limit: 30 }));
    fireEvent.click(screen.getByText("All events"));
    await waitFor(() => expect(actions.listEvents).toHaveBeenLastCalledWith({ includeAllFolders: true, limit: 30 }));
  });

  it("searches events across the org and clears the active folder", async () => {
    vi.mocked(actions.getStatus).mockResolvedValue({ status: "ok" });
    vi.mocked(actions.getReadiness).mockResolvedValue({ status: "ok" });
    vi.mocked(actions.getOrganization).mockResolvedValue({ name: "org" });
    vi.mocked(actions.listFolders).mockResolvedValue([]);
    vi.mocked(actions.listEvents).mockResolvedValue({ data: [] });
    vi.mocked(actions.searchEvents).mockResolvedValue({ data: [evt("9")] });

    render(<OrgHomePage />);
    await screen.findByText("No events found.");

    fireEvent.change(screen.getByPlaceholderText(/Search events/), { target: { value: "beach" } });
    fireEvent.submit(screen.getByPlaceholderText(/Search events/).closest("form")!);

    expect(await screen.findByText("Event 9")).toBeInTheDocument();
    expect(actions.searchEvents).toHaveBeenCalledWith({ query: "beach", limit: 30 });
  });

  it("shows an error when listEvents fails", async () => {
    vi.mocked(actions.getStatus).mockResolvedValue({ status: "ok" });
    vi.mocked(actions.getReadiness).mockResolvedValue({ status: "ok" });
    vi.mocked(actions.getOrganization).mockResolvedValue({ name: "org" });
    vi.mocked(actions.listFolders).mockResolvedValue([]);
    vi.mocked(actions.listEvents).mockRejectedValue(new Error("boom"));

    render(<OrgHomePage />);
    expect(await screen.findByText("boom")).toBeInTheDocument();
  });

  it("shows a degraded readiness state without breaking the page", async () => {
    vi.mocked(actions.getStatus).mockResolvedValue({ status: "ok" });
    vi.mocked(actions.getReadiness).mockResolvedValue({ status: "degraded", httpStatus: 503 });
    vi.mocked(actions.getOrganization).mockResolvedValue({ name: "org" });
    vi.mocked(actions.listFolders).mockResolvedValue([]);
    vi.mocked(actions.listEvents).mockResolvedValue({ data: [] });

    render(<OrgHomePage />);
    expect(await screen.findByText("status: ok · ready: degraded")).toBeInTheDocument();
  });

  it("keeps rendering when the readiness probe fails", async () => {
    vi.mocked(actions.getStatus).mockResolvedValue({ status: "ok" });
    vi.mocked(actions.getReadiness).mockRejectedValue(new Error("network"));
    vi.mocked(actions.getOrganization).mockResolvedValue({ name: "org" });
    vi.mocked(actions.listFolders).mockResolvedValue([]);
    vi.mocked(actions.listEvents).mockResolvedValue({ data: [evt("1")] });

    render(<OrgHomePage />);
    expect(await screen.findByText("Event 1")).toBeInTheDocument();
    expect(screen.getByText("status: ok · ready: ...")).toBeInTheDocument();
  });
});
