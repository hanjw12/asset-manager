import { useState } from 'react';

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

// 처음 열었을 때(또는 연결을 해제한 뒤) 데이터를 어디에 저장할지 고르는 화면
export default function Connect({ initial, error, busy, onConnect }) {
  const [form, setForm] = useState({
    repo: initial?.repo ?? '',
    path: initial?.path ?? 'assets.json',
    token: '',
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    onConnect({
      kind: 'github',
      repo: form.repo.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/+$/, ''),
      path: form.path.trim() || 'assets.json',
      token: form.token.trim() || initial?.token || '',
    });
  };

  return (
    <div className="connect">
      <div className="card">
        <h2>데이터 저장 위치</h2>
        <p className="sub">
          자산 데이터는 내 GitHub <strong>비공개 저장소</strong>의 JSON 파일 하나에 저장됩니다. 휴대폰과 PC에서 같은 저장소를 연결하면
          같은 데이터를 봅니다. 저장할 때마다 커밋이 남아 변경 이력이 곧 백업이 됩니다.
        </p>

        <form className="stack" onSubmit={submit}>
          <label className="field">
            <span>저장소</span>
            <input className="input" value={form.repo} onChange={set('repo')} placeholder="내아이디/asset-data" required autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          </label>
          <label className="field">
            <span>토큰</span>
            <input
              className="input"
              type="password"
              value={form.token}
              onChange={set('token')}
              placeholder={initial?.token ? '저장된 토큰 사용' : 'github_pat_…'}
              required={!initial?.token}
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span>파일 경로</span>
            <input className="input" value={form.path} onChange={set('path')} autoCapitalize="off" spellCheck={false} />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="row">
            <button className="btn primary" disabled={busy}>
              {busy ? '연결하는 중…' : '연결'}
            </button>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => onConnect({ kind: 'local' })}>
              GitHub 없이 이 기기에만 저장
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>토큰 만들기</h2>
        <ol className="steps">
          <li>GitHub 에서 데이터용 비공개 저장소를 하나 만듭니다 (빈 저장소여도 됩니다).</li>
          <li>
            <a href={TOKEN_URL} target="_blank" rel="noreferrer">
              Fine-grained 토큰 만들기
            </a>
            에서 <b>Repository access</b> 를 <b>Only select repositories</b> 로 두고 그 저장소 하나만 고릅니다.
          </li>
          <li>
            <b>Permissions → Repository permissions → Contents</b> 를 <b>Read and write</b> 로 바꾸고 토큰을 만듭니다.
          </li>
          <li>토큰을 위 칸에 붙여 넣습니다. 기기마다 한 번씩 입력하면 됩니다.</li>
        </ol>
        <p className="sub">
          토큰은 이 기기 브라우저에만 저장되고 GitHub 외에는 보내지 않습니다. 기기를 잃어버리면 GitHub 설정에서 토큰을 삭제하세요.
        </p>
      </div>
    </div>
  );
}
