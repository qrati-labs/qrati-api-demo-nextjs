import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CurateView } from "./page";
import * as actions from "@/app/actions/qrati";

vi.mock("@/app/actions/qrati", () => ({
  getEvent: vi.fn(),
  curationQueue: vi.fn(),
  curationDecide: vi.fn(),
}));

const queueItem = { _id: "content-1", caption: "First item", thumbnailUrl: "https://example.test/thumb.jpg" };

describe("CurateView", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads the queue and submits a normal rating with inappropriate as an empty string", async () => {
    vi.mocked(actions.getEvent).mockResolvedValue({ event: { _id: "event-1", engagementStyle: "CONTEST" }, parameters: [] });
    vi.mocked(actions.curationQueue).mockResolvedValue([queueItem]);
    vi.mocked(actions.curationDecide).mockResolvedValue({});

    render(<CurateView eventId="event-1" />);

    expect(await screen.findByText("First item")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Submit rating"));

    // Regression test: the API only supports normal ratings (inappropriate === '');
    // any other value is rejected. The client must always send '' for a rating.
    await waitFor(() =>
      expect(actions.curationDecide).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: "event-1", contentId: "content-1", inappropriate: "" })
      )
    );
  });

  it("does not offer a flag-as-inappropriate control (the API does not support reports)", async () => {
    vi.mocked(actions.getEvent).mockResolvedValue({ event: { _id: "event-1", engagementStyle: "CONTEST" }, parameters: [] });
    vi.mocked(actions.curationQueue).mockResolvedValue([queueItem]);

    render(<CurateView eventId="event-1" />);

    await screen.findByText("First item");
    expect(screen.queryByLabelText("Flag as inappropriate")).not.toBeInTheDocument();
  });

  it("shows the API's error when a rating is rejected and stays on the item", async () => {
    vi.mocked(actions.getEvent).mockResolvedValue({ event: { _id: "event-1", engagementStyle: "CONTEST" }, parameters: [] });
    vi.mocked(actions.curationQueue).mockResolvedValue([queueItem]);
    vi.mocked(actions.curationDecide).mockRejectedValue(new Error("You have already rated this content"));

    render(<CurateView eventId="event-1" />);

    await screen.findByText("First item");
    fireEvent.click(screen.getByText("Submit rating"));

    expect(await screen.findByText("You have already rated this content")).toBeInTheDocument();
    expect(screen.getByText("First item")).toBeInTheDocument();
  });

  it("advances to the next item and shows a confirmation after a successful submit", async () => {
    const secondItem = { _id: "content-2", caption: "Second item" };
    vi.mocked(actions.getEvent).mockResolvedValue({ event: { _id: "event-1", engagementStyle: "CONTEST" }, parameters: [] });
    vi.mocked(actions.curationQueue).mockResolvedValue([queueItem, secondItem]);
    vi.mocked(actions.curationDecide).mockResolvedValue({});

    render(<CurateView eventId="event-1" />);

    await screen.findByText("First item");
    fireEvent.click(screen.getByText("Submit rating"));

    expect(await screen.findByText("Second item")).toBeInTheDocument();
    expect(screen.getByText("Submitted.")).toBeInTheDocument();
  });

  it("renders one rating slider per event-defined curation parameter", async () => {
    vi.mocked(actions.getEvent).mockResolvedValue({
      event: { _id: "event-1", engagementStyle: "CONTEST" },
      parameters: [{ _id: "p1", name: "Composition" }, { _id: "p2", name: "Relevance" }],
    });
    vi.mocked(actions.curationQueue).mockResolvedValue([queueItem]);

    render(<CurateView eventId="event-1" />);

    expect(await screen.findByText(/Composition/)).toBeInTheDocument();
    expect(screen.getByText(/Relevance/)).toBeInTheDocument();
  });

  it("shows an empty-queue message when there is nothing left to rate", async () => {
    vi.mocked(actions.getEvent).mockResolvedValue({ event: { _id: "event-1", engagementStyle: "CONTEST" }, parameters: [] });
    vi.mocked(actions.curationQueue).mockResolvedValue([]);

    render(<CurateView eventId="event-1" />);

    expect(await screen.findByText(/queue is empty/)).toBeInTheDocument();
  });

  it.each(["SIMPLE", "REACTION", undefined])("explains rating is contest-only for a %s event and loads no queue", async (style) => {
    vi.mocked(actions.getEvent).mockResolvedValue({ event: { _id: "event-1", engagementStyle: style }, parameters: [] });

    render(<CurateView eventId="event-1" />);

    expect(await screen.findByText(/Rating applies to contest events only/)).toBeInTheDocument();
    expect(actions.curationQueue).not.toHaveBeenCalled();
  });

  it("shows the error when the event cannot be loaded", async () => {
    vi.mocked(actions.getEvent).mockRejectedValue(new Error("Event not found"));

    render(<CurateView eventId="event-1" />);

    expect(await screen.findByText("Event not found")).toBeInTheDocument();
  });
});
