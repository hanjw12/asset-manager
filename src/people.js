// scope: 'all'(가구 전체) | 'joint'(공동 명의) | 사람 id(number)
export function ownerName(people, ownerId) {
  if (ownerId == null) return '공동';
  return people.find((p) => p.id === ownerId)?.name ?? '알 수 없음';
}

export function scopeName(people, scope) {
  if (scope === 'all') return '가구 전체';
  return ownerName(people, scope === 'joint' ? null : scope);
}

export function inScope(ownerId, scope) {
  if (scope === 'all') return true;
  if (scope === 'joint') return ownerId == null;
  return ownerId === scope;
}

export const parseScope = (v) => (v === 'all' || v === 'joint' ? v : Number(v) || 'all');

// 새 자산·목표를 만들 때 기본 명의: 사람 화면이면 그 사람, 아니면 공동
export const defaultOwner = (scope) => (typeof scope === 'number' ? scope : null);
