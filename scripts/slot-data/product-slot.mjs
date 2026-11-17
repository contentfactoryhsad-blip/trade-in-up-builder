// Product Slot 매체 사이즈 데이터 — Figma 에서 뽑은 아이콘 자리·칸(figma-product-slot.json)에
// Main Key Visual 01 데이터(public/lib/channelSlotData.js)의 카피 배치(같은 템플릿)를 키로 맞춰 붙여 public/lib/channelSlotDataSlot.js 를 쓴다.
//   node scripts/slot-data/product-slot.mjs
// figma-product-slot.json 은 { 매체 key: { 프레임 이름: … } } — Figma "Trade In Up - Product Slot 01"(세로형 = v) · "… 02"(가로형 = h) › Dark mode › <매체> 섹션의
// 프레임마다 아이콘(KV 인스턴스)이 보이는 쪽 하나만 [배치, 아이콘 인스턴스 [x, y, 한 변], 칸 [[x, y, 한 변, 모서리], …]] 로 use_figma 로 읽은 값이다.
//   좌표는 판 기준 absoluteBoundingBox 로 읽는다 — slot 묶음을 뒤집어(flip) 둔 판은 x · y 가 반대쪽 모서리라 그대로 쓰면 칸이 한 변만큼 밀린다
//   한 사이즈는 01 · 02 중 한 보드에만 쓰인다 (다른 쪽은 아이콘·칸을 숨겨 둔다). 칸 번호는 Figma 순서 = 빌더 박스 번호
//   Product Slot 보드에는 카피용 그라데이션이 없다 (fades 없음)
// Figma 를 고치면 다시 뽑는다.
import fs from 'node:fs';
import { SLOT_DATA } from '../../public/lib/channelSlotData.js';
const all = JSON.parse(fs.readFileSync(new URL('./figma-product-slot.json', import.meta.url), 'utf8'));
// 카피 자리: Product Slot 보드는 _Product Slot 템플릿을 쓴다 → figma-pslot-copy-*.txt 로 덮는다 (줄을 못 읽은 판·LG.com 은 기존 값)
const r1 = v => Math.round(v * 10) / 10;
const ROW = { E: 'eyebrow', H: 'headline', S: 'subcopy' };
const pcopy = {};
for (const line of fs.readFileSync(new URL('./figma-pslot-copy-2026-11-18.txt', import.meta.url), 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  let [name, logo, rows, cta, disc] = line.split('|');
  const lay = name.endsWith('@h') ? 'h' : 'v'; name = name.replace(/@h$/, '');
  if (!rows || name.startsWith('lgcom')) continue;
  pcopy[`${name}|${lay}`] = { logo, rows, cta, disc };
}
function applyCopy(slot, c) {
  const num = t => t.split(',').map(Number);
  if (c.logo) slot.logo = num(c.logo); else delete slot.logo;
  const old = slot.rows || [];
  slot.rows = c.rows.split(';').map(r => {
    const [k, x, y, w, h, sz, al] = r.split(',');
    const o = { k: ROW[k], x: +x, y: +y, w: +w, h: +h, sz: r1(+sz), al, lines: Math.max(1, Math.round(+h / (+sz * 1.06))) };
    const prev = old.find(q => q.k === o.k);
    if (prev?.clamp) o.clamp = prev.clamp;
    return o;
  });
  if (c.cta) { const [x, y, w, h, rad, pad, sz, stack] = num(c.cta); slot.cta = { b: [x, y, w, h], rad, pad, sz: r1(sz), stack }; } else delete slot.cta;
  if (c.disc) { const [x, bottom, w, sz, al] = c.disc.split(','); slot.disc = { x: +x, bottom: +bottom, w: +w, sz: r1(+sz), al }; } else delete slot.disc;
}
// 기본 문구: 보드마다 Figma 템플릿에 들어간 문구 그대로 (헤드카피 길이가 사이즈마다 다름)
const ptext = {};
for (const line of fs.readFileSync(new URL('./figma-pslot-text-2026-11-18.txt', import.meta.url), 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  let [name, eyebrow, headline, subcopy] = line.split('|');
  const lay = name.endsWith('@h') ? 'h' : 'v'; name = name.replace(/@h$/, '');
  const ph = {}; for (const [k, v] of Object.entries({ eyebrow, headline, subcopy })) if (v) ph[k] = v.replace(/\\n/g, '\n');
  ptext[`${name}|${lay}`] = ph;
}
let copied = 0, texted = 0;
const out = {}; const report = [];
for (const [ch, ps] of Object.entries(all)) {
  if (!SLOT_DATA[ch]) { report.push(`unknown channel: ${ch}`); continue; }
  const extra = Object.keys(ps).filter(k => !SLOT_DATA[ch].some(s => s.key === k));
  if (extra.length) report.push(`not in channelSlotData: ${ch} ${extra.join(',')}`);
  out[ch] = SLOT_DATA[ch].filter(s => ps[s.key] ? true : (report.push(`no product slot board: ${s.key}`), false)).map(s => {
    const [layout, icon, boxes] = ps[s.key];
    const { art, fades, ...copy } = s;
    const c = pcopy[`${s.key.replace(/-2$/, '')}|${layout}`];
    if (c && !copy.noCopy) { applyCopy(copy, c); copied++; }
    const ph = ptext[`${s.key.replace(/-2$/, '')}|${layout}`];
    if (ph && !copy.noCopy) { copy.ph = ph; texted++; }
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
console.log(report.join('\n') || 'all matched'); console.log('copy layout from _Product Slot templates:', copied, '· placeholder text:', texted); console.log(Object.entries(out).map(([k, v]) => `${k}:${v.length} (v ${v.filter(s => s.layout === 'v').length} · h ${v.filter(s => s.layout === 'h').length})`).join(' '));
