// 화면을 둘러보기 위한 가상의 18개월치 가구 데이터. 실제 인물·계좌와 무관하다.
// owner: 1 = 본인, 2 = 배우자, null = 공동 명의
const PEOPLE = ['본인', '배우자'];

const ASSETS = [
  { name: '생활비 통장', category: 'cash', institution: '주거래은행', owner: null, start: 4_200_000, drift: 0, noise: 0.25 },
  { name: '비상금 정기예금', category: 'cash', institution: '저축은행', owner: 1, start: 20_000_000, drift: 0.003, noise: 0 },
  { name: '급여 통장', category: 'cash', institution: '인터넷은행', owner: 2, start: 3_100_000, drift: 0.01, noise: 0.3 },
  { name: '국내주식 계좌', category: 'invest', institution: '증권사 A', owner: 1, start: 32_000_000, drift: 0.008, noise: 0.05 },
  { name: '해외 ETF 계좌', category: 'invest', institution: '증권사 B', owner: 2, start: 45_000_000, drift: 0.012, noise: 0.04 },
  { name: '자가 아파트', category: 'realestate', institution: '', owner: null, start: 620_000_000, drift: 0.003, noise: 0.004 },
  { name: '연금저축펀드', category: 'pension', institution: '증권사 A', owner: 1, start: 18_000_000, drift: 0.015, noise: 0.02 },
  { name: '퇴직연금 IRP', category: 'pension', institution: '주거래은행', owner: 2, start: 27_000_000, drift: 0.012, noise: 0.01 },
  { name: '비트코인', category: 'crypto', institution: '거래소', owner: 1, start: 6_000_000, drift: 0.02, noise: 0.15 },
  { name: '주택담보대출', category: 'debt', institution: '주거래은행', owner: null, start: 310_000_000, drift: -0.004, noise: 0 },
  { name: '자동차 할부', category: 'debt', institution: '캐피탈', owner: 2, start: 18_000_000, drift: -0.045, noise: 0 },
];

export function buildSample(today, months = 18) {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

  const [ty, tm] = today.split('-').map(Number);
  const dates = [];
  for (let i = months - 1; i >= 1; i -= 1) {
    dates.push(new Date(Date.UTC(ty, tm - 1 - i + 1, 0)).toISOString().slice(0, 10));
  }
  dates.push(today);

  const people = PEOPLE.map((name, i) => ({ id: i + 1, name }));
  const assets = ASSETS.map((a, i) => ({
    id: i + 1,
    name: a.name,
    category: a.category,
    institution: a.institution,
    note: '',
    owner_id: a.owner,
  }));
  const valuations = [];
  ASSETS.forEach((a, i) => {
    let value = a.start;
    for (const d of dates) {
      valuations.push({ asset_id: i + 1, date: d, value: Math.max(0, Math.round(value / 1000) * 1000) });
      value *= 1 + a.drift + a.noise * rand();
    }
  });

  return {
    people,
    assets,
    valuations,
    allocation_targets: [
      { category: 'cash', pct: 5 },
      { category: 'invest', pct: 15 },
      { category: 'realestate', pct: 70 },
      { category: 'pension', pct: 8 },
      { category: 'crypto', pct: 2 },
    ],
    goals: [
      { name: '가구 순자산 5억', target_amount: 500_000_000, target_date: `${ty + 2}-12-31`, owner_id: null },
      { name: '가구 순자산 10억', target_amount: 1_000_000_000, target_date: `${ty + 8}-12-31`, owner_id: null },
      { name: '노후자금 1억', target_amount: 100_000_000, target_date: `${ty + 10}-12-31`, owner_id: 1 },
      { name: '투자 자산 1억', target_amount: 100_000_000, target_date: `${ty + 5}-12-31`, owner_id: 2 },
    ],
  };
}
