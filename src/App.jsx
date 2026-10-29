import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { inScope, parseScope } from './people.js';
import Dashboard from './views/Dashboard.jsx';
import Assets from './views/Assets.jsx';
import Record from './views/Record.jsx';
import Plan from './views/Plan.jsx';

const TABS = [
  { key: 'dashboard', label: '대시보드' },
  { key: 'assets', label: '자산·부채' },
  { key: 'record', label: '평가액 기록' },
  { key: 'plan', label: '사람·목표·배분' },
];

const tabFromHash = () => {
  const h = location.hash.slice(1);
  return TABS.some((t) => t.key === h) ? h : 'dashboard';
};

const SCOPE_KEY = 'asset-manager.scope';
const loadScope = () => {
  try {
    return parseScope(localStorage.getItem(SCOPE_KEY) ?? 'all');
  } catch {
    return 'all';
  }
};

export default function App() {
  const [tab, setTab] = useState(tabFromHash);
  const [scope, setScopeState] = useState(loadScope);
  const [people, setPeople] = useState(null);
  const [assets, setAssets] = useState(null);
  const [summary, setSummary] = useState(null);
  const [toast, setToast] = useState(null);

  const setScope = useCallback((s) => {
    setScopeState(s);
    try {
      localStorage.setItem(SCOPE_KEY, String(s));
    } catch {
      /* 저장소를 못 써도 동작에는 지장 없음 */
    }
  }, []);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  const notify = useCallback((message, error = false) => {
    setToast({ message, error, at: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const reload = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([api.people(), api.assets()]);
      // 삭제된 사람을 보고 있었다면 가구 전체로 되돌린다
      const valid = typeof scope !== 'number' || p.some((x) => x.id === scope);
      const s = valid ? scope : 'all';
      if (!valid) setScope('all');
      setPeople(p);
      setAssets(a);
      setSummary(await api.summary(s));
    } catch (err) {
      notify(err.message, true);
    }
  }, [scope, setScope, notify]);

  useEffect(() => {
    reload();
  }, [reload]);

  // 저장 같은 동작을 감싸 성공/실패 메시지와 새로고침을 한 곳에서 처리
  const run = useCallback(
    async (fn, okMessage) => {
      try {
        const result = await fn();
        await reload();
        if (okMessage) notify(okMessage);
        return result ?? true;
      } catch (err) {
        notify(err.message, true);
        return false;
      }
    },
    [reload, notify],
  );

  const go = (key) => {
    location.hash = key;
  };

  const ready = people && assets && summary && summary.scope === scope;
  const hasJoint = assets?.some((a) => a.owner_id == null);
  const ctx = ready && {
    people,
    scope,
    setScope,
    allAssets: assets,
    assets: assets.filter((a) => inScope(a.owner_id, scope)),
    summary,
    run,
    go,
    notify,
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 32 32">
              <path d="M5 24l7-8 6 5 9-11" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          자산관리
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.key} className="tab" aria-current={tab === t.key ? 'page' : undefined} onClick={() => go(t.key)}>
              {t.label}
            </button>
          ))}
        </nav>
        {people && people.length > 0 && (
          <label className="scope">
            <span className="muted">보기</span>
            <select className="input" value={String(scope)} onChange={(e) => setScope(parseScope(e.target.value))} aria-label="누구의 자산을 볼지">
              <option value="all">가구 전체</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              {(hasJoint || scope === 'joint') && <option value="joint">공동 명의</option>}
            </select>
          </label>
        )}
      </header>

      {!ctx ? (
        <p className="muted">불러오는 중…</p>
      ) : tab === 'dashboard' ? (
        <Dashboard {...ctx} />
      ) : tab === 'assets' ? (
        <Assets {...ctx} />
      ) : tab === 'record' ? (
        <Record {...ctx} />
      ) : (
        <Plan {...ctx} />
      )}

      {toast && (
        <div key={toast.at} className={`toast${toast.error ? ' error' : ''}`} role="status">
          {toast.message}
        </div>
      )}
    </div>
  );
}
