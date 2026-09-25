import type { Stage } from "./types";

export const STAGES: { key: Stage; label: string }[] = [
  { key: "applied", label: "Applied" },
  { key: "oa_todo", label: "OA to do" },
  { key: "oa_done", label: "OA done" },
  { key: "interview", label: "Interview" },
  { key: "offer", label: "Offer" },
  { key: "rejected", label: "Rejected" },
];

export const STAGE_LABEL: Record<Stage, string> = Object.fromEntries(
  STAGES.map((s) => [s.key, s.label]),
) as Record<Stage, string>;

/** Progress order. Rejected and offer are end states. */
const RANK: Record<Stage, number> = {
  applied: 0,
  oa_todo: 1,
  oa_done: 2,
  interview: 3,
  offer: 4,
  rejected: 5,
};

export const isStage = (v: unknown): v is Stage => typeof v === "string" && v in RANK;

/**
 * Whether moving from `current` to `next` is a real step forward.
 * End states (offer, rejected) never move back to an earlier stage.
 */
export function isForward(current: Stage, next: Stage): boolean {
  if (current === next) return false;
  if (current === "rejected" || current === "offer") return false;
  if (next === "rejected" || next === "offer") return true;
  return RANK[next] > RANK[current];
}

/** Pick the later of two statuses when several emails describe one job. */
export function laterStage(a: Stage, b: Stage): Stage {
  return isForward(a, b) ? b : a;
}
