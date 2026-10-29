import express from 'express';
import { CATEGORY_KEYS, ASSET_CATEGORIES } from '../shared/categories.js';
import { computeSummary } from './calc.js';
import { tx } from './db.js';
import { buildSample } from './sample.js';

export class ValidationError extends Error {}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function today() {
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
  if (!Number.isFinite(n) || n < 0) throw new ValidationError(`${field}은(는) 0 이상의 숫자여야 합니다`);
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

export function createApi(db) {
  const api = express.Router();
  const q = (sql) => db.prepare(sql);

  const personExists = (pid) => !!q('SELECT 1 FROM people WHERE id = ?').get(pid);

  // 빈 값 = 공동 명의 / 가구 목표
  const owner = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const pid = id(v);
    if (!personExists(pid)) throw new ValidationError('존재하지 않는 사람입니다');
    return pid;
  };

  const scopeOf = (v) => {
    if (v === undefined || v === '' || v === 'all') return 'all';
    if (v === 'joint') return 'joint';
    const pid = id(v);
    if (!personExists(pid)) throw new ValidationError('존재하지 않는 사람입니다');
    return pid;
  };

  api.get('/people', (req, res) => res.json(q('SELECT * FROM people ORDER BY id').all()));

  api.post('/people', (req, res) => {
    const { lastInsertRowid } = q('INSERT INTO people (name) VALUES (?)').run(str(req.body?.name, '이름', { required: true, max: 40 }));
    res.status(201).json(q('SELECT * FROM people WHERE id = ?').get(lastInsertRowid));
  });

  api.put('/people/:id', (req, res) => {
    const pid = owner(req.params.id);
    q('UPDATE people SET name = ? WHERE id = ?').run(str(req.body?.name, '이름', { required: true, max: 40 }), pid);
    res.json(q('SELECT * FROM people WHERE id = ?').get(pid));
  });

  api.delete('/people/:id', (req, res) => {
    const pid = owner(req.params.id);
    const n = q('SELECT (SELECT COUNT(*) FROM assets WHERE owner_id = ?) + (SELECT COUNT(*) FROM goals WHERE owner_id = ?) AS n').get(pid, pid).n;
    if (n > 0) throw new ValidationError('이 사람 명의의 자산·목표가 있습니다. 먼저 다른 사람이나 공동으로 옮기거나 삭제하세요');
    q('DELETE FROM people WHERE id = ?').run(pid);
    res.status(204).end();
  });

  const listAssets = () =>
    q(`SELECT a.*,
              (SELECT value FROM valuations v WHERE v.asset_id = a.id ORDER BY date DESC LIMIT 1) AS value,
              (SELECT date  FROM valuations v WHERE v.asset_id = a.id ORDER BY date DESC LIMIT 1) AS value_date,
              (SELECT value FROM valuations v WHERE v.asset_id = a.id ORDER BY date DESC LIMIT 1 OFFSET 1) AS prev_value
       FROM assets a ORDER BY a.id`).all();

  const getAsset = (assetId) => {
    const row = listAssets().find((a) => a.id === assetId);
    if (!row) throw new ValidationError('자산을 찾을 수 없습니다');
    return row;
  };

  const upsertValuation = q(
    `INSERT INTO valuations (asset_id, date, value) VALUES (?, ?, ?)
     ON CONFLICT (asset_id, date) DO UPDATE SET value = excluded.value`,
  );

  api.get('/assets', (req, res) => res.json(listAssets()));

  api.post('/assets', (req, res) => {
    const b = req.body ?? {};
    const row = tx(db, () => {
      const { lastInsertRowid } = q(
        'INSERT INTO assets (name, category, institution, note, owner_id) VALUES (?, ?, ?, ?, ?)',
      ).run(
        str(b.name, '이름', { required: true }),
        category(b.category),
        str(b.institution, '기관'),
        str(b.note, '메모', { max: 1000 }),
        owner(b.owner_id),
      );
      if (b.value !== undefined && b.value !== '') {
        upsertValuation.run(lastInsertRowid, b.date ? date(b.date) : today(), amount(b.value));
      }
      return Number(lastInsertRowid);
    });
    res.status(201).json(getAsset(row));
  });

  api.put('/assets/:id', (req, res) => {
    const assetId = id(req.params.id);
    const b = req.body ?? {};
    getAsset(assetId);
    q('UPDATE assets SET name = ?, category = ?, institution = ?, note = ?, owner_id = ? WHERE id = ?').run(
      str(b.name, '이름', { required: true }),
      category(b.category),
      str(b.institution, '기관'),
      str(b.note, '메모', { max: 1000 }),
      owner(b.owner_id),
      assetId,
    );
    res.json(getAsset(assetId));
  });

  api.delete('/assets/:id', (req, res) => {
    q('DELETE FROM assets WHERE id = ?').run(id(req.params.id));
    res.status(204).end();
  });

  api.get('/assets/:id/valuations', (req, res) => {
    res.json(q('SELECT * FROM valuations WHERE asset_id = ? ORDER BY date DESC').all(id(req.params.id)));
  });

  // 한 날짜에 여러 자산의 평가액을 한꺼번에 기록 (월말 정산용)
  api.post('/valuations', (req, res) => {
    const b = req.body ?? {};
    const d = date(b.date);
    if (!Array.isArray(b.entries) || !b.entries.length) throw new ValidationError('기록할 항목이 없습니다');
    const known = new Set(q('SELECT id FROM assets').all().map((r) => r.id));
    const entries = b.entries.map((e) => {
      const assetId = id(e.asset_id);
      if (!known.has(assetId)) throw new ValidationError('존재하지 않는 자산이 포함되어 있습니다');
      return [assetId, amount(e.value)];
    });
    tx(db, () => entries.forEach(([assetId, value]) => upsertValuation.run(assetId, d, value)));
    res.json({ saved: entries.length });
  });

  api.delete('/valuations/:id', (req, res) => {
    q('DELETE FROM valuations WHERE id = ?').run(id(req.params.id));
    res.status(204).end();
  });

  api.get('/targets', (req, res) => res.json(q('SELECT * FROM allocation_targets').all()));

  api.put('/targets', (req, res) => {
    const b = req.body ?? {};
    const rows = ASSET_CATEGORIES.map((c) => [c.key, b[c.key] === '' || b[c.key] == null ? null : Number(b[c.key])]);
    for (const [, pct] of rows) {
      if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
        throw new ValidationError('목표 비중은 0~100 사이여야 합니다');
      }
    }
    const sum = rows.reduce((s, [, pct]) => s + (pct ?? 0), 0);
    if (sum > 100.001) throw new ValidationError(`목표 비중 합계가 100%를 넘습니다 (${sum.toFixed(1)}%)`);
    tx(db, () => {
      q('DELETE FROM allocation_targets').run();
      const ins = q('INSERT INTO allocation_targets (category, pct) VALUES (?, ?)');
      rows.forEach(([cat, pct]) => pct !== null && ins.run(cat, pct));
    });
    res.json(q('SELECT * FROM allocation_targets').all());
  });

  const goalFields = (b) => [...goalRow(b), owner(b.owner_id)];

  api.get('/goals', (req, res) => res.json(q('SELECT * FROM goals ORDER BY id').all()));

  api.post('/goals', (req, res) => {
    const { lastInsertRowid } = q('INSERT INTO goals (name, target_amount, target_date, owner_id) VALUES (?, ?, ?, ?)').run(
      ...goalFields(req.body ?? {}),
    );
    res.status(201).json(q('SELECT * FROM goals WHERE id = ?').get(lastInsertRowid));
  });

  api.put('/goals/:id', (req, res) => {
    const goalId = id(req.params.id);
    q('UPDATE goals SET name = ?, target_amount = ?, target_date = ?, owner_id = ? WHERE id = ?').run(
      ...goalFields(req.body ?? {}),
      goalId,
    );
    res.json(q('SELECT * FROM goals WHERE id = ?').get(goalId));
  });

  api.delete('/goals/:id', (req, res) => {
    q('DELETE FROM goals WHERE id = ?').run(id(req.params.id));
    res.status(204).end();
  });

  api.get('/summary', (req, res) => {
    res.json(
      computeSummary({
        assets: q('SELECT * FROM assets').all(),
        valuations: q('SELECT * FROM valuations').all(),
        targets: q('SELECT * FROM allocation_targets').all(),
        goals: q('SELECT * FROM goals ORDER BY id').all(),
        people: q('SELECT * FROM people ORDER BY id').all(),
        today: today(),
        scope: scopeOf(req.query.owner),
      }),
    );
  });

  api.get('/export', (req, res) => {
    const data = {
      version: 2,
      exported_at: new Date().toISOString(),
      people: q('SELECT * FROM people ORDER BY id').all(),
      assets: q('SELECT * FROM assets ORDER BY id').all(),
      valuations: q('SELECT * FROM valuations ORDER BY id').all(),
      allocation_targets: q('SELECT * FROM allocation_targets').all(),
      goals: q('SELECT * FROM goals ORDER BY id').all(),
    };
    res.setHeader('Content-Disposition', `attachment; filename="assets-backup-${today()}.json"`);
    res.json(data);
  });

  api.post('/import', (req, res) => {
    replaceAll(db, req.body);
    res.json({ ok: true });
  });

  api.post('/sample', (req, res) => {
    if (q('SELECT (SELECT COUNT(*) FROM assets) + (SELECT COUNT(*) FROM people) AS n').get().n > 0) {
      throw new ValidationError('이미 데이터가 있습니다. 샘플은 빈 상태에서만 넣을 수 있습니다');
    }
    replaceAll(db, buildSample(today()));
    res.json({ ok: true });
  });

  api.use((err, req, res, next) => {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: '요청 형식이 올바르지 않습니다' });
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했습니다' });
  });

  return api;
}

// 백업 파일로 전체 데이터를 교체한다. 검증을 모두 통과해야만 기존 데이터를 지운다.
function replaceAll(db, data) {
  if (!data || !Array.isArray(data.assets) || !Array.isArray(data.valuations)) {
    throw new ValidationError('백업 파일 형식이 아닙니다');
  }
  const people = (data.people ?? []).map((p) => ({ id: id(p.id), name: str(p.name, '이름', { required: true, max: 40 }) }));
  const personIds = new Set(people.map((p) => p.id));
  const ownerRef = (v) => {
    if (v == null || v === '') return null;
    if (!personIds.has(Number(v))) throw new ValidationError('백업에 없는 사람을 가리키는 항목이 있습니다');
    return Number(v);
  };
  const assets = data.assets.map((a) => ({
    id: id(a.id),
    name: str(a.name, '이름', { required: true }),
    category: category(a.category),
    institution: str(a.institution, '기관'),
    note: str(a.note, '메모', { max: 1000 }),
    owner_id: ownerRef(a.owner_id),
  }));
  const assetIds = new Set(assets.map((a) => a.id));
  const valuations = data.valuations.map((v) => {
    if (!assetIds.has(Number(v.asset_id))) throw new ValidationError('자산과 연결되지 않은 평가 기록이 있습니다');
    return [Number(v.asset_id), date(v.date), amount(v.value)];
  });
  const targets = (data.allocation_targets ?? []).map((t) => [category(t.category), Number(t.pct)]);
  const goals = (data.goals ?? []).map((g) => [...goalRow(g), ownerRef(g.owner_id)]);

  tx(db, () => {
    db.exec('DELETE FROM valuations; DELETE FROM assets; DELETE FROM allocation_targets; DELETE FROM goals; DELETE FROM people;');
    const insP = db.prepare('INSERT INTO people (id, name) VALUES (?, ?)');
    people.forEach((p) => insP.run(p.id, p.name));
    const insA = db.prepare('INSERT INTO assets (id, name, category, institution, note, owner_id) VALUES (?, ?, ?, ?, ?, ?)');
    assets.forEach((a) => insA.run(a.id, a.name, a.category, a.institution, a.note, a.owner_id));
    const insV = db.prepare('INSERT OR REPLACE INTO valuations (asset_id, date, value) VALUES (?, ?, ?)');
    valuations.forEach((v) => insV.run(...v));
    const insT = db.prepare('INSERT INTO allocation_targets (category, pct) VALUES (?, ?)');
    targets.forEach((t) => insT.run(...t));
    const insG = db.prepare('INSERT INTO goals (name, target_amount, target_date, owner_id) VALUES (?, ?, ?, ?)');
    goals.forEach((g) => insG.run(...g));
  });
}

function goalRow(g) {
  return [
    str(g.name, '목표 이름', { required: true }),
    amount(g.target_amount, '목표 금액'),
    g.target_date ? date(g.target_date, '목표일') : null,
  ];
}
