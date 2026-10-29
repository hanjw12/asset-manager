import { useState } from 'react';
import { categoryOf } from '../../shared/categories.js';
import { categoryColor } from '../colors.js';
import { pct, wonShort } from '../format.js';

// 카테고리별 현재 비중 막대 + 목표 비중 눈금. 수치는 항상 옆에 직접 표기한다.
export default function AllocationChart({ allocation }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(10, ...allocation.map((a) => Math.max(a.pct, a.target ?? 0)));
  const scale = (v) => `${(v / max) * 100}%`;
  const hasTargets = allocation.some((a) => a.target != null);

  return (
    <div role="table" aria-label="자산 배분">
      {allocation.map((a) => {
        const gap = a.target != null ? a.pct - a.target : null;
        return (
          <div
            key={a.category}
            className="alloc-row"
            role="row"
            onPointerEnter={() => setHover(a.category)}
            onPointerLeave={() => setHover(null)}
            style={{ opacity: hover && hover !== a.category ? 0.55 : 1 }}
          >
            <div className="alloc-name" role="cell">
              <span className="swatch" style={{ background: categoryColor(a.category) }} />
              {categoryOf(a.category).label}
            </div>
            <div className="alloc-track" role="cell">
              <div className="alloc-bar" style={{ width: scale(a.pct), background: categoryColor(a.category) }} />
              {a.target != null && <div className="alloc-target" style={{ left: `calc(${scale(a.target)} - 1px)` }} title={`목표 ${pct(a.target)}`} />}
            </div>
            <div className="alloc-val" role="cell">
              {hover === a.category ? (
                <span className="text-2">{wonShort(a.value)}</span>
              ) : (
                <>
                  <b>{pct(a.pct)}</b>
                  {gap != null && Math.abs(gap) >= 0.1 && (
                    <span className="muted">
                      {' '}
                      ({gap > 0 ? '+' : ''}
                      {gap.toFixed(1)})
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
      <div className="legend">
        <span>
          <i className="swatch" style={{ background: 'var(--muted)' }} />
          현재 비중
        </span>
        {hasTargets && (
          <span>
            <i style={{ width: 2, height: 12, background: 'var(--text)' }} />
            목표 비중 (괄호는 목표 대비 %p)
          </span>
        )}
      </div>
    </div>
  );
}
