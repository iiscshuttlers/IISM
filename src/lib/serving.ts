/**
 * Who serves and who receives, by the badminton laws of service.
 *
 * The serving side serves from its right service court when its own score is even and from its
 * left when it's odd, and the receiver is the opponent standing diagonally opposite (in the
 * same-named court). In doubles:
 *  - the serving side wins the rally: same server, who switches courts with their partner;
 *  - the receiving side wins the rally: nobody moves, the service passes to them, and their
 *    server is whichever of the pair stands in the court that matches their new score.
 * Singles follows the same courts with one player a side.
 *
 * A team's positions are kept as which of its two players (0 = first picked, 1 = second) stands
 * in its right service court. Courts are named from the team's own side, facing the net.
 */
export type Side = "A" | "B";
export type Court = "right" | "left";
export type PlayerIndex = 0 | 1;

export interface ServeState {
  serving: Side;
  /** Which of team A's players stands in A's right service court. */
  rightA: PlayerIndex;
  /** Which of team B's players stands in B's right service court. */
  rightB: PlayerIndex;
}

/** Team A serves first, each team's first-picked player starting in the right court. */
export const INITIAL_SERVE: ServeState = { serving: "A", rightA: 0, rightB: 0 };

export const otherSide = (s: Side): Side => (s === "A" ? "B" : "A");
const partner = (p: PlayerIndex): PlayerIndex => (p === 0 ? 1 : 0);

/** The court a side serves (and its opponent receives) from at this score. */
export const serviceCourt = (score: number): Court => (score % 2 === 0 ? "right" : "left");

const rightOf = (s: ServeState, side: Side) => (side === "A" ? s.rightA : s.rightB);
const withRight = (s: ServeState, side: Side, right: PlayerIndex): ServeState =>
  side === "A" ? { ...s, rightA: right } : { ...s, rightB: right };
const switchCourts = (s: ServeState, side: Side) => withRight(s, side, partner(rightOf(s, side)));

/** The court a player stands in right now. */
export const courtOf = (s: ServeState, side: Side, player: PlayerIndex): Court =>
  rightOf(s, side) === player ? "right" : "left";

/** The next serve: who serves, who receives, and from which court. */
export function nextServe(s: ServeState, scoreA: number, scoreB: number) {
  const court = serviceCourt(s.serving === "A" ? scoreA : scoreB);
  const playerIn = (side: Side) => (court === "right" ? rightOf(s, side) : partner(rightOf(s, side)));
  return { court, server: playerIn(s.serving), receiver: playerIn(otherSide(s.serving)) };
}

/** After a rally won by `winner`. */
export function afterRally(s: ServeState, winner: Side): ServeState {
  return winner === s.serving ? switchCourts(s, winner) : { ...s, serving: winner };
}

/**
 * After a point is taken off `side` to correct the score.
 *
 * `servedBack`: the point being removed is the rally just scored, and it won `side` the serve
 * (a service over). Taking it back returns the serve to the other side; nobody had moved.
 *
 * Otherwise the same player keeps serving: the server's court follows their score, so a
 * serving pair switches back. Receivers never move on a score change.
 */
export function afterPointRemoved(s: ServeState, side: Side, servedBack = false): ServeState {
  if (servedBack) return { ...s, serving: otherSide(side) };
  return side === s.serving ? switchCourts(s, side) : s;
}

/**
 * Makes `player` the server (when `side` is serving) or the receiver for the next serve, moving
 * their partner to the other court. Used to set who serves and receives first in a game, or to
 * correct the positions.
 */
export function choosePlayer(
  s: ServeState,
  scoreA: number,
  scoreB: number,
  side: Side,
  player: PlayerIndex,
): ServeState {
  const { court } = nextServe(s, scoreA, scoreB);
  return withRight(s, side, court === "right" ? player : partner(player));
}

export const isServeState = (v: unknown): v is ServeState => {
  const s = v as ServeState | null;
  return (
    !!s && (s.serving === "A" || s.serving === "B") &&
    (s.rightA === 0 || s.rightA === 1) && (s.rightB === 0 || s.rightB === 1)
  );
};
