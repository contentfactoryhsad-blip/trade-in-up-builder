// Product Slot 매체 사이즈 데이터 — Figma 에서 뽑은 아이콘 자리·칸(figma-product-slot.json)에
// Main Key Visual 01 데이터(public/lib/channelSlotData.js)의 카피 배치(같은 템플릿)를 키로 맞춰 붙여 public/lib/channelSlotDataSlot.js 를 쓴다.
//   node scripts/slot-data/product-slot.mjs
// figma-product-slot.json 은 { 매체 key: { 프레임 이름: … } } — Figma "Trade In Up - Product Slot 01"(세로형 = v) · "… 02"(가로형 = h) › Dark mode › <매체> 섹션의
// 프레임마다 아이콘(KV 인스턴스)이 보이는 쪽 하나만 [배치, 아이콘 인스턴스 [x, y, 한 변], 칸 [[x, y, 한 변, 모서리], …]] 로 use_figma 로 읽은 값이다.
//   한 사이즈는 01 · 02 중 한 보드에만 쓰인다 (다른 쪽은 아이콘·칸을 숨겨 둔다). 칸 번호는 Figma 순서 = 빌더 박스 번호
//   Product Slot 보드에는 카피용 그라데이션이 없다 (fades 없음)
// Figma 를 고치면 다시 뽑는다.
import fs from 'node:fs';
import { SLOT_DATA } from '../../public/lib/channelSlotData.js';
const all = JSON.parse(fs.readFileSync(new URL('./figma-product-slot.json', import.meta.url), 'utf8'));
const out = {}; const report = [];
for (const [ch, ps] of Object.entries(all)) {
  if (!SLOT_DATA[ch]) { report.push(`unknown channel: ${ch}`); continue; }
  const extra = Object.keys(ps).filter(k => !SLOT_DATA[ch].some(s => s.key === k));
  if (extra.length) report.push(`not in channelSlotData: ${ch} ${extra.join(',')}`);
  out[ch] = SLOT_DATA[ch].filter(s => ps[s.key] ? true : (report.push(`no product slot board: ${s.key}`), false)).map(s => {
    const [layout, icon, boxes] = ps[s.key];
    const { art, fades, ...copy } = s;
    return { ...copy, layout, icon, boxes };
  });
}
const head = `/**
 * Product Slot 매체별 배너 사이즈 데이터 — 손으로 고치지 말 것 (scripts/slot-data/product-slot.mjs 로 다시 뽑는다).
 *   layout / icon / boxes : Figma "Trade-In-Up-Template" (qJV8Dzpg3FbQpkjNREu693) › Banner Template ›
 *                 "Trade In Up - Product Slot 01"(세로형 v) · "… 02"(가로형 h) › Dark mode
 *                 icon = 아이콘 컴포넌트 인스턴스 [x, y, 한 변] (컴포넌트 2000²), boxes = 제품 칸 [x, y, 한 변, 모서리]
 *   key · label · logo / rows / cta / disc / noCopy : lib/channelSlotData.js (Main Key Visual 01 — 같은 템플릿) 그대로
 */
export const SLOT_DATA_PSLOT = `;
fs.writeFileSync(new URL('../../public/lib/channelSlotDataSlot.js', import.meta.url), head + JSON.stringify(out) + ';\n');
console.log(report.join('\n') || 'all matched'); console.log(Object.entries(out).map(([k, v]) => `${k}:${v.length} (v ${v.filter(s => s.layout === 'v').length} · h ${v.filter(s => s.layout === 'h').length})`).join(' '));
