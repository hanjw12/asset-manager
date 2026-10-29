import { useRef, useState } from 'react';
import { ASSET_CATEGORIES } from '../../shared/categories.js';
import { api } from '../api.js';
import { categoryColor } from '../colors.js';
import { formatInput, parseAmount, pct, todayLocal, wonShort } from '../format.js';
import { defaultOwner, ownerName, scopeName } from '../people.js';

export default function Plan({ summary, people, allAssets, scope, run, notify, storage }) {
  return (
    <div className="stack">
      <div className="grid grid-2">
        <People people={people} allAssets={allAssets} run={run} />
        <Goals summary={summary} people={people} scope={scope} run={run} />
        <Targets summary={summary} people={people} scope={scope} run={run} />
      </div>
      <Backup run={run} notify={notify} storage={storage} />
    </div>
  );
}

function People({ people, allAssets, run }) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null); // { id, name }

  const add = async (e) => {
    e.preventDefault();
    if (await run(() => api.createPerson(name), `${name.trim()}을(를) 추가했습니다`)) setName('');
  };

  const rename = async (e) => {
    e.preventDefault();
    if (await run(() => api.renamePerson(editing.id, editing.name), '이름을 바꿨습니다')) setEditing(null);
  };

  const remove = (p) => confirm(`'${p.name}'을(를) 삭제할까요?`) && run(() => api.deletePerson(p.id), '삭제했습니다');

  return (
    <div className="card">
      <h2>가구 구성원</h2>
      <p className="sub">사람을 추가하면 자산마다 명의를 정하고, 위쪽 ‘보기’에서 사람별로 볼 수 있습니다. 명의가 없는 자산은 ‘공동’입니다.</p>
      {people.map((p) => {
        const count = allAssets.filter((a) => a.owner_id === p.id).length;
        return editing?.id === p.id ? (
          <form key={p.id} className="row" style={{ padding: '6px 0', flexWrap: 'nowrap' }} onSubmit={rename}>
            <input
              className="input"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              aria-label="새 이름"
              autoFocus
              required
            />
            <button className="btn sm primary">저장</button>
            <button type="button" className="btn sm" onClick={() => setEditing(null)}>
              취소
            </button>
          </form>
        ) : (
          <div key={p.id} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--grid)', flexWrap: 'nowrap' }}>
            <b>{p.name}</b>
            <span className="muted" style={{ fontSize: 12.5 }}>
              자산 {count}개
            </span>
            <span className="spacer" />
            <button className="btn sm ghost" onClick={() => setEditing({ id: p.id, name: p.name })}>
              이름 변경
            </button>
            <button className="btn sm ghost danger" onClick={() => remove(p)}>
              삭제
            </button>
          </div>
        );
      })}
      <form className="row" style={{ marginTop: 12, flexWrap: 'nowrap' }} onSubmit={add}>
        <input className="input" placeholder="예: 본인, 배우자, 자녀" value={name} onChange={(e) => setName(e.target.value)} aria-label="추가할 사람 이름" required />
        <button className="btn primary">추가</button>
      </form>
    </div>
  );
}

function Targets({ summary, people, scope, run }) {
  const fromSummary = () => Object.fromEntries(summary.allocation.map((a) => [a.category, a.target ?? '']));
  const [form, setForm] = useState(fromSummary);
  const sum = Object.values(form).reduce((s, v) => s + (Number(v) || 0), 0);

  const save = (e) => {
    e.preventDefault();
    run(() => api.saveTargets(form), '목표 비중을 저장했습니다');
  };

  return (
    <form className="card" onSubmit={save}>
      <h2>목표 자산 배분</h2>
      <p className="sub">
        총자산 중 각 카테고리가 차지할 목표 비중(%). 모든 보기에 같은 목표가 적용되며, ‘현재’는 {scopeName(people, scope)} 기준입니다. 비워두면 목표 없음.
      </p>
      {ASSET_CATEGORIES.map((c) => {
        const cur = summary.allocation.find((a) => a.category === c.key);
        return (
          <div key={c.key} className="row" style={{ padding: '4px 0' }}>
            <span className="swatch" style={{ background: categoryColor(c.key) }} />
            <span style={{ width: 80 }}>{c.label}</span>
            <span className="muted num" style={{ fontSize: 12.5 }}>
              현재 {pct(cur.pct)}
            </span>
            <span className="spacer" />
            <input
              className="input amount"
              style={{ width: 80 }}
              type="number"
              min="0"
              max="100"
              step="0.1"
              aria-label={`${c.label} 목표 비중`}
              value={form[c.key]}
              onChange={(e) => setForm((f) => ({ ...f, [c.key]: e.target.value }))}
            />
            <span className="muted">%</span>
          </div>
        );
      })}
      <div className="row" style={{ marginTop: 12 }}>
        <span className={sum > 100 ? 'down' : 'text-2'}>
          합계 {pct(sum)}
          {sum > 100 && ' — 100%를 넘을 수 없습니다'}
        </span>
        <span className="spacer" />
        <button className="btn primary" disabled={sum > 100}>
          저장
        </button>
      </div>
    </form>
  );
}

function Goals({ summary, people, scope, run }) {
  const empty = { name: '', target_amount: '', target_date: '', owner_id: String(defaultOwner(scope) ?? '') };
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: k === 'target_amount' ? formatInput(e.target.value) : e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    const body = { ...form, target_amount: parseAmount(form.target_amount) };
    const ok = editId
      ? await run(() => api.updateGoal(editId, body), '목표를 수정했습니다')
      : await run(() => api.createGoal(body), '목표를 추가했습니다');
    if (ok) {
      setForm(empty);
      setEditId(null);
    }
  };

  const edit = (g) => {
    setEditId(g.id);
    setForm({ name: g.name, target_amount: formatInput(g.target_amount), target_date: g.target_date ?? '', owner_id: String(g.owner_id ?? '') });
  };

  const remove = (g) => confirm(`'${g.name}' 목표를 삭제할까요?`) && run(() => api.deleteGoal(g.id), '삭제했습니다');

  return (
    <div className="card">
      <h2>순자산 목표</h2>
      <p className="sub">
        {scopeName(people, scope)} 순자산 {wonShort(summary.totals.net)} · 개인 목표는 그 사람, 가구 목표는 가구 전체 순자산으로 달성률을 봅니다
      </p>
      {summary.goals.map((g) => (
        <div key={g.id} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--grid)', flexWrap: 'nowrap' }}>
          <div style={{ minWidth: 0 }}>
            <b>{g.name}</b> <span className="owner-tag">{g.owner_id == null ? '가구' : ownerName(people, g.owner_id)}</span>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {wonShort(g.target_amount)}
              {g.target_date && ` · ${g.target_date}`} · {pct(Math.min(100, g.progress * 100))} 달성
            </div>
          </div>
          <span className="spacer" />
          <button className="btn sm ghost" onClick={() => edit(g)}>
            수정
          </button>
          <button className="btn sm ghost danger" onClick={() => remove(g)}>
            삭제
          </button>
        </div>
      ))}
      <form onSubmit={save} className="form-grid" style={{ marginTop: 16 }}>
        <label className="field full">
          <span>{editId ? '목표 수정' : '새 목표'}</span>
          <input className="input" placeholder="예: 내 집 마련 자금" value={form.name} onChange={set('name')} required />
        </label>
        <label className="field full">
          <span>대상</span>
          <select className="input" value={form.owner_id} onChange={set('owner_id')}>
            <option value="">가구 전체</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>목표 순자산 (원)</span>
          <input className="input amount" inputMode="numeric" value={form.target_amount} onChange={set('target_amount')} required />
        </label>
        <label className="field">
          <span>목표일 (선택)</span>
          <input className="input" type="date" min={todayLocal()} value={form.target_date} onChange={set('target_date')} />
        </label>
        <div className="row full" style={{ justifyContent: 'flex-end' }}>
          {editId && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setEditId(null);
                setForm(empty);
              }}
            >
              취소
            </button>
          )}
          <button className="btn primary">{editId ? '수정' : '추가'}</button>
        </div>
      </form>
    </div>
  );
}

function Backup({ run, notify, storage }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      notify('JSON 파일을 읽을 수 없습니다', true);
      return;
    }
    if (!confirm('현재 데이터를 모두 지우고 백업 파일 내용으로 바꿉니다. 계속할까요?')) return;
    setBusy(true);
    await run(() => api.importAll(data), '백업을 복원했습니다');
    setBusy(false);
  };

  const download = async () => {
    const blob = new Blob([JSON.stringify(await api.exportAll(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `assets-backup-${todayLocal()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const leave = () => {
    const msg =
      storage.kind === 'github'
        ? '이 기기에서 연결을 해제하고 저장된 토큰을 지웁니다. GitHub 의 데이터는 그대로 남습니다. 계속할까요?'
        : '연결 화면으로 돌아갑니다. 이 기기에 저장된 데이터는 지워지지 않습니다. 계속할까요?';
    if (confirm(msg)) storage.leave();
  };

  return (
    <div className="card">
      <h2>저장 위치·백업</h2>
      <p className="sub">
        {storage.kind === 'github'
          ? `${storage.label} 에 저장됩니다. 저장할 때마다 커밋이 남습니다.`
          : '이 기기 브라우저에만 저장됩니다. 브라우저 데이터를 지우면 사라지니 JSON 백업을 받아두세요.'}
      </p>
      <div className="row">
        <button className="btn" onClick={download}>
          JSON 백업 내려받기
        </button>
        <button className="btn" onClick={() => fileRef.current.click()} disabled={busy}>
          백업 파일로 복원…
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
        <button className="btn ghost" onClick={leave}>
          {storage.kind === 'github' ? '연결 해제' : '저장 위치 바꾸기'}
        </button>
      </div>
    </div>
  );
}
