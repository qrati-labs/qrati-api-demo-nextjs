import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GalleryGrid } from "./GalleryGrid";
import * as actions from "@/app/actions/qrati";

vi.mock("@/app/actions/qrati", () => ({
  listContent: vi.fn(),
  searchContent: vi.fn(),
  countContent: vi.fn(),
  getContentByIds: vi.fn(),
}));

class FakeEventSource {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  static instances: FakeEventSource[] = [];
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  close() {}
}

// @ts-expect-error jsdom has no EventSource
global.EventSource = FakeEventSource;

const item = (id: string) => ({ _id: id, caption: `item ${id}`, thumbnailUrl: "https://example.test/t.jpg" });

describe("GalleryGrid", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.mocked(actions.countContent).mockResolvedValue(2);
  });
  afterEach(() => vi.clearAllMocks());

  it("loads the first page and renders items", async () => {
    vi.mocked(actions.listContent).mockResolvedValue({ data: [item("1"), item("2")], meta: { hasMore: false } });

    render(<GalleryGrid eventId="e1" />);

    expect(await screen.findByAltText("item 1")).toBeInTheDocument();
    expect(screen.getByText("2 items")).toBeInTheDocument();
    // The gallery lists approved content only, so the count must too (the API's default also counts in-review items).
    expect(actions.countContent).toHaveBeenCalledWith({ eventId: "e1", filter: "status:APPROVED" });
  });

  it("shows the empty state when there is no content", async () => {
    vi.mocked(actions.listContent).mockResolvedValue({ data: [], meta: { hasMore: false } });

    render(<GalleryGrid eventId="e1" />);

    expect(await screen.findByText("No content yet.")).toBeInTheDocument();
  });

  it("loads more pages on click, appending items using the cursor", async () => {
    vi.mocked(actions.listContent)
      .mockResolvedValueOnce({ data: [item("1")], meta: { hasMore: true, nextCursor: "cur1" } })
      .mockResolvedValueOnce({ data: [item("2")], meta: { hasMore: false } });

    render(<GalleryGrid eventId="e1" />);
    await screen.findByAltText("item 1");
    fireEvent.click(screen.getByText("Load more"));

    expect(await screen.findByAltText("item 2")).toBeInTheDocument();
    expect(actions.listContent).toHaveBeenLastCalledWith({ eventId: "e1", limit: 24, after: "cur1" });
  });

  const search = (term: string) => {
    fireEvent.change(screen.getByPlaceholderText(/Search content/), { target: { value: term } });
    fireEvent.submit(screen.getByPlaceholderText(/Search content/).closest("form")!);
  };

  it("search calls searchContent and replaces the gallery with the results", async () => {
    vi.mocked(actions.listContent).mockResolvedValue({ data: [item("1")], meta: { hasMore: false } });
    vi.mocked(actions.searchContent).mockResolvedValue({ data: [item("9")], meta: { hasMore: false } });
    render(<GalleryGrid eventId="e1" />);
    await screen.findByAltText("item 1");

    search("  sunset ");

    expect(await screen.findByAltText("item 9")).toBeInTheDocument();
    expect(screen.queryByAltText("item 1")).not.toBeInTheDocument();
    expect(actions.searchContent).toHaveBeenCalledWith({ query: "sunset", limit: 24 });
  });

  it("says no results for the term (not 'No content yet') when a search finds nothing", async () => {
    vi.mocked(actions.listContent).mockResolvedValue({ data: [item("1")], meta: { hasMore: false } });
    vi.mocked(actions.searchContent).mockResolvedValue({ data: [], meta: { hasMore: false } });
    render(<GalleryGrid eventId="e1" />);
    await screen.findByAltText("item 1");

    search("zzz");

    expect(await screen.findByText('No results for "zzz".')).toBeInTheDocument();
    expect(screen.queryByText("No content yet.")).not.toBeInTheDocument();
  });

  it("pages search results with the search cursor, not the gallery list", async () => {
    vi.mocked(actions.listContent).mockResolvedValue({ data: [item("1")], meta: { hasMore: false } });
    vi.mocked(actions.searchContent)
      .mockResolvedValueOnce({ data: [item("5")], meta: { hasMore: true, nextCursor: "s1" } })
      .mockResolvedValueOnce({ data: [item("6")], meta: { hasMore: false } });
    render(<GalleryGrid eventId="e1" />);
    await screen.findByAltText("item 1");

    search("beach");
    await screen.findByAltText("item 5");
    fireEvent.click(screen.getByText("Load more"));

    expect(await screen.findByAltText("item 6")).toBeInTheDocument();
    expect(actions.searchContent).toHaveBeenLastCalledWith({ query: "beach", limit: 24, after: "s1" });
    expect(actions.listContent).toHaveBeenCalledTimes(1);
  });

  it("clearing the search restores the event gallery", async () => {
    vi.mocked(actions.listContent).mockResolvedValue({ data: [item("1")], meta: { hasMore: false } });
    vi.mocked(actions.searchContent).mockResolvedValue({ data: [item("9")], meta: { hasMore: false } });
    render(<GalleryGrid eventId="e1" />);
    await screen.findByAltText("item 1");
    search("sunset");
    await screen.findByAltText("item 9");

    search("");

    expect(await screen.findByAltText("item 1")).toBeInTheDocument();
    expect(screen.queryByAltText("item 9")).not.toBeInTheDocument();
  });

  it("does not splice live approvals into search results", async () => {
    vi.mocked(actions.listContent).mockResolvedValue({ data: [item("1")], meta: { hasMore: false } });
    vi.mocked(actions.searchContent).mockResolvedValue({ data: [item("9")], meta: { hasMore: false } });
    vi.mocked(actions.getContentByIds).mockResolvedValue([item("2")]);
    render(<GalleryGrid eventId="e1" />);
    await screen.findByAltText("item 1");
    search("sunset");
    await screen.findByAltText("item 9");

    await FakeEventSource.instances[0].onmessage?.({
      data: JSON.stringify({ type: "CONTENT_APPROVED", content: { id: "2" } }),
    } as MessageEvent);

    expect(actions.getContentByIds).not.toHaveBeenCalled();
    expect(screen.queryByAltText("item 2")).not.toBeInTheDocument();
  });

  it("shows the error when a search fails and keeps the gallery", async () => {
    vi.mocked(actions.listContent).mockResolvedValue({ data: [item("1")], meta: { hasMore: false } });
    vi.mocked(actions.searchContent).mockRejectedValue(new Error("search down"));
    render(<GalleryGrid eventId="e1" />);
    await screen.findByAltText("item 1");

    search("x");

    expect(await screen.findByText("search down")).toBeInTheDocument();
    expect(screen.getByAltText("item 1")).toBeInTheDocument();
  });

  it("shows an error when loading more fails", async () => {
    vi.mocked(actions.listContent)
      .mockResolvedValueOnce({ data: [item("1")], meta: { hasMore: true, nextCursor: "c" } })
      .mockRejectedValueOnce(new Error("page failed"));
    render(<GalleryGrid eventId="e1" />);
    await screen.findByAltText("item 1");

    fireEvent.click(screen.getByText("Load more"));

    expect(await screen.findByText("page failed")).toBeInTheDocument();
  });

  it("opens the content modal when an item is clicked", async () => {
    vi.mocked(actions.listContent).mockResolvedValue({ data: [item("1")], meta: { hasMore: false } });
    render(<GalleryGrid eventId="e1" />);

    fireEvent.click(await screen.findByAltText("item 1"));
    expect(await screen.findByText("item 1", { selector: "p" })).toBeInTheDocument();
  });

  it("shows the live indicator once the SSE connection opens", async () => {
    vi.mocked(actions.listContent).mockResolvedValue({ data: [], meta: { hasMore: false } });
    render(<GalleryGrid eventId="e1" />);
    await screen.findByText("No content yet.");

    FakeEventSource.instances[0].onopen?.();
    expect(await screen.findByText(/live/)).toBeInTheDocument();
  });

  it("prepends a fresh item on a CONTENT_APPROVED SSE message it hasn't seen", async () => {
    vi.mocked(actions.listContent).mockResolvedValue({ data: [item("1")], meta: { hasMore: false } });
    vi.mocked(actions.getContentByIds).mockResolvedValue([item("2")]);
    render(<GalleryGrid eventId="e1" />);
    await screen.findByAltText("item 1");

    const es = FakeEventSource.instances[0];
    await es.onmessage?.({ data: JSON.stringify({ type: "CONTENT_APPROVED", content: { id: "2" } }) } as MessageEvent);

    expect(await screen.findByAltText("item 2")).toBeInTheDocument();
    expect(actions.getContentByIds).toHaveBeenCalledWith(["2"], "e1");
  });

  it("removes an item on a content.removed SSE message (what the API sends for a rejected or deleted item)", async () => {
    vi.mocked(actions.listContent).mockResolvedValue({ data: [item("1")], meta: { hasMore: false } });
    render(<GalleryGrid eventId="e1" />);
    await screen.findByAltText("item 1");

    const es = FakeEventSource.instances[0];
    await es.onmessage?.({ data: JSON.stringify({ type: "content.removed", content: { id: "1" } }) } as MessageEvent);

    await waitFor(() => expect(screen.queryByAltText("item 1")).not.toBeInTheDocument());
  });

  it("ignores malformed SSE payloads instead of crashing", async () => {
    vi.mocked(actions.listContent).mockResolvedValue({ data: [item("1")], meta: { hasMore: false } });
    render(<GalleryGrid eventId="e1" />);
    await screen.findByAltText("item 1");

    const es = FakeEventSource.instances[0];
    await es.onmessage?.({ data: "not json" } as MessageEvent);

    expect(await screen.findByAltText("item 1")).toBeInTheDocument();
  });

  it("shows an error message when the first page fails to load", async () => {
    vi.mocked(actions.listContent).mockRejectedValue(new Error("network down"));
    render(<GalleryGrid eventId="e1" />);

    expect(await screen.findByText("network down")).toBeInTheDocument();
  });
});
