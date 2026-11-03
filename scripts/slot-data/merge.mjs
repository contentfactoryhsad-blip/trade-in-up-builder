// 매체 사이즈 데이터 만들기 — Figma 에서 뽑은 KV 자리·그라데이션(figma-main-key-visual.json)에
// 크리스마스 빌더의 카피 배치(같은 템플릿)를 사이즈로 맞춰 붙여 public/lib/channelSlotData.js 를 쓴다.
//   node scripts/slot-data/merge.mjs "../11 Christmas/public/lib/channelSlotData.js" scripts/slot-data/figma-main-key-visual.json public/lib/channelSlotData.js
//   node scripts/slot-data/merge.mjs "../11 Christmas/public/lib/channelSlotData.js" scripts/slot-data/figma-main-key-visual-02.json public/lib/channelSlotDataTall.js SLOT_DATA_TALL "Main Key Visual 02"
//   (Wide Product = "Trade In Up - Main Key Visual 01" 보드, Tall Product = "… 02" 보드 — 같은 매체·사이즈, KV 자리·그라데이션만 다르다)
// figma-main-key-visual.json 은 Figma "Trade In Up - Main Key Visual › Dark mode" 의 프레임마다 [이름, KV 인스턴스 [x, y, 한 변], fades] 를
// use_figma 로 읽은 값이다. fade = gradation · KV edge fade 레이어 하나 — [m, poly, stops]:
//   m    : 그라데이션 공간 → 판 px 변환 (canvas transform a,b,c,d,e,f = relativeTransform · 크기 · gradientTransform⁻¹)
//   poly : 그라데이션 공간에서 본 레이어 사각형 네 모서리 (x0,y0,…) — 이 안을 (0,·)→(1,·) 그라데이션으로 칠하면 Figma 와 같다
//   stops: [[위치, 알파(레이어 불투명도까지 곱한 값)]] — 색은 그릴 때 배경 컬러에 맞춰 정한다
// Figma 를 고치면 다시 뽑는다.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [,, xmasPath, tiPath, outPath, exportName = 'SLOT_DATA', board = 'Main Key Visual 01'] = process.argv;
const { SLOT_DATA } = await import(pathToFileURL(path.resolve(xmasPath)).href);
const ti = JSON.parse(fs.readFileSync(tiPath, 'utf8'));
// 카피 없는 판 (Figma 에서 카피 인스턴스를 숨긴 사이즈)
const NO_COPY = new Set(['lgcom-PR0001-PC-960x600','lgcom-PR0001-pc-mo-630x420','lgcom-PD0046-pc-464x300','lgcom-ST0041-640x340','lgcom-PR0001-928x600','googlesem-1200x1200','googlesem-1200x628','ecrm-1200x1200-2','ecrm-1200x520','pinapenezenka-330x135','taiwanaffiliate-1500x1000','telushealth-1000x1000','telushealth-1080x720']);
const out = {}; const report = [];
for (const [ch, list] of Object.entries(ti)) {
  const pool = [...(SLOT_DATA.main[ch] || [])];
  const seen = {};
  out[ch] = list.map(([name, art, fades]) => {
    const [, w, h] = name.match(/(\d+)x(\d+)/).map(Number);
    const s = { key: name, w, h, art, fades: fades.map(([m, poly, stops]) => ({ m, poly, stops })) };
    const i = pool.findIndex(x => x.w === s.w && x.h === s.h);
    const x = i >= 0 ? pool.splice(i, 1)[0] : null;
    if (!x) report.push(`no copy layout: ${ch}/${s.key}`);
    const dup = (seen[s.key] = (seen[s.key] || 0) + 1) > 1;
    const key = dup ? `${s.key}-${seen[s.key]}` : s.key;
    const noCopy = NO_COPY.has(key);
    const r = { key, label: x?.label || ch, w: s.w, h: s.h, art: s.art, fades: s.fades };
    if (!noCopy && x) { for (const k of ['logo', 'rows', 'cta', 'disc']) if (x[k]) r[k] = x[k]; }
    if (noCopy) r.noCopy = 1;
    return r;
  });
  if (pool.length) report.push(`unused xmas: ${ch} ${pool.map(p => p.key).join(',')}`);
}
const head = `/**
 * 매체별 배너 사이즈 데이터 — 손으로 고치지 말 것 (scripts 로 다시 뽑는다).
 *   art / fades : Figma "Trade-In-Up-Template" (qJV8Dzpg3FbQpkjNREu693) › Banner Template ›
 *                 "Trade In Up - ${board}" › Dark mode — KV 자리 [x, y, 한 변] 와 카피용 그라데이션
 *                 (fades: {m, poly, stops[[위치, 알파]]} — scripts/slot-data/merge.mjs 주석 참고. 색은 그릴 때 배경 컬러에 맞춰 정한다)
 *   logo / rows / cta / disc : 같은 템플릿에서 나온 크리스마스 빌더 데이터 (11 Christmas/public/lib/channelSlotData.js) 를 사이즈로 맞춰 가져왔다
 *   noCopy : 카피 없이 이미지만 있는 판
 * 빈 영역(KV 가 판을 다 못 덮는 곳)은 데이터에 없다 — 그릴 때 그 컷의 가장자리를 늘려 채운다.
 */
export const ${exportName} = `;
fs.writeFileSync(outPath, head + JSON.stringify(out) + ';\n');
console.log(report.join('\n') || 'all matched'); console.log(Object.entries(out).map(([k, v]) => `${k}:${v.length}`).join(' '));
