/**
 * 매체별 배너 사이즈 — 크리스마스 빌더(11 Christmas/public/lib/channelSlots.js)를 옮겼다.
 * 데이터는 보드마다 하나 — Wide Product = lib/channelSlotData.js (Main Key Visual 01), Tall Product = lib/channelSlotDataTall.js (Main Key Visual 02).
 * Product Slot = lib/channelSlotDataSlot.js (Product Slot 01 · 02 — 컷을 통째로 얹지 않고 아이콘·칸·제품을 따로 그린다, drawProductSlot).
 *
 *   art   : [x, y, 한 변] — 빌더의 3000² 완성 컷을 그대로 이 자리에 놓는다.
 *           컷이 판을 다 못 덮는 곳은 컷의 가장자리 줄을 늘려 채운다 (Figma 의 KV edge extend 와 같은 방식 — 배경 컬러가 바뀌어도 맞는다)
 *   fades : 카피가 잘 보이게 까는 그라데이션 {m, poly, stops} — Figma 처럼 레이어 사각형 비율대로 늘어난 그라데이션을 그린다.
 *           (m 으로 그라데이션 공간에 들어가 poly 안을 (0,·)→(1,·) 로 칠한다 — 대각선 그라데이션이 판 끝에서 잘려 보이지 않게)
 *           색은 opts.fadeColor (지금 배경 컬러에서 구한 색), 알파만 Figma 값
 *   rows  : Eyebrow·Headline·Subcopy — Figma 자리에서 시작해 위 줄이 늘면 그만큼 아래로 민다
 *   cta   : stack 이면 마지막 보이는 카피 아래 Figma 와 같은 간격 (줄을 끄면 당겨 붙는다), 아니면 b 자리 고정 (가로 띠)
 *   disc  : Disclaimer — 왼쪽 x, 바닥에서 bottom 위, 폭 w. 흰 빛 + 검은 그림자 두 겹 (Figma 효과 그대로, Dark 글자 모드는 반대)
 * 줄 높이는 Figma 와 같이 글자 크기의 106%, CTA 는 100%.
 */
import { SLOT_DATA } from './channelSlotData.js';
import { SLOT_DATA_TALL } from './channelSlotDataTall.js';
import { SLOT_DATA_PSLOT } from './channelSlotDataSlot.js';
import { ICON_LIST, iconSvg, splitLabel } from './icons.js';
import { UPLOAD_ART } from './uploadArt.js';
export { SLOT_DATA };

/*
  아이콘 줄 — LG.com 히어로 두 사이즈(ST0001 1920×720 · 720×960)에만. 자리는 블프 빌더 lgcomSlots.ts 와 같다.
  Copy 패널의 Icons 를 켜면 그린다 (종류 Solid/Line · 색 · 1~3 개 · 아이콘·캡션). LG.com 다운로드에도 남는다
*/
const ICON_ROWS = {
  'lgcom-ST0001-pc-1920x720': { x: 240, y: 486, w: 424, h: 60 },
  'lgcom-ST0001-mo-720x960': { x: 34, y: 762, w: 510, h: 72 },
};
const iconCache = new Map();
let iconRedraw = () => {};
/** 아이콘 SVG 를 처음 읽으면 다시 그리게 — builder-app 이 renderSlots 를 넘긴다 */
export const onIconLoad = fn => { iconRedraw = fn; };
function iconImage(id, style, size) {
  const k = `${id}|${style}`;
  if (!iconCache.has(k)) {
    const img = new Image();
    img.onload = () => iconRedraw();
    // 투명도는 Figma 아이콘 그대로 (Solid 의 동그란 바탕 opacity 0.8)
    const svg = iconSvg(id, style, size).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    iconCache.set(k, img);
  }
  const img = iconCache.get(k);
  return img.complete && img.naturalWidth ? img : null;
}

/** 블프 IconRowInline 을 캔버스로 — 비율은 모두 줄 높이에서 나온다 */
function drawIconRow(ctx, box, ic) {
  const kind = ic.kind === 'line' ? 'line' : 'solid';
  const style = `${kind}-${ic.color}`;
  const isWhite = ic.color === 'white', isLine = kind === 'line';
  const h = box.h, fs = h * 0.2333, lh = fs * 1.14;
  const gap = isLine ? h * 0.195 : h * 0.293;
  const itemGap = isLine ? 0 : h * 0.1667;
  const ink = isWhite ? '#FFFFFF' : '#141414', halo = isWhite ? '#000000' : '#FFFFFF';
  const items = ic.ids[kind].slice(0, ic.count).map((id, i) => ({ id, item: ICON_LIST.find(x => x.id === id), custom: ic.labels[kind][i]?.trim() || null })).filter(x => x.item);
  ctx.save();
  ctx.font = `600 ${fs}px "LGEI Text", sans-serif`;
  ctx.letterSpacing = `${fs * 0.02}px`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  let x = box.x;
  const cy = box.y + h / 2;
  // Line 은 줄 전체에 흐린 테두리(drop-shadow), Solid 는 글자에만 — 블프와 같은 효과를 두 겹 그림자로
  const shadow = (blur) => { ctx.shadowColor = halo; ctx.shadowBlur = blur * Math.hypot(ctx.getTransform().a, ctx.getTransform().b); };
  items.forEach(({ id, item, custom }, i) => {
    const [l1, l2] = custom?.includes('\n') ? [custom.split('\n')[0], custom.split('\n').slice(1).join(' ')] : splitLabel(custom ?? item.label);
    const img = iconImage(id, style, 60);
    for (const blur of isLine ? [h * 0.061, h * 0.183] : [0]) {
      if (isLine) shadow(blur); else ctx.shadowBlur = 0;
      if (img) ctx.drawImage(img, x, box.y, h, h);
    }
    let tx = x + h + itemGap;
    const lines = l2 ? [l1, l2] : [l1];
    const top = cy - (lines.length * lh) / 2 + lh / 2;
    for (const blur of isLine ? [h * 0.061, h * 0.183] : [h * 0.366, h * 0.122]) {
      shadow(blur);
      ctx.fillStyle = ink;
      lines.forEach((t, n) => ctx.fillText(t, tx, top + n * lh));
    }
    ctx.shadowBlur = 0;
    const tw = Math.max(...lines.map(t => ctx.measureText(t).width));
    x = tx + tw + (isLine ? h * 0.1 : 0);
    if (isLine && i < items.length - 1) {
      x += gap;
      const dl = h * 0.6667, dt = Math.max(1, h * 0.0167);
      for (const blur of [h * 0.061, h * 0.183]) { shadow(blur); ctx.fillStyle = ink; ctx.fillRect(x, cy - dl / 2, dt, dl); }
      ctx.shadowBlur = 0;
      x += dt + gap;
    } else x += gap;
  });
  ctx.restore();
}

// 다크 톤 — 라이트 KV 의 베이지(#9c9185 등)로 칠한 바탕·그라데이션을 다크 KV 의 같은 자리 색으로 바꾼다
// (#182a24 — 라이트 KV 에서 그 색인 자리들을 다크 KV 에서 읽은 평균, 자리마다 차이 ±3 안쪽). 검정은 그대로
/** 매체 key → 사이즈 목록. 'all' 은 모든 매체를 이어 붙인다. 아직 없는 매체는 빈 배열. board = 'tall' (Tall Product 보드) · 'pslot' (Product Slot 01 · 02 보드) · 그 밖 Wide */
export function slotsForChannel(key, board) {
  const data = board === 'pslot' ? SLOT_DATA_PSLOT : board === 'tall' ? SLOT_DATA_TALL : SLOT_DATA;
  return key === 'all' ? Object.entries(data).flatMap(([k, list]) => ordered(k, list)) : ordered(key, data[key] || []);
}

/*
  LG.com 사이즈 순서 — 블프 빌더(lgcomSlots.ts LGCOM_SLOTS)와 같게 ST0001 여섯 장이 먼저. 데이터는 Figma 보드 순서라 여기서 다시 줄 세운다 (목록에 없는 사이즈는 맨 뒤)
*/
const LGCOM_ORDER = [
  'ST0001-pc-1920x720', 'ST0001-mo-720x960', 'ST0001-pc-1600x400', 'ST0001-mo-720x830', 'ST0001-pc-1600x320', 'ST0001-mo-720x750',
  'PR0001-pc-960x600', 'PR0001-pc-mo-630x420', 'PD0046-pc-464x300', 'ST0041-640x340', 'PR0001-928x600',
  'ST0044-mo-656x436', 'ST0044-pc-342x228',
  'CM0001-gnb-373x190', 'CM0001-gnb-620x316', 'CM0001-gnb-322x164', 'CM0001-lnb-pc-mo-580x180',
  'PD0041-pc-mo-464x550',
  'ST0004-pc-586x842', 'ST0004-pc-952x409', 'ST0004-pc-830x409', 'ST0004-pc-464x409', 'ST0004-pc-342x409', 'ST0004-mo-720x480', 'ST0004-mo-720x720',
  'ST0047-pc-1920x300', 'ST0047-mo-720x420',
  'PD0001-pc-mo-768x1200', 'PD0001-pc-800x800', 'PD0041-pc-mo-464x600', 'PR0015-pc-403x500', 'PR0015-mo-572x800',
].map(id => id.toLowerCase());
const lgcomRank = s => {
  const i = LGCOM_ORDER.indexOf(s.key.toLowerCase().replace(/^lgcom-/, '').replace(/\(.*?\)/g, '').trim());
  return i < 0 ? LGCOM_ORDER.length : i;
};
function ordered(key, list) {
  return key === 'lg-com' ? [...list].sort((a, b) => lgcomRank(a) - lgcomRank(b)) : list;
}

/**
 * 컷을 [ax, ay, as] 자리에 그리고, 판(W×H)에서 컷이 못 덮는 곳은 컷의 가장자리 줄을 늘려 채운다.
 * 가장자리는 줄인 사본(EDGE px)에서 읽는다 — 원본 1px 줄을 늘리면 결이 줄무늬로 보여서
 */
const EDGE = 300, IN = 0; // 맨 가장자리 줄을 그대로 — 컷과 채우기가 이어 붙는 곳에 색 단차가 없게
const edgeCache = new WeakMap();
function edgeSource(art, version) {
  const hit = edgeCache.get(art);
  if (hit && hit.version === version) return hit.c;
  const c = document.createElement('canvas');
  c.width = c.height = EDGE;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(art, 0, 0, EDGE, EDGE);
  edgeCache.set(art, { c, version });
  return c;
}
function drawArtFilled(ctx, art, [ax, ay, as], W, H, version) {
  const e = edgeSource(art, version), k = EDGE / as;
  // 채우기를 컷 안쪽으로 OVER px 겹쳐 그린다 — 컷 가장자리 픽셀이 반쯤만 칠해지며 검은 바탕이 1px 줄로 비치지 않게
  const OVER = 2;
  const L = Math.max(0, ax + OVER), T = Math.max(0, ay + OVER), R = Math.min(W, ax + as - OVER), B = Math.min(H, ay + as - OVER);
  // 판 안에 보이는 컷 범위 → 줄인 사본 좌표
  const sx = (L - ax) * k, sy = (T - ay) * k, sw = (R - L) * k, sh = (B - T) * k;
  const last = EDGE - IN - 1;
  const strip = (x, y, w, h, dx, dy, dw, dh) => { if (dw > 0 && dh > 0 && w > 0 && h > 0) ctx.drawImage(e, x, y, w, h, dx, dy, dw, dh); };
  ctx.imageSmoothingQuality = 'high';
  strip(IN, sy, 1, sh, 0, T, L, B - T);                 // 왼쪽
  strip(last, sy, 1, sh, R, T, W - R, B - T);           // 오른쪽
  strip(sx, IN, sw, 1, L, 0, R - L, T);                 // 위
  strip(sx, last, sw, 1, L, B, R - L, H - B);           // 아래
  strip(IN, IN, 1, 1, 0, 0, L, T);                      // 네 모서리
  strip(last, IN, 1, 1, R, 0, W - R, T);
  strip(IN, last, 1, 1, 0, B, L, H - B);
  strip(last, last, 1, 1, R, B, W - R, H - B);
  ctx.drawImage(art, ax, ay, as, as);
}

/**
 * 올린 이미지(UPLOAD IMAGE) 전용 — 블프 빌더 MirrorFill 과 같다 (배너 자동화 플러그인 "Color Expand").
 * 컷이 못 덮는 곳은 컷 가장자리 띠(한 변의 1% — 3000 이면 30px)를 바깥으로 뒤집어 늘려 채운다 (모서리는 두 방향으로 뒤집는다).
 * 뒤집어야 맞닿는 줄이 컷 가장자리 그 픽셀이라 이음매가 안 보인다. 1px 줄을 늘리는 drawArtFilled 는 사진에서 줄무늬로 번져서 쓰지 않는다
 */
const MIRROR_INSET = 0.01;
function drawArtMirrored(ctx, art, [ax, ay, as], W, H) {
  const nw = art.naturalWidth || art.width, nh = art.naturalHeight || art.height;
  const gapT = Math.max(0, ay), gapB = Math.max(0, H - (ay + as)), gapL = Math.max(0, ax), gapR = Math.max(0, W - (ax + as));
  const fx = Math.max(1, Math.round(nw * MIRROR_INSET)), fy = Math.max(1, Math.round(nh * MIRROR_INSET));
  const OV = 2; // 컷 밑으로 2px 겹쳐 그린다 — 반 픽셀 차이로 바탕색 줄이 비치지 않게
  const x1 = ax + as - OV, y1 = ay + as - OV;
  const draw = (sx, sy, sw, sh, dx, dy, dw, dh, flipX, flipY) => {
    ctx.save();
    ctx.translate(dx + (flipX ? dw : 0), dy + (flipY ? dh : 0));
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.drawImage(art, sx, sy, sw, sh, 0, 0, dw, dh);
    ctx.restore();
  };
  ctx.imageSmoothingQuality = 'high';
  if (gapT > 0) draw(0, 0, nw, fy, ax, 0, as, gapT + OV, false, true);
  if (gapB > 0) draw(0, nh - fy, nw, fy, ax, y1, as, gapB + OV, false, true);
  if (gapL > 0) draw(0, 0, fx, nh, 0, ay, gapL + OV, as, true, false);
  if (gapR > 0) draw(nw - fx, 0, fx, nh, x1, ay, gapR + OV, as, true, false);
  if (gapT > 0 && gapL > 0) draw(0, 0, fx, fy, 0, 0, gapL + OV, gapT + OV, true, true);
  if (gapT > 0 && gapR > 0) draw(nw - fx, 0, fx, fy, x1, 0, gapR + OV, gapT + OV, true, true);
  if (gapB > 0 && gapL > 0) draw(0, nh - fy, fx, fy, 0, y1, gapL + OV, gapB + OV, true, true);
  if (gapB > 0 && gapR > 0) draw(nw - fx, nh - fy, fx, fy, x1, y1, gapR + OV, gapB + OV, true, true);
  ctx.drawImage(art, ax, ay, as, as);
}

/**
 * Product Slot 판 — 배경 컬러를 깔고, 칸(흰 둥근 사각형, 불투명도 SLOT_ALPHA)과 칸 안 제품, 그 위에 아이콘을 Figma 자리대로 그린다 (칸은 아이콘 아래 레이어).
 *   slot.icon  : 아이콘 컴포넌트 인스턴스 [x, y, 한 변] — 컴포넌트 2000² 안에서 아이콘 그림(opts.icon)이 놓이는 자리가 PSLOT_ICON
 *   slot.boxes : [x, y, 한 변, 모서리] — 제품은 칸 짧은 변의 BOX_PAD 만큼 사방을 비우고 비율대로 가운데 (빌더 캔버스와 같다)
 *   opts.products[i] : i 번 칸 제품 { img, w, h } (없으면 빈 칸), opts.bg : 배경 컬러, opts.bgImg : 배경 이미지 (판에 cover 로 깐다)
 *   opts.box : { alpha, glass } — Box 탭 설정 (builder-app boxLook). 없으면 흰 80%. glass 면 drawGlassBox
 */
/**
 * 칸 한 개 — White 는 흰 사각형, Glass 는 세일즈 배너 빌더 글래스 박스와 같은 비율
 *   (흰 채움 + 흰 15% 테두리 폭 1.573/234.748 · 왼쪽 위 안쪽 하이라이트 흰 30%).
 *   두 재질 모두 그림자와 머리카락 테두리(검정 5%)를 둘러, 배경의 밝은 하이라이트(흰색에 가까운 자리)에 칸이 겹쳐도 윤곽이 남는다.
 *   그림자 — 두 재질 모두 둘레 3.5%(안 내림) + 아래 3.5%(6.29/234.748 내려서 같은 만큼 흐림) 두 겹.
 *            위·옆에도 윤곽이 생기고, 아래는 합쳐서 약 7% — 세일즈 배너 빌더 박스 그림자(아래 7%)보다 진해지지 않는다
 *   뒤 흐림은 뺐다 — 배경이 부드러운 그라데이션이라 흐려도 차이가 없다
 */
const BOX_EDGE = 'rgba(0,0,0,0.05)';
export function drawBox(ctx, x, y, s, r, look) {
  ctx.save();
  {
    // 그림자 — CSS box-shadow 처럼 칸 바깥에만 (칸 안은 비워 둔다)
    const sh = s * 6.29 / 234.748;
    const layers = [[0.035, 0], [0.035, sh]]; // [알파, 아래로 내림]
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - s, y - s, s * 3, s * 3);
    ctx.roundRect(x, y, s, s, r);
    ctx.clip('evenodd');
    ctx.shadowBlur = sh;
    ctx.shadowOffsetX = 10000;
    ctx.fillStyle = '#000';
    for (const [a, dy] of layers) {
      ctx.shadowColor = `rgba(0,0,0,${a})`;
      ctx.shadowOffsetY = dy;
      ctx.beginPath();
      ctx.roundRect(x - 10000, y, s, s, r);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.beginPath();
  ctx.roundRect(x, y, s, s, r);
  ctx.fillStyle = `rgba(255,255,255,${look.alpha})`;
  ctx.fill();
  // 머리카락 테두리 — 칸 가장자리에 걸쳐 (밝은 배경에서도 윤곽이 남게)
  ctx.strokeStyle = BOX_EDGE;
  ctx.lineWidth = Math.max(0.5, s * 0.9 / 234.748);
  ctx.stroke();
  if (look.glass) {
    ctx.beginPath();
    ctx.roundRect(x, y, s, s, r);
    ctx.clip();
    const sw = s * 1.573 / 234.748, d = s * 0.707 / 234.748 * 2;
    // 안쪽 하이라이트 — 왼쪽 위 가장자리 (inset 0.71px 0.71px, 흰 30%)
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = d * 2;
    ctx.beginPath();
    ctx.roundRect(x - d, y - d, s, s, r);
    ctx.stroke();
    // 테두리 — 안쪽으로 sw
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = sw * 2;
    ctx.beginPath();
    ctx.roundRect(x, y, s, s, r);
    ctx.stroke();
  }
  ctx.restore();
}

export const PSLOT_ICON = [330.2, 294.4, 1339.6, 1491.2]; // 컴포넌트 이미지 채우기(source/1102 정리/<in|up> icon-fixed.png · -eco.png, 2015×2243)의 Crop imageTransform 에서 구한 자리 = assets/trade-in-up/slot-icon/*.png
const BOX_PAD = 0.1;
const SLOT_ALPHA = 0.8; // 칸 불투명도 기본 (opts.box 가 없을 때) — builder-app BOX_STYLES White 와 같다. 배경 컬러가 비쳐 보인다
function drawProductSlot(ctx, slot, opts) {
  const { w: W, h: H } = slot;
  ctx.fillStyle = opts.bg || '#F0ECE4';
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingQuality = 'high';
  const bi = opts.bgImg;
  if (bi?.complete && bi.naturalWidth) {
    const k = Math.max(W / bi.naturalWidth, H / bi.naturalHeight);
    const w = bi.naturalWidth * k, h = bi.naturalHeight * k;
    ctx.drawImage(bi, (W - w) / 2, (H - h) / 2, w, h);
  }
  slot.boxes.forEach(([x, y, s, r], i) => {
    drawBox(ctx, x, y, s, r, opts.box || { alpha: SLOT_ALPHA });
    const p = opts.products?.[i];
    if (!p?.img) return;
    const inner = s * (1 - BOX_PAD * 2);
    const k = Math.min(inner / p.w, inner / p.h);
    const w = p.w * k, h = p.h * k;
    ctx.drawImage(p.img, x + (s - w) / 2, y + (s - h) / 2, w, h);
  });
  const icon = opts.icon;
  if (icon?.complete && icon.naturalWidth) {
    const [ix, iy, is] = slot.icon, k = is / 2000, [rx, ry, rw, rh] = PSLOT_ICON;
    ctx.drawImage(icon, ix + rx * k, iy + ry * k, rw * k, rh * k);
  }
}

const HEAD = '"LGEI Headline", sans-serif';
const TEXT = '"LGEI Text", sans-serif';
const PLACEHOLDER = {
  eyebrow: 'Lorem ipsum dolor sit amet, consectetur',
  headline: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit',
  subcopy: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do eiusmod',
  cta: 'Shop now',
  disclaimer: '*T&C’s apply',
  disclaimerMedia: '*T&C’s apply',
};
const LOGOS = { white: 'assets/trade-in-up/logo/lg-logo-white.svg', black: 'assets/trade-in-up/logo/lg-logo-black.svg', og: 'assets/trade-in-up/logo/lg-logo-og.svg', ogwhite: 'assets/trade-in-up/logo/lg-logo-ogwhite.svg' };

/** 글 상자 폭에 맞춰 줄을 나눈다 — 줄바꿈(Enter)은 그대로, 넘치면 단어 단위로. maxLines 를 넘으면 마지막 줄 끝을 … 로 */
function wrap(ctx, text, maxW, maxLines = Infinity) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxW) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  if (out.length <= maxLines) return out;
  const kept = out.slice(0, maxLines);
  let last = `${kept[maxLines - 1]} ${out[maxLines]}`;
  while (last && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1).trimEnd();
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

const logoCache = new Map();
function logoImage(id) {
  const src = LOGOS[id] || LOGOS.white;
  if (!logoCache.has(src)) {
    const img = new Image();
    img.src = src;
    logoCache.set(src, img);
  }
  return logoCache.get(src);
}
/** 로고 SVG 가 아직 안 읽혔으면 읽힌 뒤 한 번 더 그리게 */
export const logosReady = () => Promise.all(Object.keys(LOGOS).map(id => {
  const img = logoImage(id);
  return img.complete ? null : new Promise(r => { img.onload = img.onerror = r; });
}));

/**
 * 사이즈 하나를 ctx 에 slot.w × slot.h 좌표로 그린다 (미리보기는 바깥에서 ctx 를 줄여 둔다).
 * art: 3000² 완성 컷 캔버스(또는 이미지), cs: Copy 상태 (newCopyState 모양)
 */
/**
 * opts.imageOnly: LG.com 다운로드용 — 카피·CTA 없이 (이미지 업로드 가이드: 아이콘·디스클레이머만 남긴다)
 * opts.fadeColor: 그라데이션 색 (#rrggbb) — 없으면 Figma 색 그대로, opts.artVersion: 컷이 바뀌면 올린다 (가장자리 사본을 다시 만든다)
 * opts.icon · products · bg: Product Slot 판 (drawProductSlot)
 * opts.ground: 올린 이미지 — 판 바탕을 이 색(이미지 가장자리 평균)으로 깔고, 빈 곳은 거울 늘이기(drawArtMirrored), KV 용 그라데이션(fades)은 뺀다 (블프와 같다)
 * opts.darkInk: Dark 글자 모드 글자색 (없으면 #000) — 올린 이미지는 블프처럼 #111
 */
export function drawSlot(ctx, slot, art, cs, opts = {}) {
  if (slot.noCopy) slot = { ...slot, logo: null, rows: [], cta: null, disc: null };
  const { w: W, h: H } = slot;
  const show = cs.show;
  const val = k => (cs.copy[k] ?? '').trim() || PLACEHOLDER[k];
  // 글자 모드 — Light 는 흰 글자, Dark 는 검은 글자 (카피·동그란 CTA·Disclaimer)
  const ink = cs.textMode === 'dark' ? (opts.darkInk || '#000') : '#fff';
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = opts.ground || '#000000';
  ctx.fillRect(0, 0, W, H);
  if (slot.boxes) drawProductSlot(ctx, slot, opts);
  // 올린 이미지는 블프 빌더 판 자리로 (uploadArt.js — Safe Area 가 사이즈마다 거의 다 보인다)
  else if (art && slot.art && opts.ground) drawArtMirrored(ctx, art, UPLOAD_ART[slot.key] || slot.art, W, H);
  else if (art && slot.art) drawArtFilled(ctx, art, slot.art, W, H, opts.artVersion);
  // Figma 기본 그라데이션 색 — 기본 컷(Standard Light)일 때 opts.fadeColor 도 이 색이 된다
  const hex = opts.fadeColor || '#9c9185';
  const alpha = a => `${hex}${Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0')}`;
  for (const f of opts.ground ? [] : slot.fades || []) {
    ctx.save();
    ctx.transform(...f.m);
    const g = ctx.createLinearGradient(0, 0, 1, 0);
    f.stops.forEach(([pos, a]) => g.addColorStop(pos, alpha(a)));
    ctx.fillStyle = g;
    const p = f.poly;
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]); ctx.lineTo(p[2], p[3]); ctx.lineTo(p[4], p[5]); ctx.lineTo(p[6], p[7]);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 로고 — 고른 게 없으면 White (builder-app 이 판 종류의 기본을 넣어 준다 — Product Slot 은 OG)
  if (slot.logo && show.logo) {
    const [lx, ly, lw, lh] = slot.logo;
    const img = logoImage(cs.logoId || 'white');
    if (img.complete && img.naturalWidth) ctx.drawImage(img, lx, ly, lw, lh);
  }

  // 카피 — Figma 자리에서 시작해 위에서부터 쌓는다. 줄 수가 달라지면 아래 줄을 그만큼 민다
  // 높이가 낮은 띠 배너(120 이하)는 Figma 줄 수를 넘으면 말줄임
  const rows = opts.imageOnly ? [] : slot.rows || [];
  const FACE = { eyebrow: [TEXT, 400], headline: [HEAD, 600], subcopy: [TEXT, 400] };
  const on = { eyebrow: show.eyebrow, headline: true, subcopy: show.subcopy };
  ctx.fillStyle = ink;
  ctx.textBaseline = 'top';
  let shift = 0, lastEnd = null, lastFigmaEnd = null;
  rows.forEach(r => {
    if (!on[r.k]) return;
    const [face, weight] = FACE[r.k];
    ctx.font = `${weight} ${r.sz}px ${face}`;
    ctx.textAlign = r.al === 'C' ? 'center' : r.al === 'R' ? 'right' : 'left';
    const tx = r.al === 'C' ? r.x + r.w / 2 : r.al === 'R' ? r.x + r.w : r.x;
    const lh = r.sz * 1.06;
    // 낮은 띠 배너(120 이하)와 줄 수를 고정한 칸(clamp)은 Figma 줄 수를 넘으면 말줄임 — CTA 가 밀리지 않게
    const lines = wrap(ctx, val(r.k), r.w, H <= 120 || r.clamp ? r.lines : Infinity);
    // 앞 줄이 숨겨졌으면 그 자리만큼 당긴다 — 첫 줄은 Figma 의 첫 줄 자리에서
    const y = lastEnd == null ? rows[0].y : lastEnd + (r.y - lastFigmaEnd);
    lines.forEach((l, n) => ctx.fillText(l, tx, y + n * lh + (lh - r.sz) / 2));
    lastEnd = y + lines.length * lh;
    lastFigmaEnd = r.y + r.h;
    shift = lastEnd - lastFigmaEnd;
  });
  // 세로로 쌓는 CTA 는 마지막 보이는 줄 아래에 Figma 의 (마지막 줄 → CTA) 간격으로 — 줄을 꺼도 오토레이아웃처럼 당겨 붙는다
  const lastRow = rows[rows.length - 1];
  const ctaY = fy => (lastEnd != null && lastRow ? lastEnd + (fy - (lastRow.y + lastRow.h)) : fy + shift);

  // CTA — 세로 배치는 카피 아래 Figma 간격, 가로 띠는 고정 자리
  if (!opts.imageOnly && slot.cta && show.cta && slot.cta.round) {
    // LG.com 일부 사이즈 — 글자 없는 동그란 화살표 버튼 (흰 테두리)
    const [fx, fy, , fh] = slot.cta.b;
    const by = slot.cta.stack ? ctaY(fy) : fy;
    const r = fh / 2, cx = fx + r, cy = by + r;
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1, fh * 0.03);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r - ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.stroke();
    const a = fh * 0.16;
    ctx.beginPath();
    ctx.moveTo(cx - a, cy); ctx.lineTo(cx + a, cy);
    ctx.moveTo(cx + a * 0.35, cy - a * 0.65); ctx.lineTo(cx + a, cy); ctx.lineTo(cx + a * 0.35, cy + a * 0.65);
    ctx.stroke();
  } else if (!opts.imageOnly && slot.cta && show.cta) {
    const b = slot.cta;
    const [fx, fy, fw, fh] = b.b;
    ctx.font = `400 ${b.sz}px ${TEXT}`;
    const bw = ctx.measureText(val('cta')).width + b.pad * 2;
    const head = rows.find(r => r.k === 'headline') || rows[0];
    const centered = b.stack && head?.al === 'C';
    const bx = centered ? fx + fw / 2 - bw / 2 : fx;
    const by = b.stack ? ctaY(fy) : fy;
    ctx.fillStyle = '#FD312E';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, fh, b.rad);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(val('cta'), bx + bw / 2, by + fh / 2 + b.sz * 0.04);
  }

  // 아이콘 줄 — LG.com 히어로 두 사이즈만, Copy 패널에서 Icons 를 켰을 때
  if (ICON_ROWS[slot.key] && cs.icon && cs.icon.kind !== 'none') drawIconRow(ctx, ICON_ROWS[slot.key], cs.icon);

  // Disclaimer — 바닥 기준, 흰 빛과 검은 그림자 두 겹
  if (slot.disc && show.disclaimer) {
    const d = slot.disc;
    ctx.font = `400 ${d.sz}px ${TEXT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    // LG.com 사이즈는 Copy 패널의 LG.com 칸, 나머지 매체는 Media 칸
    const lines = wrap(ctx, val(slot.label === 'LG.com' ? 'disclaimer' : 'disclaimerMedia'), d.w);
    const lh = d.sz * 1.2;
    const draw = () => lines.forEach((l, n) => ctx.fillText(l, d.x, H - d.bottom - (lines.length - 1 - n) * lh));
    // 그림자 흐림은 변환을 안 따라가서 줄여 그리는 배율만큼 곱한다
    const k = Math.hypot(ctx.getTransform().a, ctx.getTransform().b);
    // 흰 글자는 흰 빛 + 검은 그림자, 검은 글자는 반대로
    const dark = cs.textMode === 'dark';
    ctx.fillStyle = ink;
    ctx.shadowColor = dark ? 'rgba(0,0,0,1)' : 'rgba(255,255,255,1)';
    ctx.shadowBlur = d.sz * 1.5 * k;
    draw();
    ctx.shadowColor = dark ? 'rgba(255,255,255,1)' : 'rgba(0,0,0,1)';
    ctx.shadowBlur = d.sz * 0.5 * k;
    draw();
  }
  ctx.restore();
}
