import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });

  it('links both nights on disk to a digest that renders', async () => {
    const app = createApp(config);
    const html = await (await app.request('/')).text();
    expect(html).toContain('10 ok');
    expect(html).toContain('4 retry');
    expect(html).toContain('1 fail');
    expect(html).toContain('7 ok');
    for (const night of ['2026-10-28', '2026-10-27']) {
      const href = `/digest/${night}`;
      expect(html).toContain(`href="${href}"`);
      const page = await app.request(href);
      expect(page.status).toBe(200);
      const body = await page.text();
      expect(body).toContain('<table');
      expect(body).toContain(night);
    }
  });
});
