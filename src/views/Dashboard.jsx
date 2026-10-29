import { useState } from 'react';
import { api } from '../api.js';
import AllocationChart from '../charts/AllocationChart.jsx';
import NetWorthChart from '../charts/NetWorthChart.jsx';
import { pct, signed, wonShort } from '../format.js';
import { ownerName, scopeName } from '../people.js';

const RANGES = [
  { key: 6, label: '6개월' },
  { key: 12, label: '1년' },
  { key: 0, label: '전체' },
];

function Delta({ value, label }) {
  if (value == null) return <div className="stat-foot muted">{label} 비교 기록 없음</div>;
  const cls = value > 0 ? 'up' : value < 0 ? 'down' : 'muted';
  return (
    <div className="stat-foot">
      <span className="muted">{label} </span>
      <span className={cls}>
        {value > 0 ? '▲' : value < 0 ? '▼' : ''} {signed(value)}
      </span>
    </div>
  );
}

function PeopleCard({ byPerson, setScope }) {
  const max = Math.max(1, ...byPerson.map((p) => p.net));
  return (
    <section className="card">
      <h2>사람별 순자산</h2>
      <p className="sub">이름을 누르면 그 사람의 자산만 봅니다. 공동 명의는 따로 집계합니다.</p>
      {byPerson.map((p) => (
        <button key={p.owner_id ?? 'joint'} className="person-row" onClick={() => setScope(p.owner_id ?? 'joint')}>
          <b>{p.name}</b>
          <div className="alloc-track">
            <div className="alloc-bar" style={{ width: `${(Math.max(0, p.net) / max) * 100}%`, background: 'var(--series-1)' }} />
          </div>
          <div className="alloc-val">
            <b>{wonShort(p.net)}</b>
            <div className="muted" style={{ fontSize: 11.5 }}>
              자산 {wonShort(p.assets)} · 부채 {wonShort(p.debts)}
            </div>
          </div>
        </button>
      ))}
    </section>
  );
}

export default function Dashboard({ assets, allAssets, people, scope, setScope, summary, run, go }) {
  const [range, setRange] = useState(12);

  if (allAssets.length && !assets.length) {
    return (
      <div className="card empty">
        <h2>{scopeName(people, scope)} 명의의 자산이 없습니다</h2>
        <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
          <button className="btn primary" onClick={() => go('assets')}>
            자산 등록하기
          </button>
          <button className="btn" onClick={() => setScope('all')}>
            가구 전체 보기
          </button>
        </div>
      </div>
    );
  }

  if (!assets.length) {
    return (
      <div className="card empty">
        <h2>아직 등록된 자산이 없습니다</h2>
        <p className="text-2">통장·증권계좌·부동산·연금·대출을 등록하고 평가액을 기록하면 순자산 추이를 볼 수 있어요.</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
          <button className="btn primary" onClick={() => go('assets')}>
            자산 등록하기
          </button>
          <button className="btn" onClick={() => run(api.sample, '샘플 데이터를 넣었습니다')}>
            샘플 데이터로 둘러보기
          </button>
        </div>
      </div>
    );
  }

  const { totals, change, series, allocation, goals, lastRecorded, byPerson } = summary;
  const shown = range ? series.slice(-range) : series;
  const debtRatio = totals.assets > 0 ? (totals.debts / totals.assets) * 100 : 0;

  return (
    <div className="stack">
      <section className="hero">
        <div className="card">
          <div className="stat-label">{scopeName(people, scope)} 순자산</div>
          <div className="stat-value big">{wonShort(totals.net)}</div>
          <Delta value={change.month} label="전월 대비" />
        </div>
        <div className="card">
          <div className="stat-label">총자산</div>
          <div className="stat-value">{wonShort(totals.assets)}</div>
          <div className="stat-foot muted">{assets.filter((a) => a.category !== 'debt').length}개 항목</div>
        </div>
        <div className="card">
          <div className="stat-label">총부채</div>
          <div className="stat-value">{wonShort(totals.debts)}</div>
          <div className="stat-foot muted">자산 대비 {pct(debtRatio)}</div>
        </div>
        <div className="card">
          <div className="stat-label">1년 변화</div>
          <div className="stat-value">{change.year == null ? '-' : signed(change.year)}</div>
          <div className="stat-foot muted">마지막 기록 {lastRecorded ?? '-'}</div>
        </div>
      </section>

      {scope === 'all' && byPerson.length > 1 && <PeopleCard byPerson={byPerson} setScope={setScope} />}

      <section className="card">
        <div className="card-head">
          <div>
            <h2>순자산 추이</h2>
            <p className="sub">월말 기준. 기록이 없는 달은 직전 평가액을 유지한 것으로 계산합니다.</p>
          </div>
          <div className="range" role="group" aria-label="기간">
            {RANGES.map((r) => (
              <button key={r.key} aria-pressed={range === r.key} onClick={() => setRange(r.key)}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
        {shown.length ? <NetWorthChart series={shown} /> : <p className="muted">평가액 기록이 없습니다.</p>}
      </section>

      <div className="grid grid-2">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>자산 배분</h2>
              <p className="sub">총자산 {wonShort(totals.assets)} 기준 (부채 제외)</p>
            </div>
            <button className="btn sm ghost" onClick={() => go('plan')}>
              목표 비중 설정
            </button>
          </div>
          <AllocationChart allocation={allocation} />
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2>목표</h2>
              <p className="sub">개인 목표는 그 사람, 가구 목표는 가구 전체 순자산 기준</p>
            </div>
            <button className="btn sm ghost" onClick={() => go('plan')}>
              목표 관리
            </button>
          </div>
          {goals.length ? (
            goals.map((g) => (
              <div key={g.id} className="goal">
                <div className="row">
                  <b>{g.name}</b>
                  <span className="owner-tag">{g.owner_id == null ? '가구' : ownerName(people, g.owner_id)}</span>
                  <span className="spacer" />
                  <span className="num">{pct(Math.min(100, g.progress * 100))}</span>
                </div>
                <div className="goal-bar">
                  <div style={{ width: `${Math.min(100, g.progress * 100)}%` }} />
                </div>
                <div className="row muted" style={{ fontSize: 12.5 }}>
                  <span>목표 {wonShort(g.target_amount)}</span>
                  <span className="spacer" />
                  <span>
                    {g.remaining > 0 ? `${wonShort(g.remaining)} 남음` : '달성!'}
                    {g.target_date && ` · ${g.target_date}까지`}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">설정된 목표가 없습니다.</p>
          )}
        </section>
      </div>
    </div>
  );
}
