import { CATEGORY_KEYS, ASSET_CATEGORIES } from './categories.js';
import { computeSummary } from './calc.js';
import { buildSample } from './sample.js';

// 데이터 전체는 JSON 문서 하나다. 화면은 이 문서를 고치고, 저장소(브라우저 또는 GitHub)는 문서를 통째로 저장한다.
// 여기 있는 함수는 문서를 직접 고치므로, 호출하는 쪽에서 복사본에 적용하고 저장이 성공하면 바꿔 끼운다.

export class ValidationError extends Error {}

export const DATA_VERSION = 3;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function localToday() {
  // 로컬 날짜 기준 (toISOString 은 UTC 라 자정 무렵 하루가 밀린다)
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function str(v, field, { required = false, max = 200 } = {}) {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
  if (required && !s) throw new ValidationError(`${field}을(를) 입력하세요`);
  if (s.length > max) throw new ValidationError(`${field}은(는) ${max}자 이하로 입력하세요`);
  return s;
}

function amount(v, field = '금액') {
  const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : Number(v);
  if (v === '' || v == null || !Number.isFinite(n) || n < 0) throw new ValidationError(`${field}은(는) 0 이상의 숫자여야 합니다`);
  if (n > Number.MAX_SAFE_INTEGER) throw new ValidationError(`${field}이(가) 너무 큽니다`);
  return Math.round(n);
}

function date(v, field = '날짜') {
  if (typeof v !== 'string' || !DATE_RE.test(v) || Number.isNaN(Date.parse(v))) {
    throw new ValidationError(`${field} 형식은 YYYY-MM-DD 입니다`);
  }
  return v;
}

function category(v) {
  if (!CATEGORY_KEYS.includes(v)) throw new ValidationError('알 수 없는 카테고리입니다');
  return v;
}

function id(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError('잘못된 ID 입니다');
  return n;
}

const byId = (a, b) => a.id - b.id;
const maxId = (rows) => rows.reduce((m, r) => Math.max(m, r.id), 0);

export function emptyData() {
  return { version: DATA_VERSION, next_id: {}, people: [], assets: [], valuations: [], allocation_targets: [], goals: [] };
}

// 지운 항목의 번호를 다시 쓰지 않도록 종류별 다음 번호를 문서에 남긴다
function newId(doc, kind) {
  const n = Math.max(doc.next_id[kind] ?? 1, maxId(doc[kind]) + 1);
  doc.next_id[kind] = n + 1;
  return n;
}

function findPerson(doc, v) {
  const pid = id(v);
  const p = doc.people.find((x) => x.id === pid);
  if (!p) throw new ValidationError('존재하지 않는 사람입니다');
  return p;
}

// 빈 값 = 공동 명의 / 가구 목표
function owner(doc, v) {
  if (v === undefined || v === null || v === '') return null;
  return findPerson(doc, v).id;
}

export function scopeOf(doc, v) {
  if (v === undefined || v === '' || v === 'all') return 'all';
  if (v === 'joint') return 'joint';
  return findPerson(doc, v).id;
}

function findAsset(doc, v) {
  const aid = id(v);
  const a = doc.assets.find((x) => x.id === aid);
  if (!a) throw new ValidationError('자산을 찾을 수 없습니다');
  return a;
}

function goalFields(doc, g) {
  return {
    name: str(g.name, '목표 이름', { required: true }),
    target_amount: amount(g.target_amount, '목표 금액'),
    target_date: g.target_date ? date(g.target_date, '목표일') : null,
    owner_id: owner(doc, g.owner_id),
  };
}

function assetFields(doc, b) {
  return {
    name: str(b.name, '이름', { required: true }),
    category: category(b.category),
    institution: str(b.institution, '기관'),
    note: str(b.note, '메모', { max: 1000 }),
    owner_id: owner(doc, b.owner_id),
  };
}

// 같은 자산·같은 날짜는 덮어쓴다
function upsertValuation(doc, assetId, d, value) {
  const v = doc.valuations.find((x) => x.asset_id === assetId && x.date === d);
  if (v) v.value = value;
  else doc.valuations.push({ id: newId(doc, 'valuations'), asset_id: assetId, date: d, value });
}

// ---- 읽기 ----

export function listPeople(doc) {
  return [...doc.people].sort(byId);
}

export function listAssets(doc) {
  const hist = new Map();
  for (const v of doc.valuations) {
    if (!hist.has(v.asset_id)) hist.set(v.asset_id, []);
    hist.get(v.asset_id).push(v);
  }
  return [...doc.assets].sort(byId).map((a) => {
    const vs = (hist.get(a.id) ?? []).sort((x, y) => (x.date < y.date ? 1 : -1));
    return { ...a, value: vs[0]?.value ?? null, value_date: vs[0]?.date ?? null, prev_value: vs[1]?.value ?? null };
  });
}

export function assetValuations(doc, assetId) {
  const aid = id(assetId);
  return doc.valuations.filter((v) => v.asset_id === aid).sort((x, y) => (x.date < y.date ? 1 : -1));
}

export function listGoals(doc) {
  return [...doc.goals].sort(byId);
}

export function summary(doc, scope, today = localToday()) {
  return computeSummary({
    assets: doc.assets,
    valuations: doc.valuations,
    targets: doc.allocation_targets,
    goals: listGoals(doc),
    people: listPeople(doc),
    today,
    scope: scopeOf(doc, scope),
  });
}

export function exportData(doc) {
  return { ...structuredClone(doc), exported_at: new Date().toISOString() };
}

// ---- 쓰기 (doc 을 직접 고친다) ----

export function createPerson(doc, name) {
  const clean = str(name, '이름', { required: true, max: 40 });
  const p = { id: newId(doc, 'people'), name: clean };
  doc.people.push(p);
  return p;
}

export function renamePerson(doc, pid, name) {
  const p = findPerson(doc, pid);
  p.name = str(name, '이름', { required: true, max: 40 });
  return p;
}

export function deletePerson(doc, pid) {
  const p = findPerson(doc, pid);
  if (doc.assets.some((a) => a.owner_id === p.id) || doc.goals.some((g) => g.owner_id === p.id)) {
    throw new ValidationError('이 사람 명의의 자산·목표가 있습니다. 먼저 다른 사람이나 공동으로 옮기거나 삭제하세요');
  }
  doc.people = doc.people.filter((x) => x.id !== p.id);
}

export function createAsset(doc, b = {}, today = localToday()) {
  const fields = assetFields(doc, b);
  const initial = b.value !== undefined && b.value !== '' ? [b.date ? date(b.date) : today, amount(b.value)] : null;
  const a = { id: newId(doc, 'assets'), ...fields, created_at: new Date().toISOString() };
  doc.assets.push(a);
  if (initial) upsertValuation(doc, a.id, ...initial);
  return listAssets(doc).find((x) => x.id === a.id);
}

export function updateAsset(doc, assetId, b = {}) {
  const a = findAsset(doc, assetId);
  Object.assign(a, assetFields(doc, b));
  return listAssets(doc).find((x) => x.id === a.id);
}

export function deleteAsset(doc, assetId) {
  const aid = id(assetId);
  doc.assets = doc.assets.filter((a) => a.id !== aid);
  doc.valuations = doc.valuations.filter((v) => v.asset_id !== aid);
}

// 한 날짜에 여러 자산의 평가액을 한꺼번에 기록 (월말 정산용)
export function record(doc, d, entries) {
  d = date(d);
  if (!Array.isArray(entries) || !entries.length) throw new ValidationError('기록할 항목이 없습니다');
  const known = new Set(doc.assets.map((a) => a.id));
  const rows = entries.map((e) => {
    const aid = id(e.asset_id);
    if (!known.has(aid)) throw new ValidationError('존재하지 않는 자산이 포함되어 있습니다');
    return [aid, amount(e.value)];
  });
  rows.forEach(([aid, value]) => upsertValuation(doc, aid, d, value));
  return { saved: rows.length };
}

export function deleteValuation(doc, vid) {
  const n = id(vid);
  doc.valuations = doc.valuations.filter((v) => v.id !== n);
}

export function saveTargets(doc, b = {}) {
  const rows = ASSET_CATEGORIES.map((c) => [c.key, b[c.key] === '' || b[c.key] == null ? null : Number(b[c.key])]);
  for (const [, pct] of rows) {
    if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
      throw new ValidationError('목표 비중은 0~100 사이여야 합니다');
    }
  }
  const sum = rows.reduce((s, [, pct]) => s + (pct ?? 0), 0);
  if (sum > 100.001) throw new ValidationError(`목표 비중 합계가 100%를 넘습니다 (${sum.toFixed(1)}%)`);
  doc.allocation_targets = rows.filter(([, pct]) => pct !== null).map(([cat, pct]) => ({ category: cat, pct }));
  return doc.allocation_targets;
}

export function createGoal(doc, g = {}) {
  const fields = goalFields(doc, g);
  const goal = { id: newId(doc, 'goals'), ...fields };
  doc.goals.push(goal);
  return goal;
}

export function updateGoal(doc, goalId, g = {}) {
  const gid = id(goalId);
  const goal = doc.goals.find((x) => x.id === gid);
  if (!goal) throw new ValidationError('목표를 찾을 수 없습니다');
  Object.assign(goal, goalFields(doc, g));
  return goal;
}

export function deleteGoal(doc, goalId) {
  const gid = id(goalId);
  doc.goals = doc.goals.filter((g) => g.id !== gid);
}

export function loadSample(doc, today = localToday()) {
  if (doc.assets.length + doc.people.length > 0) {
    throw new ValidationError('이미 데이터가 있습니다. 샘플은 빈 상태에서만 넣을 수 있습니다');
  }
  Object.assign(doc, normalize(buildSample(today)));
}

// ---- 백업·원격 파일 검증 ----

// 백업 파일이나 저장소의 JSON 을 검증해 깨끗한 문서로 만든다. 로컬 서버 시절의 백업(version 2)도 받는다.
export function normalize(data) {
  if (!data || !Array.isArray(data.assets) || !Array.isArray(data.valuations)) {
    throw new ValidationError('백업 파일 형식이 아닙니다');
  }
  const doc = emptyData();
  doc.people = (data.people ?? []).map((p) => ({ id: id(p.id), name: str(p.name, '이름', { required: true, max: 40 }) }));
  const personIds = new Set(doc.people.map((p) => p.id));
  const ownerRef = (v) => {
    if (v == null || v === '') return null;
    if (!personIds.has(Number(v))) throw new ValidationError('백업에 없는 사람을 가리키는 항목이 있습니다');
    return Number(v);
  };
  doc.assets = data.assets.map((a) => ({
    id: id(a.id),
    name: str(a.name, '이름', { required: true }),
    category: category(a.category),
    institution: str(a.institution, '기관'),
    note: str(a.note, '메모', { max: 1000 }),
    owner_id: ownerRef(a.owner_id),
    created_at: typeof a.created_at === 'string' ? a.created_at : new Date().toISOString(),
  }));
  const assetIds = new Set(doc.assets.map((a) => a.id));
  for (const v of data.valuations) {
    if (!assetIds.has(Number(v.asset_id))) throw new ValidationError('자산과 연결되지 않은 평가 기록이 있습니다');
    upsertValuation(doc, Number(v.asset_id), date(v.date), amount(v.value));
  }
  doc.allocation_targets = (data.allocation_targets ?? []).map((t) => ({ category: category(t.category), pct: Number(t.pct) }));
  doc.goals = (data.goals ?? []).map((g, i) => ({
    id: g.id ? id(g.id) : i + 1,
    name: str(g.name, '목표 이름', { required: true }),
    target_amount: amount(g.target_amount, '목표 금액'),
    target_date: g.target_date ? date(g.target_date, '목표일') : null,
    owner_id: ownerRef(g.owner_id),
  }));
  for (const kind of ['people', 'assets', 'valuations', 'goals']) {
    const ids = doc[kind].map((r) => r.id);
    if (new Set(ids).size !== ids.length) throw new ValidationError('백업 파일에 중복된 ID 가 있습니다');
    doc.next_id[kind] = Math.max(Number(data.next_id?.[kind]) || 1, maxId(doc[kind]) + 1);
  }
  return doc;
}
