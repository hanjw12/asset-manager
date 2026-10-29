import test from 'node:test';
import assert from 'node:assert/strict';
import { ConflictError, createBackend } from './storage.js';

// GitHub Contents API 를 흉내 내는 가짜 fetch: 파일 하나와 sha 만 관리한다
function fakeGitHub({ isPrivate = true } = {}) {
  const state = { file: null, sha: 0, commits: [] };
  globalThis.fetch = async (url, { method = 'GET', headers, body } = {}) => {
    const reply = (status, data) => ({ ok: status < 300, status, json: async () => data });
    if (headers.Authorization !== 'Bearer t0ken') return reply(401, { message: 'Bad credentials' });
    const { pathname } = new URL(url);
    if (pathname === '/repos/me/data') return reply(200, { private: isPrivate, permissions: { push: true } });
    if (pathname !== '/repos/me/data/contents/assets.json') return reply(404, { message: 'Not Found' });
    if (method === 'GET') return state.file ? reply(200, { sha: String(state.sha), content: state.file }) : reply(404, { message: 'Not Found' });
    const b = JSON.parse(body);
    if (state.file && b.sha !== String(state.sha)) return reply(409, { message: 'does not match' });
    if (!state.file && b.sha) return reply(404, { message: 'Not Found' });
    state.file = b.content;
    state.sha += 1;
    state.commits.push(b.message);
    return reply(state.sha === 1 ? 201 : 200, { content: { sha: String(state.sha) } });
  };
  return state;
}

const conn = { kind: 'github', repo: 'me/data', path: 'assets.json', token: 't0ken' };

test('github: 빈 저장소에서 시작 → 저장 → 다시 불러오기 (한글 포함)', async () => {
  const gh = fakeGitHub();
  const a = createBackend(conn);
  await a.check();
  assert.equal(await a.load(), null);
  await a.save({ people: [{ id: 1, name: '본인' }] }, '사람 추가');
  await a.save({ people: [{ id: 1, name: '배우자' }] }, '이름 변경');
  assert.deepEqual(gh.commits, ['사람 추가', '이름 변경']);
  assert.deepEqual(await createBackend(conn).load(), { people: [{ id: 1, name: '배우자' }] });
});

test('github: 다른 기기가 먼저 저장했으면 ConflictError', async () => {
  fakeGitHub();
  const phone = createBackend(conn);
  const pc = createBackend(conn);
  await phone.load();
  await pc.load();
  await phone.save({ v: 1 }, 'phone');
  await pc.save({ v: 2 }, 'pc').then(
    () => assert.fail('덮어쓰면 안 된다'),
    (err) => assert.ok(err instanceof ConflictError),
  );
  await pc.load();
  await pc.save({ v: 2 }, 'pc'); // 다시 불러온 뒤에는 저장된다
});

test('github: 공개 저장소와 잘못된 토큰은 거부', async () => {
  fakeGitHub({ isPrivate: false });
  await assert.rejects(createBackend(conn).check(), /공개 저장소/);
  await assert.rejects(createBackend({ ...conn, token: 'nope' }).check(), /토큰이 올바르지 않거나/);
  await assert.rejects(createBackend({ ...conn, repo: 'me/other' }).check(), /저장소를 찾을 수 없습니다/);
});
