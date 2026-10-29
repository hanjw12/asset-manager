import { useMemo, useState } from 'react';
import { CATEGORIES, isLiability } from '../../shared/categories.js';
import { api } from '../api.js';
import { categoryColor } from '../colors.js';
import { formatInput, parseAmount, signed, todayLocal, won, wonShort } from '../format.js';
import { ownerName, scopeName } from '../people.js';

// 월말 등 정해진 날에 모든 자산·부채의 평가액을 한 번에 기록한다.
export default function Record({ assets, people, scope, run, go }) {
  const showOwner = scope === 'all' && people.length > 0;
  const [date, setDate] = useState(todayLocal);
  const initial = useMemo(() => Object.fromEntries(assets.map((a) => [a.id, a.value == null ? '' : formatInput(a.value)])), [assets]);
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);

  const ordered = CATEGORIES.flatMap((c) => assets.filter((a) => a.category === c.key));
  const changed = ordered.filter((a) => values[a.id] !== '' && parseAmount(values[a.id]) !== a.value);

  const net = (pick) =>
    ordered.reduce((s, a) => {
      const v = pick(a);
      return v == null ? s : s + (isLiability(a.category) ? -v : v);
    }, 0);
  const before = net((a) => a.value);
  const after = net((a) => (values[a.id] === '' ? a.value : parseAmount(values[a.id])));

  if (!assets.length) {
    return (
      <div className="card empty">
        <h2>먼저 자산을 등록하세요</h2>
        <button className="btn primary" onClick={() => go('assets')}>
          자산 등록하기
        </button>
      </div>
    );
  }

  const save = async () => {
    const entries = ordered.filter((a) => values[a.id] !== '').map((a) => ({ asset_id: a.id, value: parseAmount(values[a.id]) }));
    setSaving(true);
    await run(() => api.record(date, entries), `${date} 기준 ${entries.length}개 항목을 기록했습니다`);
    setSaving(false);
  };

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>평가액 기록{scope !== 'all' && ` · ${scopeName(people, scope)}`}</h2>
          <p className="sub">
            기준일의 잔액·평가액을 입력하세요. 마지막 기록값이 미리 채워져 있어 바뀐 것만 고치면 됩니다. 같은 날짜에 다시 저장하면 덮어씁니다.
          </p>
        </div>
        <label className="field" style={{ width: 170 }}>
          <span>기준일</span>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>항목</th>
              <th className="r">마지막 기록</th>
              <th className="r" style={{ width: 200 }}>
                새 평가액 (원)
              </th>
              <th className="r">변화</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((a) => {
              const v = values[a.id];
              const diff = v !== '' && a.value != null ? parseAmount(v) - a.value : null;
              return (
                <tr key={a.id} className="item">
                  <td>
                    <span className="row">
                      <span className="swatch" style={{ background: categoryColor(a.category) }} />
                      {a.name}
                      {showOwner && <span className="owner-tag">{ownerName(people, a.owner_id)}</span>}
                    </span>
                  </td>
                  <td className="r num text-2">
                    {a.value == null ? '-' : won(a.value)}
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {a.value_date}
                    </div>
                  </td>
                  <td className="r">
                    <input
                      className="input amount"
                      inputMode="numeric"
                      aria-label={`${a.name} 새 평가액`}
                      value={v}
                      style={diff ? { borderColor: 'var(--accent)' } : undefined}
                      onChange={(e) => setValues((s) => ({ ...s, [a.id]: formatInput(e.target.value) }))}
                    />
                  </td>
                  <td className="r num text-2">{diff ? signed(diff) : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <span className="text-2">
          {scopeName(people, scope)} 순자산 {wonShort(before)} → <b>{wonShort(after)}</b>{' '}
          <span className={after > before ? 'up' : after < before ? 'down' : 'muted'}>({signed(after - before)})</span>
          <span className="muted"> · 변경 {changed.length}건</span>
        </span>
        <span className="spacer" />
        <button className="btn" onClick={() => setValues(initial)} disabled={saving}>
          되돌리기
        </button>
        <button className="btn primary" onClick={save} disabled={saving}>
          {date} 기준으로 저장
        </button>
      </div>
    </div>
  );
}
