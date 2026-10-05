import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ContentModal } from "./ContentModal";
import * as actions from "@/app/actions/qrati";

vi.mock("@/app/actions/qrati", () => ({
  reactToContent: vi.fn(),
  curationEligibility: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const emojis = ["👍", "❤️", "😂", "🔥"];
const baseContent = { _id: "content-1", caption: "A sunset", url: "https://example.test/photo.jpg", type: "IMAGE" };

describe("ContentModal", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reacts to content and reflects the server's returned counts", async () => {
    vi.mocked(actions.reactToContent).mockResolvedValue({ ...baseContent, reactionCounts: { "👍": 1 } });

    render(<ContentModal content={baseContent} eventId="event-1" reactionEmojis={emojis} onClose={() => {}} />);
    fireEvent.click(screen.getByText("👍"));

    await waitFor(() =>
      expect(actions.reactToContent).toHaveBeenCalledWith({ eventId: "event-1", contentId: "content-1", reaction: "👍" })
    );
  });

  it("shows the server's error message when reacting fails", async () => {
    vi.mocked(actions.reactToContent).mockRejectedValue(new Error("Event is not open for reactions"));

    render(<ContentModal content={baseContent} eventId="event-1" reactionEmojis={emojis} onClose={() => {}} />);
    fireEvent.click(screen.getByText("❤️"));

    expect(await screen.findByText("Event is not open for reactions")).toBeInTheDocument();
  });

  it("shows the eligibility status returned by the server", async () => {
    vi.mocked(actions.curationEligibility).mockResolvedValue({ ...baseContent, ratingStatus: "ELIGIBLE" });

    render(<ContentModal content={baseContent} eventId="event-1" curation onClose={() => {}} />);
    fireEvent.click(screen.getByText("Check curation eligibility"));

    expect(await screen.findByText("ELIGIBLE")).toBeInTheDocument();
  });

  // Regression test: a malformed/partial content record (no _id) must fail
  // fast client-side with a clear message instead of firing a request to
  // "/content/undefined/..." — the failure mode this guard was added for.
  it("refuses to react when the content item has no id, without calling the server", async () => {
    render(<ContentModal content={{ caption: "no id" } as never} eventId="event-1" reactionEmojis={emojis} onClose={() => {}} />);
    fireEvent.click(screen.getByText("🔥"));

    expect(await screen.findByText(/has no id/)).toBeInTheDocument();
    expect(actions.reactToContent).not.toHaveBeenCalled();
  });

  it("refuses to check eligibility when the content item has no id", async () => {
    render(<ContentModal content={{ caption: "no id" } as never} eventId="event-1" curation onClose={() => {}} />);
    fireEvent.click(screen.getByText("Check curation eligibility"));

    expect(await screen.findByText(/has no id/)).toBeInTheDocument();
    expect(actions.curationEligibility).not.toHaveBeenCalled();
  });

  it("closes when the backdrop is clicked and calls onClose", () => {
    const onClose = vi.fn();
    const { container } = render(<ContentModal content={baseContent} eventId="event-1" onClose={onClose} />);

    fireEvent.click(container.firstChild as Element);

    expect(onClose).toHaveBeenCalled();
  });

  it("offers only the event's configured reactions, with their counts", () => {
    const content = { ...baseContent, reactionCounts: { like: 3 } };
    render(<ContentModal content={content} eventId="event-1" reactionEmojis={["like", "love"]} onClose={() => {}} />);

    expect(screen.getByText("like")).toBeInTheDocument();
    expect(screen.getByText("love")).toBeInTheDocument();
    expect(screen.queryByText("👍")).not.toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("sends the configured reaction value as-is", async () => {
    vi.mocked(actions.reactToContent).mockResolvedValue(baseContent);

    render(<ContentModal content={baseContent} eventId="event-1" reactionEmojis={["like"]} onClose={() => {}} />);
    fireEvent.click(screen.getByText("like"));

    await waitFor(() =>
      expect(actions.reactToContent).toHaveBeenCalledWith({ eventId: "event-1", contentId: "content-1", reaction: "like" })
    );
  });

  it("says reactions are off when the event configures none", () => {
    render(<ContentModal content={baseContent} eventId="event-1" onClose={() => {}} />);

    expect(screen.getByText("Reactions are not enabled for this event.")).toBeInTheDocument();
  });

  it("shows the curation links only for contest events", () => {
    const { rerender } = render(<ContentModal content={baseContent} eventId="event-1" onClose={() => {}} />);
    expect(screen.queryByText("Check curation eligibility")).not.toBeInTheDocument();
    expect(screen.queryByText("Go to curation queue")).not.toBeInTheDocument();

    rerender(<ContentModal content={baseContent} eventId="event-1" curation onClose={() => {}} />);
    expect(screen.getByText("Check curation eligibility")).toBeInTheDocument();
    expect(screen.getByText("Go to curation queue").closest("a")).toHaveAttribute("href", "/dashboard/events/event-1/curate");
  });

  it("shows the error when the eligibility check fails", async () => {
    vi.mocked(actions.curationEligibility).mockRejectedValue(new Error("not allowed"));

    render(<ContentModal content={baseContent} eventId="event-1" curation onClose={() => {}} />);
    fireEvent.click(screen.getByText("Check curation eligibility"));

    expect(await screen.findByText("not allowed")).toBeInTheDocument();
  });
});
