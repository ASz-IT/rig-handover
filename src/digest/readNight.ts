import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, DigestStatus, NightDigest, StatusCounts } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

type ParsedLine = {
  at: string;
  atMs: number;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStatus(value: string): value is DigestStatus {
  return value === 'ok' || value === 'retry' || value === 'fail';
}

function errorCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string') {
    return err.code;
  }
  return undefined;
}

function parseLine(line: string): ParsedLine | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const { at, job, status, owner, error } = value;
  if (typeof at !== 'string' || at.length === 0) return null;
  if (typeof job !== 'string' || job.length === 0) return null;
  if (typeof status !== 'string' || !isStatus(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && error !== null && typeof error !== 'string') return null;
  const atMs = Date.parse(at);
  if (Number.isNaN(atMs)) return null;
  return {
    at,
    atMs,
    job,
    status,
    owner,
    error: typeof error === 'string' ? error : null,
  };
}

type Group = DigestRow & { firstMs: number; lastMs: number };

export function readNight(runsDir: string, night: string): NightDigest | null {
  if (!NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    if (errorCode(err) === 'ENOENT') return null;
    throw err;
  }

  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;
  const groups = new Map<string, Group>();
  const lines = text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) {
      badLines += 1;
      continue;
    }
    counts[parsed.status] += 1;
    const existing = groups.get(parsed.job);
    if (!existing) {
      groups.set(parsed.job, {
        job: parsed.job,
        owner: parsed.owner,
        runs: 1,
        retries: parsed.status === 'retry' ? 1 : 0,
        lastStatus: parsed.status,
        lastError: parsed.error,
        firstAt: parsed.at,
        lastAt: parsed.at,
        firstMs: parsed.atMs,
        lastMs: parsed.atMs,
      });
      continue;
    }
    existing.runs += 1;
    if (parsed.status === 'retry') existing.retries += 1;
    if (parsed.atMs < existing.firstMs) {
      existing.firstMs = parsed.atMs;
      existing.firstAt = parsed.at;
    }
    if (parsed.atMs >= existing.lastMs) {
      existing.lastMs = parsed.atMs;
      existing.lastAt = parsed.at;
      existing.lastStatus = parsed.status;
      existing.lastError = parsed.error;
      existing.owner = parsed.owner;
    }
  }

  const rows: DigestRow[] = [...groups.values()]
    .map((group) => ({
      job: group.job,
      owner: group.owner,
      runs: group.runs,
      retries: group.retries,
      lastStatus: group.lastStatus,
      lastError: group.lastError,
      firstAt: group.firstAt,
      lastAt: group.lastAt,
    }))
    .sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));

  return { rows, badLines, counts };
}
