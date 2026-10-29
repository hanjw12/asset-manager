import { useEffect, useState } from 'react';
import { CATEGORIES } from '../../shared/categories.js';
import { api } from '../api.js';
import { categoryColor } from '../colors.js';
import { formatInput, parseAmount, signed, todayLocal, won, wonShort } from '../format.js';
import { defaultOwner, ownerName } from '../people.js';

export default function Assets({ assets, people, scope, run }) {
  const [editing, setEditing] = useState(null); // null | 'new' | asset
  const showOwner = people.length > 0;

  const groups = CATEGORIES.map((c) => ({ ...c, items: assets.filter((a) => a.category === c.key) })).filter((g) => g.items.length);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>자산·부채 목록</h2>
          <p className="sub">항목을 누르면 정보 수정과 평가 이력을 볼 수 있습니다. 부채는 양수로 입력합니다.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing('new')}>
          + 항목 추가
        </button>
      </div>

      {groups.length ? (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>이름</th>
                {showOwner && <th>명의</th>}
                <th>기관</th>
                <th className="r">평가액</th>
                <th className="r">직전 대비</th>
                <th className="r">기록일</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Group key={g.key} group={g} people={showOwner && people} onOpen={setEditing} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">등록된 항목이 없습니다. 오른쪽 위 버튼으로 추가하세요.</p>
      )}

      {editing && (
        <AssetDialog asset={editing === 'new' ? null : editing} people={people} scope={scope} run={run} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

// people 이 false 면 명의 열을 숨긴다 (등록된 사람이 없을 때)
function Group({ group, people, onOpen }) {
  const total = group.items.reduce((s, a) => s + (a.value ?? 0), 0);
  return (
    <>
      <tr className="group">
        <td colSpan={people ? 3 : 2}>
          <span className="row">
            <span className="swatch" style={{ background: categoryColor(group.key) }} />
            {group.label} <span className="muted">· {group.items.length}</span>
          </span>
        </td>
        <td className="r num">{wonShort(total)}</td>
        <td colSpan={2} />
      </tr>
      {group.items.map((a) => {
        const diff = a.prev_value != null && a.value != null ? a.value - a.prev_value : null;
        // 부채는 줄어드는 것이 좋은 방향
        const good = diff == null || diff === 0 ? null : group.liability ? diff < 0 : diff > 0;
        return (
          <tr key={a.id} className="item" style={{ cursor: 'pointer' }} onClick={() => onOpen(a)}>
            <td>{a.name}</td>
            {people && (
              <td>
                <span className="owner-tag">{ownerName(people, a.owner_id)}</span>
              </td>
            )}
            <td className="text-2">{a.institution}</td>
            <td className="r num">{a.value == null ? <span className="muted">미기록</span> : won(a.value)}</td>
            <td className={`r num ${good == null ? 'muted' : good ? 'up' : 'down'}`}>{diff == null ? '-' : signed(diff)}</td>
            <td className="r num muted">{a.value_date ?? '-'}</td>
          </tr>
        );
      })}
    </>
  );
}

function AssetDialog({ asset, people, scope, run, onClose }) {
  const [form, setForm] = useState({
    name: asset?.name ?? '',
    category: asset?.category ?? 'cash',
    institution: asset?.institution ?? '',
    note: asset?.note ?? '',
    owner_id: String((asset ? asset.owner_id : defaultOwner(scope)) ?? ''),
    value: '',
    date: todayLocal(),
  });
  const [history, setHistory] = useState([]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: k === 'value' ? formatInput(e.target.value) : e.target.value }));

  const loadHistory = () => asset && api.valuations(asset.id).then(setHistory);
  useEffect(() => {
    loadHistory();
    const onKey = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (e) => {
    e.preventDefault();
    const body = { name: form.name, category: form.category, institution: form.institution, note: form.note, owner_id: form.owner_id };
    const ok = asset
      ? await run(() => api.updateAsset(asset.id, body), '저장했습니다')
      : await run(() => api.createAsset({ ...body, value: form.value ? parseAmount(form.value) : '', date: form.date }), '추가했습니다');
    if (ok) onClose();
  };

  const remove = async () => {
    if (!confirm(`'${asset.name}'과(와) 모든 평가 이력을 삭제할까요?`)) return;
    if (await run(() => api.deleteAsset(asset.id), '삭제했습니다')) onClose();
  };

  const removeValuation = async (v) => {
    if (!confirm(`${v.date} 기록(${won(v.value)})을 삭제할까요?`)) return;
    if (await run(() => api.deleteValuation(v.id), '기록을 삭제했습니다')) loadHistory();
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog" onSubmit={save} role="dialog" aria-modal="true" aria-label={asset ? '항목 수정' : '항목 추가'}>
        <h2>{asset ? '항목 수정' : '항목 추가'}</h2>
        <div className="form-grid">
          <label className="field full">
            <span>이름</span>
            <input className="input" value={form.name} onChange={set('name')} placeholder="예: 생활비 통장" autoFocus required />
          </label>
          <label className="field">
            <span>카테고리</span>
            <select className="input" value={form.category} onChange={set('category')}>
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>명의</span>
            <select className="input" value={form.owner_id} onChange={set('owner_id')}>
              <option value="">공동</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>기관 (선택)</span>
            <input className="input" value={form.institution} onChange={set('institution')} placeholder="은행·증권사 등" />
          </label>
          {!asset && (
            <>
              <label className="field">
                <span>현재 평가액 (원)</span>
                <input className="input amount" inputMode="numeric" value={form.value} onChange={set('value')} placeholder="0" />
              </label>
              <label className="field">
                <span>기준일</span>
                <input className="input" type="date" value={form.date} onChange={set('date')} />
              </label>
            </>
          )}
          <label className="field full">
            <span>메모 (선택)</span>
            <textarea className="input" rows={2} value={form.note} onChange={set('note')} />
          </label>
        </div>

        {asset && (
          <div className="history">
            <h3>평가 이력</h3>
            {history.length ? (
              <table className="table">
                <tbody>
                  {history.map((v) => (
                    <tr key={v.id}>
                      <td className="num text-2">{v.date}</td>
                      <td className="r num">{won(v.value)}</td>
                      <td className="r" style={{ width: 1 }}>
                        <button type="button" className="btn sm ghost danger" onClick={() => removeValuation(v)} aria-label={`${v.date} 기록 삭제`}>
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">기록이 없습니다. ‘평가액 기록’ 탭에서 입력하세요.</p>
            )}
          </div>
        )}

        <div className="dialog-actions">
          {asset && (
            <button type="button" className="btn danger" onClick={remove}>
              삭제
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button className="btn primary">{asset ? '저장' : '추가'}</button>
        </div>
      </form>
    </div>
  );
}
