import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UploadForm } from "./UploadForm";
import * as actions from "@/app/actions/qrati";

vi.mock("@/app/actions/qrati", () => ({
  createUpload: vi.fn(),
  completeUpload: vi.fn(),
  failUpload: vi.fn(),
  abortUpload: vi.fn(),
  uploadStatus: vi.fn(),
}));

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });

function selectFile() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe("UploadForm", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:preview");
    global.fetch = vi.fn(async () => new Response(null, { status: 200 }));
    vi.mocked(actions.uploadStatus).mockRejectedValue(new Error("not found"));
  });
  afterEach(() => vi.clearAllMocks());

  it("runs create -> S3 PUT -> complete and redirects to the gallery on success", async () => {
    vi.mocked(actions.createUpload).mockResolvedValue({ contentId: "c1", key: "k1", uploadUrl: "https://s3.test/put" });
    vi.mocked(actions.completeUpload).mockResolvedValue({ contentId: "c1" });

    render(<UploadForm eventId="e1" />);
    selectFile();
    fireEvent.click(screen.getByText("Upload"));

    await waitFor(() => expect(actions.completeUpload).toHaveBeenCalledWith({ contentId: "c1", key: "k1" }));
    expect(global.fetch).toHaveBeenCalledWith("https://s3.test/put", expect.objectContaining({ method: "PUT" }));
    expect(push).toHaveBeenCalledWith("/dashboard/events/e1");
    expect(refresh).toHaveBeenCalled();
  });

  it("sends a clientUploadId on create and reports processing/moderation status after complete", async () => {
    vi.mocked(actions.createUpload).mockResolvedValue({ contentId: "c1", key: "k1", uploadUrl: "https://s3.test/put" });
    vi.mocked(actions.completeUpload).mockResolvedValue({ contentId: "c1" });
    vi.mocked(actions.uploadStatus).mockResolvedValue({
      contentId: "c1",
      uploadStatus: "COMPLETED",
      processingStatus: "queued",
      moderationStatus: "IN_REVIEW",
      renditionReady: false,
      publicDiscovery: false,
      failureCode: null,
    });

    render(<UploadForm eventId="e1" />);
    selectFile();
    fireEvent.click(screen.getByText("Upload"));

    expect(await screen.findByText(/processing: queued, moderation: IN_REVIEW/)).toBeInTheDocument();
    const created = vi.mocked(actions.createUpload).mock.calls[0][0];
    expect(created.clientUploadId).toMatch(/^[0-9a-f-]{36}$/);
    expect(actions.uploadStatus).toHaveBeenCalledWith({ contentId: "c1" });
  });

  it("recovers from a lost create response by asking /uploads/status with the clientUploadId", async () => {
    vi.mocked(actions.createUpload).mockRejectedValue(new Error("network down"));
    vi.mocked(actions.uploadStatus).mockResolvedValue({
      contentId: "c9",
      uploadStatus: "PENDING",
      processingStatus: "uploading",
      moderationStatus: "IN_REVIEW",
      renditionReady: false,
      publicDiscovery: false,
      failureCode: null,
    });

    render(<UploadForm eventId="e1" />);
    selectFile();
    fireEvent.click(screen.getByText("Upload"));

    expect(await screen.findByText(/Upload c9 was created .*response was lost/)).toBeInTheDocument();
    const { clientUploadId } = vi.mocked(actions.createUpload).mock.calls[0][0];
    expect(actions.uploadStatus).toHaveBeenCalledWith({ eventId: "e1", clientUploadId });
    expect(actions.abortUpload).not.toHaveBeenCalled();
  });

  it("shows the original error when create failed and the upload does not exist", async () => {
    vi.mocked(actions.createUpload).mockRejectedValue(new Error("network down"));

    render(<UploadForm eventId="e1" />);
    selectFile();
    fireEvent.click(screen.getByText("Upload"));

    expect(await screen.findByText("network down")).toBeInTheDocument();
  });

  it("still redirects when the status lookup fails after complete", async () => {
    vi.mocked(actions.createUpload).mockResolvedValue({ contentId: "c1", key: "k1", uploadUrl: "https://s3.test/put" });
    vi.mocked(actions.completeUpload).mockResolvedValue({ contentId: "c1" });

    render(<UploadForm eventId="e1" />);
    selectFile();
    fireEvent.click(screen.getByText("Upload"));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/events/e1"));
  });

  it("calls failUpload (not abortUpload) when the S3 PUT itself fails", async () => {
    vi.mocked(actions.createUpload).mockResolvedValue({ contentId: "c1", key: "k1", uploadUrl: "https://s3.test/put" });
    vi.mocked(actions.failUpload).mockResolvedValue({});
    global.fetch = vi.fn(async () => new Response(null, { status: 500 }));

    render(<UploadForm eventId="e1" />);
    selectFile();
    fireEvent.click(screen.getByText("Upload"));

    await waitFor(() => expect(actions.failUpload).toHaveBeenCalledWith("c1"));
    expect(actions.abortUpload).not.toHaveBeenCalled();
    expect(await screen.findByText(/S3 PUT failed with status 500/)).toBeInTheDocument();
  });

  it("calls abortUpload when completeUpload throws after a successful S3 PUT", async () => {
    vi.mocked(actions.createUpload).mockResolvedValue({ contentId: "c1", key: "k1", uploadUrl: "https://s3.test/put" });
    vi.mocked(actions.completeUpload).mockRejectedValue(new Error("complete failed"));
    vi.mocked(actions.abortUpload).mockResolvedValue({});

    render(<UploadForm eventId="e1" />);
    selectFile();
    fireEvent.click(screen.getByText("Upload"));

    await waitFor(() => expect(actions.abortUpload).toHaveBeenCalledWith({ contentId: "c1", key: "k1" }));
    expect(actions.failUpload).not.toHaveBeenCalled();
    expect(await screen.findByText("complete failed")).toBeInTheDocument();
  });

  it("disables the submit button until a file is chosen", () => {
    render(<UploadForm eventId="e1" />);
    expect(screen.getByText("Upload")).toBeDisabled();
  });
});
