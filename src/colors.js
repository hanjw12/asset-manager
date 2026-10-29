import { ASSET_CATEGORIES } from '../shared/categories.js';

// 카테고리 순서 = 고정 색 슬롯 순서. 필터로 일부가 빠져도 색은 바뀌지 않는다.
export function categoryColor(key) {
  const i = ASSET_CATEGORIES.findIndex((c) => c.key === key);
  return i >= 0 ? `var(--series-${i + 1})` : 'var(--debt)';
}
