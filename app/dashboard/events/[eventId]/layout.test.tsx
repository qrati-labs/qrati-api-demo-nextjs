import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import EventLayout from "./layout";
import * as actions from "@/app/actions/qrati";
import { ActionError } from "@/lib/actions";

vi.mock("@/app/actions/qrati", () => ({
  getEvent: vi.fn(),
  getEventStats: vi.fn(),
  getEventUploadCount: vi.fn(),
}));

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  })
);
vi.mock("next/navigation", () => ({ notFound }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("EventLayout (server component)", () => {
  afterEach(() => vi.clearAllMocks());

  it("renders event name, description, stats, and all five tabs for a CONTEST event", async () => {
    vi.mocked(actions.getEvent).mockResolvedValue({
      event: { name: "Summer Fest", description: "A fest", engagementStyle: "CONTEST" },
    });
    vi.mocked(actions.getEventStats).mockResolvedValue({ contentCount: 10, eventViews: { views: 100 }, curationCount: 3 });
    vi.mocked(actions.getEventUploadCount).mockResolvedValue({ uploadCount: { APPROVED: 2, IN_REVIEW: 1, REJECTED: 0 } });

    const jsx = await EventLayout({ children: <div>child</div>, params: Promise.resolve({ eventId: "e1" }) });
    render(jsx);

    expect(screen.getByText("Summer Fest")).toBeInTheDocument();
    expect(screen.getByText("A fest")).toBeInTheDocument();
    expect(screen.getByText("10 uploads")).toBeInTheDocument();
    expect(screen.getByText("100 views")).toBeInTheDocument();
    expect(screen.getByText("3 curated")).toBeInTheDocument();
    expect(screen.getByText("your uploads: 2 approved, 1 in review, 0 rejected")).toBeInTheDocument();
    for (const label of ["Gallery", "Upload", "My uploads", "Leaderboard", "Curate"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("child")).toBeInTheDocument();
    expect(screen.getByText("CONTEST")).toBeInTheDocument();
  });

  it.each(["SIMPLE", "REACTION", undefined])("hides the Curate tab and curated count for a %s event", async (style) => {
    vi.mocked(actions.getEvent).mockResolvedValue({ event: { name: "Fest", engagementStyle: style } });
    vi.mocked(actions.getEventStats).mockResolvedValue({ contentCount: 1, curationCount: 3 });
    vi.mocked(actions.getEventUploadCount).mockResolvedValue({ uploadCount: {} });

    render(await EventLayout({ children: <div>child</div>, params: Promise.resolve({ eventId: "e1" }) }));

    expect(screen.queryByText("Curate")).not.toBeInTheDocument();
    expect(screen.queryByText("3 curated")).not.toBeInTheDocument();
    expect(screen.getByText(style ?? "SIMPLE")).toBeInTheDocument();
    for (const label of ["Gallery", "Upload", "My uploads", "Leaderboard"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("accepts eventViews as a plain number too (as the OpenAPI spec documents it)", async () => {
    vi.mocked(actions.getEvent).mockResolvedValue({ event: { name: "Summer Fest" } });
    vi.mocked(actions.getEventStats).mockResolvedValue({ eventViews: 7 });
    vi.mocked(actions.getEventUploadCount).mockResolvedValue({ uploadCount: {} });

    render(await EventLayout({ children: <div>child</div>, params: Promise.resolve({ eventId: "e1" }) }));

    expect(screen.getByText("7 views")).toBeInTheDocument();
    expect(screen.getByText("your uploads: 0 approved, 0 in review, 0 rejected")).toBeInTheDocument();
  });

  it("falls back to the raw eventId and omits stats when stats/upload-count calls fail", async () => {
    vi.mocked(actions.getEvent).mockResolvedValue({ event: {} });
    vi.mocked(actions.getEventStats).mockRejectedValue(new Error("no stats"));
    vi.mocked(actions.getEventUploadCount).mockRejectedValue(new Error("no identity"));

    const jsx = await EventLayout({ children: <div>child</div>, params: Promise.resolve({ eventId: "e1" }) });
    render(jsx);

    expect(screen.getByText("e1")).toBeInTheDocument();
    expect(screen.queryByText(/^\d+ uploads$/)).not.toBeInTheDocument();
  });

  it("renders Next's 404 page when the API says the event does not exist", async () => {
    vi.mocked(actions.getEvent).mockResolvedValue({ __qratiError: { status: 404, code: "event_not_found", message: "Event not found" } });
    vi.mocked(actions.getEventStats).mockResolvedValue({});
    vi.mocked(actions.getEventUploadCount).mockResolvedValue({ uploadCount: {} });

    await expect(EventLayout({ children: <div>child</div>, params: Promise.resolve({ eventId: "missing" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("lets other API errors reach the error boundary", async () => {
    vi.mocked(actions.getEvent).mockResolvedValue({ __qratiError: { status: 403, code: "cross_org_access", message: "Forbidden" } });
    vi.mocked(actions.getEventStats).mockResolvedValue({});
    vi.mocked(actions.getEventUploadCount).mockResolvedValue({ uploadCount: {} });

    await expect(EventLayout({ children: <div>child</div>, params: Promise.resolve({ eventId: "e1" }) })).rejects.toBeInstanceOf(ActionError);
    expect(notFound).not.toHaveBeenCalled();
  });
});
