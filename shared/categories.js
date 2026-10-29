// 자산 카테고리. 순서가 곧 차트 색 슬롯 순서이므로 바꾸지 않는다.
export const CATEGORIES = [
  { key: 'cash', label: '현금·예금' },
  { key: 'invest', label: '주식·펀드' },
  { key: 'realestate', label: '부동산' },
  { key: 'pension', label: '연금·보험' },
  { key: 'crypto', label: '가상자산' },
  { key: 'other', label: '기타 자산' },
  { key: 'debt', label: '부채', liability: true },
];

export const ASSET_CATEGORIES = CATEGORIES.filter((c) => !c.liability);
export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

export function categoryOf(key) {
  return CATEGORIES.find((c) => c.key === key);
}

export function isLiability(key) {
  return !!categoryOf(key)?.liability;
}
