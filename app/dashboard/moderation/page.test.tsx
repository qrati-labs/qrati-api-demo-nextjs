import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ModerationPage from "./page";
import * as actions from "@/app/actions/qrati";

vi.mock("@/app/actions/qrati", () => ({
  moderationQueue: vi.fn(),
  moderateContent: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const item = (id: string, extra = {}) => ({
  _id: id,
  caption: `Photo ${id}`,
  status: "IN_REVIEW" as const,
  moderationAnalysisState: "COMPLETE" as const,
  decidedBy: null,
  decidedAt: null,
  ...extra,
});

describe("ModerationPage", () => {
  afterEach(() => vi.resetAllMocks());

  it("lists the IN_REVIEW queue with AI analysis state", async () => {
    vi.mocked(actions.moderationQueue).mockResolvedValue({ data: [item("1")], meta: { hasMore: false } });

    render(<ModerationPage />);

    expect(await screen.findByText("Photo 1")).toBeInTheDocument();
    expect(screen.getByText("AI analysis: COMPLETE")).toBeInTheDocument();
    expect(actions.moderationQueue).toHaveBeenCalledWith({ metadata: undefined, after: undefined, limit: 10 });
  });

  it("shows an empty state", async () => {
    vi.mocked(actions.moderationQueue).mockResolvedValue({ data: [], meta: { hasMore: false } });

    render(<ModerationPage />);

    expect(await screen.findByText("Nothing waiting for review.")).toBeInTheDocument();
  });

  it("shows n/a when no analysis state is reported", async () => {
    vi.mocked(actions.moderationQueue).mockResolvedValue({ data: [item("1", { moderationAnalysisState: undefined })] });

    render(<ModerationPage />);

    expect(await screen.findByText("AI analysis: n/a")).toBeInTheDocument();
  });

  it("approves an item with its reason and removes it from the queue", async () => {
    vi.mocked(actions.moderationQueue).mockResolvedValue({ data: [item("1"), item("2")] });
    vi.mocked(actions.moderateContent).mockResolvedValue(item("1", { status: "APPROVED" }));

    render(<ModerationPage />);
    await screen.findByText("Photo 1");
    fireEvent.change(screen.getAllByPlaceholderText("Reason (optional)")[0], { target: { value: "looks good" } });
    fireEvent.click(screen.getAllByText("Approve")[0]);

    await waitFor(() =>
      expect(actions.moderateContent).toHaveBeenCalledWith({ contentId: "1", status: "APPROVED", reason: "looks good" })
    );
    expect(await screen.findByText("Approved 1.")).toBeInTheDocument();
    expect(screen.queryByText("Photo 1")).not.toBeInTheDocument();
    expect(screen.getByText("Photo 2")).toBeInTheDocument();
  });

  it("rejects an item without a reason", async () => {
    vi.mocked(actions.moderationQueue).mockResolvedValue({ data: [item("1")] });
    vi.mocked(actions.moderateContent).mockResolvedValue(item("1", { status: "REJECTED" }));

    render(<ModerationPage />);
    await screen.findByText("Photo 1");
    fireEvent.click(screen.getByText("Reject"));

    await waitFor(() =>
      expect(actions.moderateContent).toHaveBeenCalledWith({ contentId: "1", status: "REJECTED", reason: undefined })
    );
    expect(await screen.findByText("Rejected 1.")).toBeInTheDocument();
  });

  it("keeps the item and shows the problem code when a decision fails with 409", async () => {
    vi.mocked(actions.moderationQueue).mockResolvedValue({ data: [item("1")] });
    vi.mocked(actions.moderateContent).mockRejectedValue(
      Object.assign(new Error("Content is still uploading or processing"), { code: "content_not_ready" })
    );

    render(<ModerationPage />);
    await screen.findByText("Photo 1");
    fireEvent.click(screen.getByText("Approve"));

    expect(await screen.findByText(/still uploading or processing \(content_not_ready\)/)).toBeInTheDocument();
    expect(screen.getByText("Photo 1")).toBeInTheDocument();
  });

  it("shows a plain error when a decision fails without a code", async () => {
    vi.mocked(actions.moderationQueue).mockResolvedValue({ data: [item("1")] });
    vi.mocked(actions.moderateContent).mockRejectedValue(new Error("boom"));

    render(<ModerationPage />);
    await screen.findByText("Photo 1");
    fireEvent.click(screen.getByText("Reject"));

    expect(await screen.findByText("boom")).toBeInTheDocument();
  });

  it("stringifies a non-Error rejection", async () => {
    vi.mocked(actions.moderationQueue).mockRejectedValue("plain failure");

    render(<ModerationPage />);

    expect(await screen.findByText("plain failure")).toBeInTheDocument();
  });

  it("shows an error when the queue fails to load", async () => {
    vi.mocked(actions.moderationQueue).mockRejectedValue(new Error("Forbidden"));

    render(<ModerationPage />);

    expect(await screen.findByText("Forbidden")).toBeInTheDocument();
    expect(screen.queryByText("Nothing waiting for review.")).not.toBeInTheDocument();
  });

  it("pages with the nextCursor and appends results", async () => {
    vi.mocked(actions.moderationQueue)
      .mockResolvedValueOnce({ data: [item("1")], meta: { hasMore: true, nextCursor: "cur-1" } })
      .mockResolvedValueOnce({ data: [item("2")], meta: { hasMore: false } });

    render(<ModerationPage />);
    await screen.findByText("Photo 1");
    fireEvent.click(screen.getByText("Load more"));

    expect(await screen.findByText("Photo 2")).toBeInTheDocument();
    expect(actions.moderationQueue).toHaveBeenLastCalledWith({ metadata: undefined, after: "cur-1", limit: 10 });
    expect(screen.getByText("Photo 1")).toBeInTheDocument();
    expect(screen.queryByText("Load more")).not.toBeInTheDocument();
  });

  it("applies the metadata filter and reloads from the first page", async () => {
    vi.mocked(actions.moderationQueue).mockResolvedValue({ data: [item("1")] });

    render(<ModerationPage />);
    await screen.findByText("Photo 1");
    fireEvent.change(screen.getByLabelText("Filter by upload metadata"), { target: { value: ' {"businessId":"b-42"} ' } });
    fireEvent.submit(screen.getByLabelText("Filter by upload metadata").closest("form")!);

    await waitFor(() =>
      expect(actions.moderationQueue).toHaveBeenLastCalledWith({ metadata: '{"businessId":"b-42"}', after: undefined, limit: 10 })
    );
  });

  it("falls back to url when there is no thumbnail", async () => {
    vi.mocked(actions.moderationQueue).mockResolvedValue({ data: [item("1", { url: "https://x.test/a.jpg" })] });

    render(<ModerationPage />);

    expect(await screen.findByAltText("Photo 1")).toHaveAttribute("src", "https://x.test/a.jpg");
  });

  it("explains that the filter matches the metadata field attached at upload", async () => {
    vi.mocked(actions.moderationQueue).mockResolvedValue({ data: [] });

    render(<ModerationPage />);

    expect(await screen.findByText(/key-values attached to uploads in their/)).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by upload metadata")).toHaveAttribute("placeholder", '{"businessId":"b-42"}');
  });
});
