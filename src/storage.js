// 데이터 문서를 어디에 저장할지. 연결 정보(토큰 포함)는 이 기기 브라우저에만 남는다.

const CONNECTION_KEY = 'asset-manager.connection';
const LOCAL_DATA_KEY = 'asset-manager.data';

export function loadConnection() {
  try {
    const c = JSON.parse(localStorage.getItem(CONNECTION_KEY));
    return c?.kind === 'local' || (c?.kind === 'github' && c.repo && c.token) ? c : null;
  } catch {
    return null;
  }
}

export function saveConnection(c) {
  localStorage.setItem(CONNECTION_KEY, JSON.stringify(c));
}

export function clearConnection() {
  localStorage.removeItem(CONNECTION_KEY);
}

export class ConflictError extends Error {}

export function createBackend(c) {
  return c.kind === 'github' ? githubBackend(c) : localBackend();
}

function localBackend() {
  return {
    label: '이 기기 브라우저',
    async load() {
      const raw = localStorage.getItem(LOCAL_DATA_KEY);
      return raw ? JSON.parse(raw) : null;
    },
    async save(doc) {
      try {
        localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(doc));
      } catch {
        throw new Error('브라우저 저장 공간에 쓸 수 없습니다');
      }
    },
  };
}

// ---- GitHub: 비공개 저장소의 JSON 파일 하나를 Contents API 로 읽고 쓴다 ----

const GITHUB_API = 'https://api.github.com';

class GitHubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToUtf8(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
}

function explain(status, message = '') {
  if (status === 401) return '토큰이 올바르지 않거나 만료되었습니다';
  if (status === 403 && /rate limit/i.test(message)) return 'GitHub 요청 한도를 넘었습니다. 잠시 후 다시 시도하세요';
  if (status === 403) return '토큰에 이 저장소의 Contents 쓰기 권한이 없습니다';
  if (status === 404) return '저장소를 찾을 수 없습니다. 이름과 토큰의 저장소 권한을 확인하세요';
  return `GitHub 오류 (${status}) ${message}`.trim();
}

function githubBackend({ repo, path, token }) {
  const filePath = (path || 'assets.json').replace(/^\/+/, '');
  const fileUrl = `/repos/${repo}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}`;
  let sha = null;

  async function call(method, url, body) {
    let res;
    try {
      res = await fetch(GITHUB_API + url, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body && { 'Content-Type': 'application/json' }),
        },
        body: body && JSON.stringify(body),
      });
    } catch {
      throw new Error('GitHub 에 연결할 수 없습니다. 네트워크를 확인하세요');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new GitHubError(res.status, data.message);
    return data;
  }

  const wrap = async (fn) => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof GitHubError) throw new Error(explain(err.status, err.message));
      throw err;
    }
  };

  return {
    label: `GitHub ${repo} / ${filePath}`,

    // 연결 전에 저장소가 비공개이고 쓸 수 있는지 확인
    check: () =>
      wrap(async () => {
        const r = await call('GET', `/repos/${repo}`);
        if (!r.private) throw new Error('공개 저장소에는 자산 데이터를 저장할 수 없습니다. 비공개(Private) 저장소를 쓰세요');
        if (r.permissions && !r.permissions.push) throw new Error('토큰에 이 저장소의 쓰기 권한이 없습니다');
      }),

    load: () =>
      wrap(async () => {
        let file;
        try {
          // 브라우저 캐시에 남은 예전 응답을 받지 않도록 매번 다른 주소로 요청
          file = await call('GET', `${fileUrl}?t=${Date.now()}`);
        } catch (err) {
          if (err instanceof GitHubError && err.status === 404) {
            sha = null; // 아직 파일이 없음: 첫 저장 때 만든다
            return null;
          }
          throw err;
        }
        sha = file.sha;
        // 1MB 가 넘는 파일은 content 가 비어 오므로 blob 으로 받는다
        const b64 = file.content || (await call('GET', `/repos/${repo}/git/blobs/${file.sha}`)).content;
        try {
          return JSON.parse(base64ToUtf8(b64));
        } catch {
          throw new Error(`${filePath} 파일이 JSON 형식이 아닙니다`);
        }
      }),

    save: (doc, message) =>
      wrap(async () => {
        try {
          const r = await call('PUT', fileUrl, {
            message,
            content: utf8ToBase64(JSON.stringify(doc, null, 1) + '\n'),
            ...(sha && { sha }),
          });
          sha = r.content.sha;
        } catch (err) {
          // 다른 기기가 먼저 저장해 sha 가 바뀐 경우
          if (err instanceof GitHubError && (err.status === 409 || (err.status === 422 && /sha/i.test(err.message)))) {
            throw new ConflictError();
          }
          throw err;
        }
      }),
  };
}
