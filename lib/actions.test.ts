import { beforeEach, describe, expect, it, vi } from "vitest";

const raw = vi.hoisted(() => ({
  getEvent: vi.fn(),
  moderateContent: vi.fn(),
  notAFunction: "value",
}));
vi.mock("@/app/actions/qrati", () => raw);

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  })
);
vi.mock("next/navigation", () => ({ notFound }));

import { ActionError, actions, notFoundOn404 } from "./actions";

describe("actions wrapper", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes arguments through and returns the action's result", async () => {
    raw.getEvent.mockResolvedValue({ event: { _id: "e1" } });

    await expect(actions.getEvent("e1")).resolves.toEqual({ event: { _id: "e1" } });
    expect(raw.getEvent).toHaveBeenCalledWith("e1");
  });

  it("rethrows an API error returned as data, with its real message, status and problem code", async () => {
    raw.moderateContent.mockResolvedValue({ __qratiError: { status: 409, code: "content_not_ready", message: "Content is still processing" } });

    const error = await actions.moderateContent({ contentId: "c1", status: "APPROVED" }).catch((e) => e);

    expect(error).toBeInstanceOf(ActionError);
    expect(error).toMatchObject({ message: "Content is still processing", status: 409, code: "content_not_ready" });
  });

  it("propagates an unexpected rejection unchanged", async () => {
    raw.getEvent.mockRejectedValue(new Error("Not signed in."));

    await expect(actions.getEvent("e1")).rejects.toThrow("Not signed in.");
  });

  it("does not treat null or plain objects as errors", async () => {
    raw.getEvent.mockResolvedValueOnce(null).mockResolvedValueOnce({ data: 1 });

    await expect(actions.getEvent("a")).resolves.toBeNull();
    await expect(actions.getEvent("b")).resolves.toEqual({ data: 1 });
  });

  it("returns non-function exports as they are", () => {
    expect((actions as unknown as Record<string, unknown>).notAFunction).toBe("value");
  });
});

describe("notFoundOn404", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders Next's 404 page for a 404 API error", () => {
    expect(() => notFoundOn404(new ActionError("Event not found", 404, "event_not_found"))).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("rethrows any other error", () => {
    const error = new ActionError("Forbidden", 403);
    expect(() => notFoundOn404(error)).toThrow(error);
    expect(() => notFoundOn404(new Error("boom"))).toThrow("boom");
    expect(notFound).not.toHaveBeenCalled();
  });
});
