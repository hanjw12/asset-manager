async function request(method, url, body) {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
}

export const api = {
  assets: () => request('GET', '/assets'),
  createAsset: (a) => request('POST', '/assets', a),
  updateAsset: (id, a) => request('PUT', `/assets/${id}`, a),
  deleteAsset: (id) => request('DELETE', `/assets/${id}`),
  valuations: (id) => request('GET', `/assets/${id}/valuations`),
  deleteValuation: (id) => request('DELETE', `/valuations/${id}`),
  record: (date, entries) => request('POST', '/valuations', { date, entries }),
  summary: (scope = 'all') => request('GET', `/summary?owner=${encodeURIComponent(scope)}`),
  people: () => request('GET', '/people'),
  createPerson: (name) => request('POST', '/people', { name }),
  renamePerson: (id, name) => request('PUT', `/people/${id}`, { name }),
  deletePerson: (id) => request('DELETE', `/people/${id}`),
  targets: () => request('GET', '/targets'),
  saveTargets: (t) => request('PUT', '/targets', t),
  goals: () => request('GET', '/goals'),
  createGoal: (g) => request('POST', '/goals', g),
  updateGoal: (id, g) => request('PUT', `/goals/${id}`, g),
  deleteGoal: (id) => request('DELETE', `/goals/${id}`),
  importAll: (data) => request('POST', '/import', data),
  sample: () => request('POST', '/sample'),
};
