import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MyUploadsPage from "./page";
import * as actions from "@/app/actions/qrati";

vi.mock("@/app/actions/qrati", () => ({
  myUploads: vi.fn(),
  deleteContent: vi.fn(),
}));

const item = (id: string) => ({ _id: id, caption: `upload ${id}`, thumbnailUrl: "https://example.test/t.jpg" });

describe("MyUploadsPage", () => {
  afterEach(() => vi.clearAllMocks());

  it("loads and renders the signed-in user's uploads", async () => {
    vi.mocked(actions.myUploads).mockResolvedValue({ data: [item("1")], meta: { hasMore: false } });
    render(<MyUploadsPage />);
    expect(await screen.findByText("upload 1")).toBeInTheDocument();
  });

  it("shows each upload's moderation status", async () => {
    vi.mocked(actions.myUploads).mockResolvedValue({
      data: [{ ...item("1"), status: "IN_REVIEW" }, { ...item("2"), status: "APPROVED" }, item("3")],
      meta: { hasMore: false },
    });
    render(<MyUploadsPage />);

    expect(await screen.findByText("IN_REVIEW")).toBeInTheDocument();
    expect(screen.getByText("APPROVED")).toBeInTheDocument();
    expect(screen.getAllByText(/^(IN_REVIEW|APPROVED|REJECTED)$/)).toHaveLength(2);
  });

  it("shows the empty state when there is nothing uploaded", async () => {
    vi.mocked(actions.myUploads).mockResolvedValue({ data: [], meta: { hasMore: false } });
    render(<MyUploadsPage />);
    expect(await screen.findByText(/haven't uploaded anything/)).toBeInTheDocument();
  });

  it("loads more with the cursor and appends results", async () => {
    vi.mocked(actions.myUploads)
      .mockResolvedValueOnce({ data: [item("1")], meta: { hasMore: true, nextCursor: "cur1" } })
      .mockResolvedValueOnce({ data: [item("2")], meta: { hasMore: false } });

    render(<MyUploadsPage />);
    await screen.findByText("upload 1");
    fireEvent.click(screen.getByText("Load more"));

    expect(await screen.findByText("upload 2")).toBeInTheDocument();
    expect(actions.myUploads).toHaveBeenLastCalledWith({ limit: 24, after: "cur1" });
  });

  it("deletes an item and removes it from the list", async () => {
    vi.mocked(actions.myUploads).mockResolvedValue({ data: [item("1")], meta: { hasMore: false } });
    vi.mocked(actions.deleteContent).mockResolvedValue({});

    render(<MyUploadsPage />);
    await screen.findByText("upload 1");
    fireEvent.click(screen.getByText("Delete"));

    await waitFor(() => expect(screen.queryByText("upload 1")).not.toBeInTheDocument());
    expect(actions.deleteContent).toHaveBeenCalledWith("1");
  });

  it("shows an error if delete fails, keeping the item", async () => {
    vi.mocked(actions.myUploads).mockResolvedValue({ data: [item("1")], meta: { hasMore: false } });
    vi.mocked(actions.deleteContent).mockRejectedValue(new Error("delete failed"));

    render(<MyUploadsPage />);
    await screen.findByText("upload 1");
    fireEvent.click(screen.getByText("Delete"));

    expect(await screen.findByText("delete failed")).toBeInTheDocument();
    expect(screen.getByText("upload 1")).toBeInTheDocument();
  });
});
