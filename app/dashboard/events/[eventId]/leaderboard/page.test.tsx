import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import LeaderboardPage from "./page";
import * as actions from "@/app/actions/qrati";

vi.mock("@/app/actions/qrati", () => ({
  getEventLeaderboard: vi.fn(),
  getEventPoints: vi.fn(),
}));

const renderPage = async () => render(await LeaderboardPage({ params: Promise.resolve({ eventId: "e1" }) }));

describe("LeaderboardPage (server component)", () => {
  afterEach(() => vi.clearAllMocks());

  // Shape captured from the live API: each board is { topRankers, userRank }.
  it("renders both boards from the real { topRankers, userRank } shape, plus the user's points", async () => {
    vi.mocked(actions.getEventLeaderboard).mockResolvedValue({
      leaderboardByPoint: { topRankers: [{ _id: "u1", name: "Ada", rank: 1, totalPoint: 30 }], userRank: [] },
      leaderboardByScore: { topRankers: [{ _id: "u2", rank: 1, maxScore: 12 }], userRank: [] },
    });
    vi.mocked(actions.getEventPoints).mockResolvedValue({ upload: 5, curate: 2 });

    await renderPage();

    expect(screen.getByText("1. Ada")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("1. u2")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Your points: 5 from uploads • 2 from curation")).toBeInTheDocument();
  });

  it("shows the caller's own rank when the API returns one", async () => {
    vi.mocked(actions.getEventLeaderboard).mockResolvedValue({
      leaderboardByPoint: {
        topRankers: [{ name: "Ada", rank: 1, totalPoint: 30 }],
        userRank: [{ name: "Me", rank: 7, totalPoint: 4 }],
      },
      leaderboardByScore: null,
    });
    vi.mocked(actions.getEventPoints).mockResolvedValue(null);

    await renderPage();

    expect(screen.getByText("Your rank: 7 (4)")).toBeInTheDocument();
  });

  it("falls back to position and treats missing point fields as zero", async () => {
    vi.mocked(actions.getEventLeaderboard).mockResolvedValue({
      leaderboardByPoint: { topRankers: [{}], userRank: [] },
      leaderboardByScore: { topRankers: [], userRank: [] },
    });
    vi.mocked(actions.getEventPoints).mockResolvedValue({});

    await renderPage();

    expect(screen.getByText("1. #1")).toBeInTheDocument();
    expect(screen.getByText("Your points: 0 from uploads • 0 from curation")).toBeInTheDocument();
  });

  it("shows 'No data.' for empty boards and skips the points line when points fetch fails", async () => {
    vi.mocked(actions.getEventLeaderboard).mockResolvedValue({
      leaderboardByPoint: { topRankers: [], userRank: [] },
      leaderboardByScore: { topRankers: [], userRank: [] },
    });
    vi.mocked(actions.getEventPoints).mockRejectedValue(new Error("no identity"));

    await renderPage();

    expect(screen.getAllByText("No data.")).toHaveLength(2);
    expect(screen.queryByText(/Your points/)).not.toBeInTheDocument();
  });

  it("tolerates null boards and a response with no board fields at all", async () => {
    vi.mocked(actions.getEventLeaderboard).mockResolvedValue({ leaderboardByPoint: null, leaderboardByScore: null });
    vi.mocked(actions.getEventPoints).mockResolvedValue(null);

    await renderPage();
    expect(screen.getAllByText("No data.")).toHaveLength(2);
  });

  it("tolerates a leaderboard response with no board fields", async () => {
    vi.mocked(actions.getEventLeaderboard).mockResolvedValue({});
    vi.mocked(actions.getEventPoints).mockResolvedValue(null);

    await renderPage();
    expect(screen.getAllByText("No data.")).toHaveLength(2);
  });
});
