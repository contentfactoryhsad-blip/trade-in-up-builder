/**
 * 키비 위치·크기 손보기 — 블프 페이지 빌더(DealModuleEditPanel NudgeField)의 Image Position 과 같은 기능.
 * 프리뷰에서 사이즈 하나를 누르면 Edit panel › Design 에 화살표(이동) · Scale 슬라이더 · Reset 이 뜬다.
 * 값은 판(01-01 · 01-02 · 02-01 · 02-02 · 슬롯형) × 사이즈마다 따로, 미리보기와 다운로드에 똑같이 들어간다
 * (그리기는 channelSlots.js adjustArt — KV 가운데 기준 확대, 슬롯형은 아이콘과 칸을 함께).
 *
 * 기능을 빼려면 KV_ADJUST = false 한 줄 — 사이즈 클릭·패널·값이 모두 꺼지고 Figma 자리 그대로 그린다.
 */
export const KV_ADJUST = true;

// 블프 빌더와 같은 범위 (dealHeroArt.ts HERO_SCALE_*)
const SCALE_MIN = 0.6, SCALE_MAX = 1.6, SCALE_STEP = 0.05;

/** sel = 고른 사이즈 key, vals = { '판|사이즈 key': { x, y, scale } } */
export const kvAdj = { sel: null, vals: {} };

const id = (board, key) => `${board}|${key}`;
const isDefault = a => !a || (!a.x && !a.y && (a.scale ?? 1) === 1);

/** drawSlot 에 넘길 값 — 기능을 껐거나 손대지 않았으면 null */
export function adjFor(board, key) {
  if (!KV_ADJUST) return null;
  const a = kvAdj.vals[id(board, key)];
  return isDefault(a) ? null : a;
}

/** 손본 사이즈가 하나라도 있나 (Reset all 버튼 — 늘 보이고, 없으면 흐리게) */
const anyAdjusted = board => Object.entries(kvAdj.vals).some(([k, a]) => k.startsWith(`${board}|`) && !isDefault(a));

/** 이동 한 번 = 배너 긴 변의 1% (1920 히어로에서 약 20px — 블프 빌더 한 칸과 비슷) */
const stepOf = slot => Math.max(1, Math.round(Math.max(slot.w, slot.h) / 100));

const arrow = (dx, dy, label, path) =>
  `<button type="button" class="kv-arrow" data-kv-step="${dx},${dy}" aria-label="${label}"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="${path}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;

/** Design 박스 맨 위에 들어가는 Image Position 칸. slot = 프리뷰에서 고른 사이즈 (없으면 안내만) */
export function renderAdjustField(board, slot, info = '') {
  if (!KV_ADJUST) return '';
  if (!slot) {
    return `
    <div class="cc-field kv-adj">
      <span class="cc-label kv-title">Image Position${info}</span>
      <p class="kv-empty">Click a size in the preview to move or scale its image.</p>
      <button type="button" class="kv-reset-all" data-kv-reset-all${anyAdjusted(board) ? '' : ' disabled'}>Reset all sizes</button>
    </div>`;
  }
  const a = kvAdj.vals[id(board, slot.key)] || { x: 0, y: 0, scale: 1 };
  const sc = a.scale ?? 1;
  return `
    <div class="cc-field kv-adj">
      <div class="cc-label-row">
        <span class="cc-label kv-title">Image Position${info}</span>
        <button type="button" class="kv-reset" data-kv-reset${isDefault(a) ? ' disabled' : ''}>Reset</button>
      </div>
      <div class="kv-body">
        <div class="kv-pad">
          <span></span>${arrow(0, -1, 'Move up', 'M3 10l5-5 5 5')}<span></span>
          ${arrow(-1, 0, 'Move left', 'M10 3L5 8l5 5')}<span></span>${arrow(1, 0, 'Move right', 'M6 3l5 5-5 5')}
          <span></span>${arrow(0, 1, 'Move down', 'M3 6l5 5 5-5')}<span></span>
        </div>
        <div class="kv-side">
          <p class="kv-size"><span>${slot.key}</span><button type="button" class="kv-close" data-kv-close aria-label="Deselect size">×</button></p>
          <div class="kv-scale">
            <div class="kv-scale-head"><span class="cc-small">Scale</span><span class="kv-scale-val">${sc.toFixed(2)}×</span></div>
            <input type="range" min="${SCALE_MIN}" max="${SCALE_MAX}" step="${SCALE_STEP}" value="${sc}" data-kv-scale />
          </div>
          <button type="button" class="kv-reset-all" data-kv-reset-all${anyAdjusted(board) ? '' : ' disabled'}>Reset all sizes</button>
        </div>
      </div>
    </div>`;
}

/**
 * Edit panel 이벤트. ctx() → { board, slot } (지금 판 · 고른 사이즈).
 * redraw({ panel, draw }) — panel: Edit panel 다시, draw: 'one'(고른 사이즈만) · 'all'(전부) · 'mark'(테두리만).
 * 움직일 때는 고른 사이즈 하나만 다시 그리고 패널은 숫자·Reset 만 바꾼다 (전부 다시 그리면 버벅인다).
 */
export function bindAdjust(root, ctx, redraw) {
  if (!KV_ADJUST) return;
  const cur = () => {
    const { board, slot } = ctx();
    if (!slot) return null;
    const k = id(board, slot.key);
    return { board, slot, k, a: (kvAdj.vals[k] ||= { x: 0, y: 0, scale: 1 }) };
  };
  // Reset · Reset all 은 늘 있다 — 켜고 끄기만 바꾸고 그림은 고른 사이즈 하나만
  const syncButtons = (c, box) => {
    const r = box?.querySelector('[data-kv-reset]'), all = box?.querySelector('[data-kv-reset-all]');
    if (r) r.disabled = isDefault(c.a);
    if (all) all.disabled = !anyAdjusted(c.board);
  };
  const after = (c, box) => {
    syncButtons(c, box);
    redraw({ panel: !box, draw: 'one' });
  };
  root.addEventListener('click', e => {
    if (e.target.closest('[data-kv-close]')) { kvAdj.sel = null; redraw({ panel: true, draw: 'mark' }); return; }
    if (e.target.closest('[data-kv-reset-all]')) {
      const { board } = ctx();
      for (const k of Object.keys(kvAdj.vals)) if (k.startsWith(`${board}|`)) delete kvAdj.vals[k];
      redraw({ panel: true, draw: 'all' });
      return;
    }
    const c = cur();
    if (!c) return;
    if (e.target.closest('[data-kv-reset]')) { delete kvAdj.vals[c.k]; redraw({ panel: true, draw: 'one' }); return; }
    const b = e.target.closest('[data-kv-step]');
    if (!b) return;
    const [dx, dy] = b.dataset.kvStep.split(',').map(Number);
    const s = stepOf(c.slot);
    c.a.x += dx * s;
    c.a.y += dy * s;
    after(c, b.closest('.kv-adj'));
  });
  root.addEventListener('input', e => {
    if (!e.target.matches('[data-kv-scale]')) return;
    const c = cur();
    if (!c) return;
    c.a.scale = Math.round(Number(e.target.value) * 100) / 100;
    const box = e.target.closest('.kv-adj');
    box.querySelector('.kv-scale-val').textContent = `${c.a.scale.toFixed(2)}×`;
    syncButtons(c, box);
    redraw({ panel: false, draw: 'one' });
  });
}
