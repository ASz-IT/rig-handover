import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';
import type { NightDigest } from '../src/digest/types.js';

function appWith(files: Record<string, string>) {
  const runsDir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(runsDir, name), body);
  }
  const config: RigConfig = {
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  };
  return createApp(config);
}

function line(at: string, job: string, status: 'ok' | 'retry' | 'fail', owner: string | null, error?: string) {
  return JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });
}

function jobsIn(html: string, jobs: string[]) {
  let prev = -1;
  for (const job of jobs) {
    const at = html.indexOf(job);
    expect(at).toBeGreaterThan(prev);
    prev = at;
  }
}

describe('digest routes', () => {
  it('returns 200 for the page and the JSON, in the same job order', async () => {
    const files = {
      '2026-10-02.jsonl': [
        line('2026-10-02T02:00:00+01:00', 'b/job', 'ok', 'rook'),
        line('2026-10-02T01:00:00+01:00', 'a/job', 'fail', 'lane-07', 'disk full'),
      ].join('\n'),
    };
    const app = appWith(files);
    const page = await app.request('/digest/2026-10-02');
    const json = await app.request('/api/digest/2026-10-02');
    expect(page.status).toBe(200);
    expect(json.status).toBe(200);
    const html = await page.text();
    const body = (await json.json()) as NightDigest;
    const jobs = ['a/job', 'b/job'];
    jobsIn(html, jobs);
    expect(body.rows.map((row) => row.job)).toEqual(jobs);
    expect(html).toContain('class="warn"');
    expect(html).toContain('disk full');
  });

  it('returns 404 for a night with no file', async () => {
    const app = appWith({});
    const page = await app.request('/digest/2026-10-03');
    const json = await app.request('/api/digest/2026-10-03');
    expect(page.status).toBe(404);
    expect(json.status).toBe(404);
    expect(await page.text()).toContain('not found');
  });

  it('renders nothing ran for an empty night', async () => {
    const app = appWith({ '2026-10-04.jsonl': '' });
    const page = await app.request('/digest/2026-10-04');
    const json = await app.request('/api/digest/2026-10-04');
    expect(page.status).toBe(200);
    expect(json.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');
    const body = (await json.json()) as NightDigest;
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('renders a night that contains a bad line', async () => {
    const app = appWith({
      '2026-10-05.jsonl': [line('2026-10-05T01:00:00+01:00', 'c/job', 'ok', null), '{"job":'].join('\n'),
    });
    const page = await app.request('/digest/2026-10-05');
    const json = await app.request('/api/digest/2026-10-05');
    expect(page.status).toBe(200);
    expect(json.status).toBe(200);
    const html = await page.text();
    const body = (await json.json()) as NightDigest;
    expect(html).toContain('c/job');
    expect(html).toContain('—');
    expect(body.badLines).toBe(1);
    expect(body.rows.map((row) => row.job)).toEqual(['c/job']);
    expect(body.rows[0]?.owner).toBeNull();
  });

  it('matches page and JSON job order for the 2026-10-28 fixture', async () => {
    const copied = readFileSync('runs/2026-10-28.jsonl', 'utf8');
    const app = appWith({ '2026-10-28.jsonl': copied });
    const page = await app.request('/digest/2026-10-28');
    const json = await app.request('/api/digest/2026-10-28');
    expect(page.status).toBe(200);
    expect(json.status).toBe(200);
    const html = await page.text();
    const body = (await json.json()) as NightDigest;
    const jobs = body.rows.map((row) => row.job);
    expect(jobs).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    jobsIn(html, jobs);
    expect(html).not.toContain('<script');
  });
});
