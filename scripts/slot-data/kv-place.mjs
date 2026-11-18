// Figma 보드 4장(Main Key Visual 01-01 · 01-02 · 02-01 · 02-02)의 KV 자리를 빌더 데이터에 넣는다.
//   node scripts/slot-data/kv-place.mjs
// figma-kv-*.txt (보드 이름 x y 한변, 보드마다 @01-01 처럼 나눔) 의 값으로 figma-main-key-visual(-02).json 의 art 만 바꿔
// figma-main-key-visual-<보드>.json 을 쓰고, merge.mjs 로 public/lib/channelSlotData*.js 를 다시 만든다.
// 카피 자리(logo · rows · cta · disc)는 figma-copy-*.txt (Templates & Assets › External Banner templates_Jun 을 쓴 보드에서 읽은 값)로 덮는다
//   — LG.com 은 보드별 figma-copy-lgcom-<보드>.txt. 그라데이션(fades)은 빌더가 원형 마스크로 그려서 쓰지 않는다.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const dir = 'scripts/slot-data';
const txt = fs.readFileSync(`${dir}/figma-kv-2026-11-18.txt`, 'utf8');
const place = {}; let cur = null;
for (const line of txt.split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  if (line.startsWith('@')) { cur = line.slice(1).trim(); place[cur] = {}; continue; }
  const m = line.match(/^(.*\S)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)$/);
  (place[cur][m[1]] ||= []).push([+m[2], +m[3], +m[4]]);
}
// 카피 자리
const copy = {};
const r1 = v => Math.round(v * 10) / 10;
for (const line of fs.readFileSync(`${dir}/figma-copy-2026-11-18.txt`, 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [key, logo, rows, cta, disc] = line.split('|');
  (copy[key] ||= []).push(logo === '-' ? null : { logo, rows, cta, disc });
}
// LG.com 은 보드마다 figma-copy-lgcom-<보드>.txt (LG.com Banner templates_Jun — 보드별로 조금씩 다름)
const lgcopy = {};
for (const b of ['01-01', '01-02', '02-01', '02-02']) {
  lgcopy[b] = {};
  for (const line of fs.readFileSync(`${dir}/figma-copy-lgcom-${b}.txt`, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [key, logo, rows, cta, disc] = line.split('|');
    lgcopy[b][key] = { logo, rows, cta, disc };
  }
}
const ROW = { E: 'eyebrow', H: 'headline', S: 'subcopy' };
function applyCopy(slot, c, old) {
  const num = t => t.split(',').map(Number);
  if (c.logo) slot.logo = num(c.logo); else delete slot.logo;
  slot.rows = c.rows ? c.rows.split(';').map(r => {
    const [k, x, y, w, h, sz, al] = r.split(',');
    const o = { k: ROW[k], x: +x, y: +y, w: +w, h: +h, sz: r1(+sz), al, lines: Math.max(1, Math.round(+h / (+sz * 1.06))) };
    const prev = old.rows?.find(q => q.k === o.k);
    if (prev?.clamp) o.clamp = prev.clamp;
    return o;
  }) : [];
  if (c.cta) { const [x, y, w, h, rad, pad, sz, stack] = num(c.cta); const round = slot.cta?.round; slot.cta = { b: [x, y, w, h], rad, pad, sz: r1(sz), stack }; if (round) slot.cta.round = round; } else if (!slot.key.startsWith('lgcom')) delete slot.cta; // LG.com 동그란 화살표 CTA(글자 없음)는 못 읽어서 그대로
  if (c.disc) { const [x, bottom, w, sz, al] = c.disc.split(','); slot.disc = { x: +x, bottom: +bottom, w: +w, sz: r1(+sz), al }; } else delete slot.disc;
}
function patchCopy(file, name, board) {
  const src = fs.readFileSync(file, 'utf8');
  const at = src.indexOf(`export const ${name} = `);
  const data = JSON.parse(src.slice(at + `export const ${name} = `.length).replace(/;\s*$/, ''));
  const seen = {}; let n = 0;
  for (const list of Object.values(data)) for (const slot of list) {
    const base = slot.key.replace(/-\d+$/, '').replace(/^(.*x\d+)-\d$/, '$1');
    const k = copy[slot.key] ? slot.key : base;
    const i = seen[k] = (seen[k] ?? -1) + 1;
    const c = lgcopy[board][slot.key] || copy[k]?.[i];
    if (!c || slot.noCopy) continue;
    applyCopy(slot, c, { ...slot });
    n++;
  }
  fs.writeFileSync(file, src.slice(0, at) + `export const ${name} = ` + JSON.stringify(data) + ';\n');
  return n;
}

const BOARDS = [
  ['01-01', 'figma-main-key-visual.json', 'public/lib/channelSlotData.js', 'SLOT_DATA'],
  ['01-02', 'figma-main-key-visual.json', 'public/lib/channelSlotDataH2.js', 'SLOT_DATA_H2'],
  ['02-01', 'figma-main-key-visual-02.json', 'public/lib/channelSlotDataTall.js', 'SLOT_DATA_TALL'],
  ['02-02', 'figma-main-key-visual-02.json', 'public/lib/channelSlotDataV2.js', 'SLOT_DATA_V2'],
];
for (const [b, base, out, name] of BOARDS) {
  const data = JSON.parse(fs.readFileSync(`${dir}/${base}`, 'utf8'));
  const used = {}, missing = [];
  for (const list of Object.values(data)) for (const row of list) {
    const k = row[0], i = used[k] = (used[k] ?? -1) + 1;
    const p = place[b][k]?.[i];
    if (p) row[1] = p; else missing.push(k);
  }
  const jf = `${dir}/figma-main-key-visual-${b}.json`;
  fs.writeFileSync(jf, JSON.stringify(data));
  console.log(b, 'missing:', missing.join(',') || 'none');
  console.log(execFileSync('node', [`${dir}/merge.mjs`, '../11 Christmas/public/lib/channelSlotData.js', jf, out, name, `Main Key Visual ${b}`]).toString().trim());
  console.log('copy layout from templates:', patchCopy(out, name, b));
}
