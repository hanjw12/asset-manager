import { ASSET_CATEGORIES, isLiability } from './categories.js';

// 첫 기록 달부터 end 가 속한 달까지 각 달의 말일. 마지막 달은 end 그 자체.
export function monthPoints(firstDate, end) {
  const points = [];
  let [y, m] = firstDate.slice(0, 7).split('-').map(Number);
  const [ey, em] = end.slice(0, 7).split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    const isLast = y === ey && m === em;
    points.push(isLast ? end : new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10));
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return points;
}

// scope: 'all'(가구 전체) | 'joint'(공동 명의) | 사람 id
export function inScope(ownerId, scope) {
  if (scope === 'all') return true;
  if (scope === 'joint') return ownerId == null;
  return ownerId === scope;
}

// 평가액은 다음 기록이 있을 때까지 그대로 유지된다고 보고(carry-forward) 합산한다.
export function computeSummary({ assets, valuations, targets, goals, people = [], today, scope = 'all' }) {
  const allById = new Map(assets.map((a) => [a.id, a]));
  const sortedAll = valuations
    .filter((v) => allById.has(v.asset_id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

  const latestAll = new Map();
  for (const v of sortedAll) latestAll.set(v.asset_id, v.value);

  const totalsFor = (ownerScope) => {
    const values = new Map([...latestAll].filter(([id]) => inScope(allById.get(id).owner_id ?? null, ownerScope)));
    return totalsOf(values, allById);
  };
  const household = totalsOf(latestAll, allById);

  // 사람별 순자산 (공동 명의가 있으면 마지막에 따로)
  const byPerson = people.map((p) => ({ owner_id: p.id, name: p.name, ...totalsFor(p.id) }));
  if (assets.some((a) => a.owner_id == null)) byPerson.push({ owner_id: null, name: '공동', ...totalsFor('joint') });

  const byId = new Map(assets.filter((a) => inScope(a.owner_id ?? null, scope)).map((a) => [a.id, a]));
  const sorted = sortedAll.filter((v) => byId.has(v.asset_id));

  const series = [];
  if (sorted.length) {
    const lastDate = sorted[sorted.length - 1].date;
    const end = lastDate > today ? lastDate : today;
    const current = new Map();
    let i = 0;
    for (const date of monthPoints(sorted[0].date, end)) {
      while (i < sorted.length && sorted[i].date <= date) {
        current.set(sorted[i].asset_id, sorted[i].value);
        i += 1;
      }
      series.push({ date, ...totalsOf(current, byId) });
    }
  }

  const latest = new Map([...latestAll].filter(([id]) => byId.has(id)));
  const totals = totalsOf(latest, byId);

  const catTotals = Object.fromEntries(ASSET_CATEGORIES.map((c) => [c.key, 0]));
  for (const [id, value] of latest) {
    const cat = byId.get(id).category;
    if (cat in catTotals) catTotals[cat] += value;
  }
  const targetMap = Object.fromEntries(targets.map((t) => [t.category, t.pct]));
  const allocation = ASSET_CATEGORIES.map((c) => ({
    category: c.key,
    value: catTotals[c.key],
    pct: totals.assets > 0 ? (catTotals[c.key] / totals.assets) * 100 : 0,
    target: targetMap[c.key] ?? null,
  }));

  const net = totals.net;
  const ago = (n) => (series.length > n ? net - series[series.length - 1 - n].net : null);

  // 개인 목표는 그 사람 순자산, 가구 목표(owner 없음)는 가구 전체 순자산으로 달성률을 본다.
  const goalNet = (g) => (g.owner_id == null ? household.net : totalsFor(g.owner_id).net);

  return {
    scope,
    totals,
    change: { month: ago(1), year: ago(12) },
    allocation,
    series,
    byPerson,
    goals: goals
      .filter((g) => inScope(g.owner_id ?? null, scope))
      .map((g) => {
        const gn = goalNet(g);
        return {
          ...g,
          progress: g.target_amount > 0 ? Math.max(0, gn) / g.target_amount : 0,
          remaining: Math.max(0, g.target_amount - gn),
        };
      }),
    lastRecorded: sorted.length ? sorted[sorted.length - 1].date : null,
  };
}

function totalsOf(values, byId) {
  let assets = 0;
  let debts = 0;
  for (const [id, value] of values) {
    if (isLiability(byId.get(id).category)) debts += value;
    else assets += value;
  }
  return { assets, debts, net: assets - debts };
}
