// One row per job.

export type DigestStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  /** Null stays null. The page shows an em dash. */
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: DigestStatus;
  /** Error on the latest line, or null when that line has none. */
  lastError: string | null;
  /** Original `at` strings from the log. The offset is kept. */
  firstAt: string;
  lastAt: string;
};

export type StatusCounts = {
  ok: number;
  retry: number;
  fail: number;
};

/** `counts` are parsed lines. `badLines` did not parse and were not thrown. */
export type NightDigest = {
  rows: DigestRow[];
  badLines: number;
  counts: StatusCounts;
};

/** `(runsDir, night) => NightDigest | null`. Null when `runs/<night>.jsonl` is missing. Rows are sorted by job. */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;

export { readNight } from './readNight.js';
