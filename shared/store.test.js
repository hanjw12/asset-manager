import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSummary, monthPoints } from './calc.js';
import * as S from './store.js';

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

test('store: 자산 등록 → 일괄 기록 → 요약, 잘못된 입력은 거부', () => {
  const doc = S.emptyData();
  const a = S.createAsset(doc, { name: '통장', category: 'cash', value: '1,000', date: '2026-01-01' });
  assert.equal(a.value, 1000);

  S.record(doc, '2026-02-01', [{ asset_id: a.id, value: 1500 }]);
  S.record(doc, '2026-02-01', [{ asset_id: a.id, value: 1500 }]); // 같은 날짜는 덮어쓴다
  assert.equal(doc.valuations.length, 2);
  const [listed] = S.listAssets(doc);
  assert.equal(listed.value, 1500);
  assert.equal(listed.prev_value, 1000);

  const bad = [
    () => S.createAsset(doc, { name: '', category: 'cash' }),
    () => S.createAsset(doc, { name: 'x', category: 'nope' }),
    () => S.record(doc, '2026-13-99', [{ asset_id: a.id, value: 1 }]),
    () => S.record(doc, '2026-02-01', [{ asset_id: 999, value: 1 }]),
    () => S.saveTargets(doc, { cash: 80, invest: 30 }),
    () => S.loadSample(doc),
  ];
  for (const fn of bad) assert.throws(fn, S.ValidationError);

  // 사람 추가 → 명의 지정 → 사람별 요약, 명의 자산이 있으면 삭제 거부
  const p = S.createPerson(doc, '가');
  assert.equal(S.updateAsset(doc, a.id, { name: '통장', category: 'cash', owner_id: p.id }).owner_id, p.id);
  assert.throws(() => S.createAsset(doc, { name: 'x', category: 'cash', owner_id: 999 }), S.ValidationError);
  assert.equal(S.summary(doc, p.id, '2026-02-01').totals.net, 1500);
  assert.equal(S.summary(doc, 'joint', '2026-02-01').totals.net, 0);
  assert.throws(() => S.summary(doc, 999), S.ValidationError);
  assert.throws(() => S.deletePerson(doc, p.id), S.ValidationError);

  // 지운 번호는 다시 쓰지 않는다
  S.deleteAsset(doc, a.id);
  assert.equal(doc.valuations.length, 0);
  assert.equal(S.createAsset(doc, { name: '새 통장', category: 'cash' }).id, a.id + 1);
});

test('store: 백업 → 복원 왕복 (명의 포함), 로컬 서버 시절 백업도 읽는다', () => {
  const doc = S.emptyData();
  const p = S.createPerson(doc, '가');
  const a = S.createAsset(doc, { name: '통장', category: 'cash', owner_id: p.id, value: 1500, date: '2026-01-01' });
  S.createGoal(doc, { name: '목표', target_amount: 3000, owner_id: p.id });

  const restored = S.normalize(JSON.parse(JSON.stringify(S.exportData(doc))));
  assert.equal(S.listAssets(restored)[0].value, 1500);
  assert.equal(S.listAssets(restored)[0].owner_id, p.id);
  assert.equal(S.listGoals(restored)[0].owner_id, p.id);
  assert.equal(S.listPeople(restored)[0].name, '가');

  // version 2: SQLite 행 그대로, next_id 없음
  const v2 = {
    version: 2,
    people: [{ id: 1, name: '가' }],
    assets: [{ id: 3, name: '통장', category: 'cash', institution: '', note: '', owner_id: 1, created_at: '2026-01-01 00:00:00' }],
    valuations: [{ id: 9, asset_id: 3, date: '2026-01-01', value: 10 }],
    allocation_targets: [{ category: 'cash', pct: 50 }],
    goals: [{ id: 2, name: 'g', target_amount: 100, target_date: null, owner_id: null }],
  };
  const old = S.normalize(v2);
  assert.equal(S.summary(old, 'all', '2026-01-31').totals.net, 10);
  assert.equal(S.createAsset(old, { name: 'x', category: 'cash' }).id, 4);

  assert.throws(() => S.normalize({ assets: [] }), S.ValidationError);
  assert.throws(() => S.normalize({ ...v2, people: [] }), S.ValidationError);
  assert.throws(() => S.normalize({ ...v2, assets: [...v2.assets, v2.assets[0]] }), S.ValidationError);
});

test('store: 샘플 데이터는 검증을 통과한다', () => {
  const doc = S.emptyData();
  S.loadSample(doc, '2026-10-29');
  assert.equal(doc.people.length, 2);
  assert.ok(S.summary(doc, 'all', '2026-10-29').totals.net > 0);
});
