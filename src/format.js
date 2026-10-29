const nf = new Intl.NumberFormat('ko-KR');

export const won = (n) => `${nf.format(Math.round(n ?? 0))}원`;

// 1억 2,345만원 형태. 만원 미만은 버린다.
export function wonShort(n) {
  if (n == null) return '-';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(Math.round(n));
  if (abs < 10_000) return `${sign}${nf.format(abs)}원`;
  const eok = Math.floor(abs / 100_000_000);
  const man = Math.floor((abs % 100_000_000) / 10_000);
  const parts = [];
  if (eok) parts.push(`${nf.format(eok)}억`);
  if (man) parts.push(`${nf.format(man)}만`);
  return `${sign}${parts.join(' ')}원`;
}

// 축 눈금용: 1.2억, 3,500만
export function wonTick(n) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 100_000_000) return `${sign}${+(abs / 100_000_000).toFixed(abs >= 1_000_000_000 ? 0 : 1)}억`;
  if (abs >= 10_000) return `${sign}${nf.format(Math.round(abs / 10_000))}만`;
  return `${sign}${nf.format(abs)}`;
}

export const signed = (n, f = wonShort) => (n == null ? '-' : n > 0 ? `+${f(n)}` : f(n));

export const pct = (n, digits = 1) => `${(n ?? 0).toFixed(digits)}%`;

export function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const monthLabel = (date) => `${date.slice(2, 4)}.${date.slice(5, 7)}`;

// 입력칸의 "1,234,000" 같은 문자열을 숫자로
export const parseAmount = (s) => Number(String(s).replace(/[^\d.-]/g, ''));
export const formatInput = (s) => {
  const digits = String(s).replace(/[^\d]/g, '');
  return digits ? nf.format(Number(digits)) : '';
};
