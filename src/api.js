import * as S from '../shared/store.js';
import { ConflictError, createBackend } from './storage.js';

// 화면이 쓰는 데이터 API. 문서 전체를 메모리에 들고 있고, 바꿀 때마다 복사본에 적용해 저장소에 통째로 저장한다.
// 저장이 실패하면 메모리의 문서는 그대로라서 화면과 저장소가 어긋나지 않는다.

let backend = null;
let doc = null;
let queue = Promise.resolve();

// 저장은 한 번에 하나씩 (GitHub 는 직전 저장의 sha 가 있어야 다음 저장이 된다)
function enqueue(task) {
  const p = queue.then(task, task);
  queue = p.catch(() => {});
  return p;
}

async function fetchDoc(b) {
  const raw = await b.load();
  return raw ? S.normalize(raw) : S.emptyData();
}

export async function connect(connection) {
  const b = createBackend(connection);
  if (b.check) await b.check();
  doc = await fetchDoc(b);
  backend = b;
  return b.label;
}

export function disconnect() {
  backend = null;
  doc = null;
}

// 다른 기기에서 바뀐 내용을 다시 불러온다
export const sync = () =>
  enqueue(async () => {
    if (backend) doc = await fetchDoc(backend);
  });

function mutate(message, fn) {
  return enqueue(async () => {
    const next = structuredClone(doc);
    const result = fn(next);
    try {
      await backend.save(next, message);
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err;
      doc = await fetchDoc(backend);
      throw new Error('다른 기기에서 먼저 바뀌었습니다. 최신 데이터를 불러왔으니 다시 시도하세요');
    }
    doc = next;
    return structuredClone(result);
  });
}

const read =
  (fn) =>
  async (...args) =>
    structuredClone(fn(doc, ...args));

export const api = {
  assets: read(S.listAssets),
  createAsset: (a) => mutate('자산 추가', (d) => S.createAsset(d, a)),
  updateAsset: (id, a) => mutate('자산 수정', (d) => S.updateAsset(d, id, a)),
  deleteAsset: (id) => mutate('자산 삭제', (d) => S.deleteAsset(d, id)),
  valuations: read(S.assetValuations),
  deleteValuation: (id) => mutate('평가 기록 삭제', (d) => S.deleteValuation(d, id)),
  record: (date, entries) => mutate(`평가액 기록 ${date}`, (d) => S.record(d, date, entries)),
  summary: read(S.summary),
  people: read(S.listPeople),
  createPerson: (name) => mutate('사람 추가', (d) => S.createPerson(d, name)),
  renamePerson: (id, name) => mutate('이름 변경', (d) => S.renamePerson(d, id, name)),
  deletePerson: (id) => mutate('사람 삭제', (d) => S.deletePerson(d, id)),
  saveTargets: (t) => mutate('목표 비중 변경', (d) => S.saveTargets(d, t)),
  createGoal: (g) => mutate('목표 추가', (d) => S.createGoal(d, g)),
  updateGoal: (id, g) => mutate('목표 수정', (d) => S.updateGoal(d, id, g)),
  deleteGoal: (id) => mutate('목표 삭제', (d) => S.deleteGoal(d, id)),
  exportAll: read(S.exportData),
  importAll: (data) => mutate('백업 복원', (d) => Object.assign(d, S.normalize(data))),
  sample: () => mutate('샘플 데이터', (d) => S.loadSample(d)),
};
