import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/actions/qrati", () => ({ getEvent: vi.fn() }));
vi.mock("@/components/gallery/GalleryGrid", () => ({
  GalleryGrid: ({ eventId, reactionEmojis, curation }: { eventId: string; reactionEmojis?: string[]; curation?: boolean }) => (
    <div>
      gallery for {eventId} with [{(reactionEmojis ?? []).join(",")}] curation={String(Boolean(curation))}
    </div>
  ),
}));
vi.mock("@/components/UploadForm", () => ({
  UploadForm: ({ eventId }: { eventId: string }) => <div>upload form for {eventId}</div>,
}));

import * as actions from "@/app/actions/qrati";
import GalleryPage from "./page";
import UploadPage from "./upload/page";

describe("thin params-unwrapping page wrappers", () => {
  it("GalleryPage offers the event's reactions on a REACTION event, without curation", async () => {
    vi.mocked(actions.getEvent).mockResolvedValue({ event: { engagementStyle: "REACTION", reactionEmojis: ["like", "love"] } });
    render(await GalleryPage({ params: Promise.resolve({ eventId: "e1" }) }));
    expect(screen.getByText("gallery for e1 with [like,love] curation=false")).toBeInTheDocument();
  });

  it("GalleryPage offers curation (and no reactions) on a CONTEST event", async () => {
    vi.mocked(actions.getEvent).mockResolvedValue({ event: { engagementStyle: "CONTEST", reactionEmojis: ["like"] } });
    render(await GalleryPage({ params: Promise.resolve({ eventId: "e1" }) }));
    expect(screen.getByText("gallery for e1 with [] curation=true")).toBeInTheDocument();
  });

  it("GalleryPage offers neither on a SIMPLE event, even if reactionEmojis are stored", async () => {
    vi.mocked(actions.getEvent).mockResolvedValue({ event: { engagementStyle: "SIMPLE", reactionEmojis: ["like"] } });
    render(await GalleryPage({ params: Promise.resolve({ eventId: "e1" }) }));
    expect(screen.getByText("gallery for e1 with [] curation=false")).toBeInTheDocument();
  });

  it("GalleryPage still renders when the event lookup fails (nothing offered)", async () => {
    vi.mocked(actions.getEvent).mockRejectedValue(new Error("boom"));
    render(await GalleryPage({ params: Promise.resolve({ eventId: "e1" }) }));
    expect(screen.getByText("gallery for e1 with [] curation=false")).toBeInTheDocument();
  });

  it("UploadPage unwraps params and passes eventId through to UploadForm", async () => {
    render(await UploadPage({ params: Promise.resolve({ eventId: "e1" }) }));
    expect(screen.getByText("upload form for e1")).toBeInTheDocument();
  });
});
