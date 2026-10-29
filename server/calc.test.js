import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSummary, monthPoints } from './calc.js';
import { openDb } from './db.js';
import { createApi } from './api.js';
import express from 'express';

test('monthPoints: 월말 날짜와 마지막 날 그대로', () => {
  assert.deepEqual(monthPoints('2025-11-15', '2026-02-10'), ['2025-11-30', '2025-12-31', '2026-01-31', '2026-02-10']);
});

test('computeSummary: 평가액 carry-forward, 부채 차감, 배분 비중', () => {
  const s = computeSummary({
    assets: [
      { id: 1, category: 'cash' },
      { id: 2, category: 'invest' },
      { id: 3, category: 'debt' },
    ],
    valuations: [
      { id: 1, asset_id: 1, date: '2026-01-10', value: 100 },
      { id: 2, asset_id: 2, date: '2026-01-20', value: 300 },
      { id: 3, asset_id: 3, date: '2026-02-05', value: 50 },
      { id: 4, asset_id: 1, date: '2026-03-01', value: 200 },
    ],
    targets: [{ category: 'cash', pct: 40 }],
    goals: [{ id: 1, name: 'g', target_amount: 900 }],
    today: '2026-03-15',
  });
  assert.deepEqual(
    s.series.map((p) => [p.date, p.net]),
    [
      ['2026-01-31', 400],
      ['2026-02-28', 350],
      ['2026-03-15', 450],
    ],
  );
  assert.deepEqual(s.totals, { assets: 500, debts: 50, net: 450 });
  assert.equal(s.change.month, 100);
  assert.equal(s.change.year, null);
  const cash = s.allocation.find((a) => a.category === 'cash');
  assert.equal(cash.pct, 40);
  assert.equal(cash.target, 40);
  assert.equal(s.goals[0].remaining, 450);
});

test('computeSummary: 사람별 범위, 공동 명의, 개인/가구 목표 달성률', () => {
  const input = {
    assets: [
      { id: 1, category: 'cash', owner_id: 1 },
      { id: 2, category: 'invest', owner_id: 2 },
      { id: 3, category: 'realestate', owner_id: null },
      { id: 4, category: 'debt', owner_id: 2 },
    ],
    valuations: [
      { id: 1, asset_id: 1, date: '2026-01-01', value: 100 },
      { id: 2, asset_id: 2, date: '2026-01-01', value: 200 },
      { id: 3, asset_id: 3, date: '2026-01-01', value: 1000 },
      { id: 4, asset_id: 4, date: '2026-01-01', value: 50 },
    ],
    targets: [],
    goals: [
      { id: 1, name: '가구', target_amount: 2500, owner_id: null },
      { id: 2, name: 'B', target_amount: 300, owner_id: 2 },
    ],
    people: [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
    ],
    today: '2026-01-31',
  };
  const all = computeSummary(input);
  assert.equal(all.totals.net, 1250);
  assert.deepEqual(
    all.byPerson.map((p) => [p.name, p.net]),
    [
      ['A', 100],
      ['B', 150],
      ['공동', 1000],
    ],
  );
  assert.equal(all.goals.length, 2);
  assert.equal(all.goals[0].progress, 0.5);

  const b = computeSummary({ ...input, scope: 2 });
  assert.deepEqual(b.totals, { assets: 200, debts: 50, net: 150 });
  assert.deepEqual(b.goals.map((g) => [g.name, g.remaining]), [['B', 150]]);
  assert.equal(b.allocation.find((a) => a.category === 'invest').pct, 100);

  assert.equal(computeSummary({ ...input, scope: 'joint' }).totals.net, 1000);
});

test('computeSummary: 기록이 없으면 빈 시리즈', () => {
  const s = computeSummary({ assets: [], valuations: [], targets: [], goals: [], today: '2026-01-01' });
  assert.deepEqual(s.series, []);
  assert.equal(s.totals.net, 0);
});

test('API: 자산 등록 → 일괄 기록 → 요약, 잘못된 입력은 400', async (t) => {
  const app = express();
  app.use(express.json());
  app.use('/api', createApi(openDb(':memory:')));
  const server = app.listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, url, body) => {
    const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: r.status, body: r.status === 204 ? null : await r.json() };
  };

  const a = await call('POST', '/assets', { name: '통장', category: 'cash', value: '1,000', date: '2026-01-01' });
  assert.equal(a.status, 201);
  assert.equal(a.body.value, 1000);

  assert.equal((await call('POST', '/valuations', { date: '2026-02-01', entries: [{ asset_id: a.body.id, value: 1500 }] })).status, 200);
  const list = await call('GET', '/assets');
  assert.equal(list.body[0].value, 1500);
  assert.equal(list.body[0].prev_value, 1000);

  assert.equal((await call('POST', '/assets', { name: '', category: 'cash' })).status, 400);
  assert.equal((await call('POST', '/assets', { name: 'x', category: 'nope' })).status, 400);
  assert.equal((await call('POST', '/valuations', { date: '2026-13-99', entries: [{ asset_id: 1, value: 1 }] })).status, 400);
  assert.equal((await call('POST', '/valuations', { date: '2026-02-01', entries: [{ asset_id: 999, value: 1 }] })).status, 400);
  assert.equal((await call('PUT', '/targets', { cash: 80, invest: 30 })).status, 400);

  // 샘플은 빈 상태에서만
  assert.equal((await call('POST', '/sample')).status, 400);

  // 사람 추가 → 명의 지정 → 사람별 요약, 명의 자산이 있으면 삭제 거부
  const p = await call('POST', '/people', { name: '가' });
  assert.equal(p.status, 201);
  assert.equal((await call('PUT', `/assets/${a.body.id}`, { name: '통장', category: 'cash', owner_id: p.body.id })).body.owner_id, p.body.id);
  assert.equal((await call('POST', '/assets', { name: 'x', category: 'cash', owner_id: 999 })).status, 400);
  assert.equal((await call('GET', `/summary?owner=${p.body.id}`)).body.totals.net, 1500);
  assert.equal((await call('GET', '/summary?owner=joint')).body.totals.net, 0);
  assert.equal((await call('GET', '/summary?owner=999')).status, 400);
  assert.equal((await call('DELETE', `/people/${p.body.id}`)).status, 400);

  // 백업 → 복원 왕복 (명의 포함)
  const backup = await call('GET', '/export');
  assert.equal((await call('DELETE', `/assets/${a.body.id}`)).status, 204);
  assert.equal((await call('DELETE', `/people/${p.body.id}`)).status, 204);
  assert.equal((await call('POST', '/import', backup.body)).status, 200);
  const restored = (await call('GET', '/assets')).body[0];
  assert.equal(restored.value, 1500);
  assert.equal(restored.owner_id, p.body.id);
  assert.equal((await call('GET', '/people')).body[0].name, '가');
});
