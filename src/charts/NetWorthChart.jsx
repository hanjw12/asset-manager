import { useLayoutEffect, useRef, useState } from 'react';
import { monthLabel, wonShort, wonTick } from '../format.js';

const H = 240;
const M = { t: 12, r: 16, b: 26, l: 52 };

function niceStep(range, count) {
  const raw = range / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
}

function ticks(min, max, count = 4) {
  if (min === max) max = min + 1;
  const step = niceStep(max - min, count);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(v);
  return out;
}

export default function NetWorthChart({ series }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = series.length;
  const iw = width - M.l - M.r;
  const ih = H - M.t - M.b;
  const nets = series.map((p) => p.net);
  const yt = ticks(Math.min(0, ...nets), Math.max(0, ...nets));
  const y0 = yt[0];
  const y1 = yt[yt.length - 1];
  const x = (i) => M.l + (n === 1 ? iw / 2 : (iw * i) / (n - 1));
  const y = (v) => M.t + ih - ((v - y0) / (y1 - y0)) * ih;

  const line = series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.net).toFixed(1)}`).join('');
  const area = n > 1 ? `${line}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z` : '';
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 52))));

  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    const i = n === 1 ? 0 : Math.round(((px - M.l) / iw) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };

  const hp = hover != null ? series[hover] : null;
  const tipLeft = hp ? Math.min(Math.max(x(hover) + 12, 0), width - 190) : 0;
  const tipFlip = hp && x(hover) + 200 > width;

  return (
    <div className="chart-wrap" ref={ref}>
      <svg width={width} height={H} role="img" aria-label="월별 순자산 추이">
        {yt.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={width - M.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth="1" />
            <text x={M.l - 8} y={y(v)} dy="0.32em" textAnchor="end">
              {wonTick(v)}
            </text>
          </g>
        ))}
        {series.map((p, i) =>
          i % labelEvery === (n - 1) % labelEvery ? (
            <text key={p.date} x={x(i)} y={H - 6} textAnchor="middle">
              {monthLabel(p.date)}
            </text>
          ) : null,
        )}
        {area && <path d={area} fill="var(--area)" />}
        <path d={line} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {n > 0 && (
          <circle cx={x(n - 1)} cy={y(series[n - 1].net)} r="4" fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />
        )}
        {hp && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={M.t + ih} stroke="var(--axis)" strokeWidth="1" />
            <circle cx={x(hover)} cy={y(hp.net)} r="5" fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />
          </g>
        )}
        <rect
          x={0}
          y={0}
          width={width}
          height={H}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hp && (
        <div className="tooltip" style={{ top: 8, left: tipFlip ? x(hover) - 202 : tipLeft }}>
          <div className="t-title">{hp.date}</div>
          <div className="t-row">
            <span>순자산</span>
            <b>{wonShort(hp.net)}</b>
          </div>
          <div className="t-row text-2">
            <span>총자산</span>
            <b>{wonShort(hp.assets)}</b>
          </div>
          <div className="t-row text-2">
            <span>부채</span>
            <b>{wonShort(hp.debts)}</b>
          </div>
        </div>
      )}
    </div>
  );
}
