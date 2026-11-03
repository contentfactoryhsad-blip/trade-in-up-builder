// 자유 비율 크롭 모달. 프레임을 끌어 옮기고 모서리·변 핸들로 크기를 바꾼다.
// 원래 빌더는 박스 비율이 고정이라 react-easy-crop 을 썼지만, 여기서는 제품이
// 영역 안에 contain 으로 맞춰지므로 비율을 묶을 이유가 없다.
//
//   const out = await openCropModal({ imageSrc, initialRect });
//   → { dataUrl, rect } (rect 는 원본 픽셀 기준, 재편집 때 복원용), 취소하면 null

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const MIN_SIZE = 8; // 원본 픽셀
const VIEW_W = 620, VIEW_H = 420;

function loadImg(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

export function openCropModal({ imageSrc, initialRect }) {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'pi-backdrop dark';
    root.innerHTML = `
      <div class="pi-modal pi-crop" role="dialog" aria-modal="true">
        <div class="pi-head">
          <div><strong>Crop Image</strong> <span class="pi-sub">Drag the frame or its handles</span></div>
          <button type="button" class="pi-x" data-ref="close" aria-label="Close">×</button>
        </div>
        <div class="pi-crop-view" data-ref="view"><div class="pi-loading">Loading image…</div></div>
        <div class="pi-foot">
          <div class="pi-row">
            <button type="button" class="pi-btn ghost" data-ref="reset">Reset</button>
            <span class="pi-sub" data-ref="size"></span>
          </div>
          <div class="pi-row">
            <button type="button" class="pi-btn ghost" data-ref="cancel">Cancel</button>
            <button type="button" class="pi-btn primary" data-ref="apply" disabled>Apply Crop</button>
          </div>
        </div>
      </div>`;
    const $ = (r) => root.querySelector(`[data-ref="${r}"]`);
    let img, scale = 1, rect, frame;

    const finish = (v) => {
      document.removeEventListener('keydown', onKey);
      root.remove();
      resolve(v);
    };
    const onKey = (e) => { if (e.key === 'Escape') finish(null); };
    document.addEventListener('keydown', onKey);
    root.addEventListener('mousedown', (e) => { if (e.target === root) finish(null); });
    $('close').addEventListener('click', () => finish(null));
    $('cancel').addEventListener('click', () => finish(null));

    const draw = () => {
      Object.assign(frame.style, {
        left: `${rect.x * scale}px`, top: `${rect.y * scale}px`,
        width: `${rect.w * scale}px`, height: `${rect.h * scale}px`,
      });
      $('size').textContent = `${Math.round(rect.w)} × ${Math.round(rect.h)}px`;
    };

    $('reset').addEventListener('click', () => {
      if (!img) return;
      rect = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
      draw();
    });

    $('apply').addEventListener('click', () => {
      const r = { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) };
      const c = document.createElement('canvas');
      c.width = r.w; c.height = r.h;
      c.getContext('2d').drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      finish({ dataUrl: c.toDataURL('image/png'), rect: r });
    });

    document.body.append(root);

    loadImg(imageSrc).then((loaded) => {
      if (!root.isConnected) return;
      img = loaded;
      const W = img.naturalWidth, H = img.naturalHeight;
      scale = Math.min(VIEW_W / W, VIEW_H / H, 1);
      rect = initialRect ? { ...initialRect } : { x: 0, y: 0, w: W, h: H };

      const stage = document.createElement('div');
      stage.className = 'pi-crop-stage';
      stage.style.width = `${W * scale}px`;
      stage.style.height = `${H * scale}px`;
      const shown = document.createElement('img');
      shown.src = imageSrc;
      shown.draggable = false;
      frame = document.createElement('div');
      frame.className = 'pi-crop-frame';
      frame.innerHTML = HANDLES.map((h) => `<span class="pi-h ${h}" data-h="${h}"></span>`).join('');
      stage.append(shown, frame);
      $('view').replaceChildren(stage);
      $('apply').disabled = false;
      draw();

      // 프레임 몸통 = 이동, 핸들 = 해당 변만 움직인다.
      let drag = null;
      frame.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        frame.setPointerCapture(e.pointerId);
        drag = { h: e.target.dataset.h || 'move', sx: e.clientX, sy: e.clientY, r0: { ...rect } };
      });
      frame.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const dx = (e.clientX - drag.sx) / scale;
        const dy = (e.clientY - drag.sy) / scale;
        const r0 = drag.r0;
        let x0 = r0.x, y0 = r0.y, x1 = r0.x + r0.w, y1 = r0.y + r0.h;
        if (drag.h === 'move') {
          const nx = Math.max(0, Math.min(W - r0.w, r0.x + dx));
          const ny = Math.max(0, Math.min(H - r0.h, r0.y + dy));
          rect = { x: nx, y: ny, w: r0.w, h: r0.h };
        } else {
          if (drag.h.includes('w')) x0 = Math.max(0, Math.min(x1 - MIN_SIZE, x0 + dx));
          if (drag.h.includes('e')) x1 = Math.min(W, Math.max(x0 + MIN_SIZE, x1 + dx));
          if (drag.h.includes('n')) y0 = Math.max(0, Math.min(y1 - MIN_SIZE, y0 + dy));
          if (drag.h.includes('s')) y1 = Math.min(H, Math.max(y0 + MIN_SIZE, y1 + dy));
          rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        }
        draw();
      });
      frame.addEventListener('pointerup', () => { drag = null; });
    }).catch(() => {
      $('view').innerHTML = '<div class="pi-loading">Failed to load image.</div>';
    });
  });
}

// ── 고정 프레임 크롭 (블프 빌더 ImageCropModal 과 같은 방식) ─────────────────
// 프레임은 가운데 고정(aspect 비율), 이미지를 끌어 옮기고 줌 슬라이더로 크기를 바꾼다.
// 줌 1 = 이미지가 화면(FIX_W×FIX_H)에 contain 으로 들어간 크기 (react-easy-crop 과 같은 기준).
// 프레임보다 작게 줄이면 남는 자리는 투명 — Slot 박스처럼 "박스 안에서 제품 크기"를 정할 때 쓴다.
//
//   const out = await openFixedCropModal({ imageSrc, aspect: 1, initial });
//   → { dataUrl, frame: { ox, oy, zoom } } (frame 은 재편집 때 복원용), 취소하면 null

const FIX_W = 660, FIX_H = 420;
const MAX_OUT = 2600; // 결과 PNG 긴 변 상한 (블프와 같다)

export function openFixedCropModal({ imageSrc, aspect = 1, minZoom = 0.5, maxZoom = 3, zoomStep = 0.05, initial = null }) {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'pi-backdrop dark';
    root.innerHTML = `
      <div class="pi-modal pi-fcrop" role="dialog" aria-modal="true">
        <div class="pi-head">
          <div><strong>Crop Image</strong></div>
          <button type="button" class="pi-x" data-ref="close" aria-label="Close">×</button>
        </div>
        <div class="pi-fcrop-view" data-ref="view" style="width:${FIX_W}px;height:${FIX_H}px"><div class="pi-loading">Loading image…</div></div>
        <div class="pi-fcrop-zoom">
          <button type="button" class="pi-fcrop-zbtn" data-ref="zout" aria-label="Zoom out"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M8 11h6M20 20l-4-4"/></svg></button>
          <input type="range" data-ref="zoom" min="${minZoom}" max="${maxZoom}" step="${zoomStep}" />
          <button type="button" class="pi-fcrop-zbtn" data-ref="zin" aria-label="Zoom in"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M8 11h6M11 8v6M20 20l-4-4"/></svg></button>
          <span class="pi-fcrop-pct" data-ref="pct"></span>
        </div>
        <div class="pi-foot">
          <button type="button" class="pi-btn ghost" data-ref="fit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg> Fit
          </button>
          <div class="pi-row">
            <button type="button" class="pi-btn ghost" data-ref="cancel">Cancel</button>
            <button type="button" class="pi-btn primary" data-ref="apply" disabled>✓ Apply Crop</button>
          </div>
        </div>
      </div>`;
    const $ = (r) => root.querySelector(`[data-ref="${r}"]`);
    // 프레임 — 화면 안에 aspect 비율로 가장 크게
    const fw = aspect >= FIX_W / FIX_H ? FIX_W : FIX_H * aspect;
    const fh = aspect >= FIX_W / FIX_H ? FIX_W / aspect : FIX_H;
    let img, base = 1, zoom = 1, ox = 0, oy = 0, shown;

    const finish = (v) => {
      document.removeEventListener('keydown', onKey);
      root.remove();
      resolve(v);
    };
    const onKey = (e) => { if (e.key === 'Escape') finish(null); };
    document.addEventListener('keydown', onKey);
    root.addEventListener('mousedown', (e) => { if (e.target === root) finish(null); });
    $('close').addEventListener('click', () => finish(null));
    $('cancel').addEventListener('click', () => finish(null));

    const clampZoom = (z) => Math.min(maxZoom, Math.max(minZoom, z));
    // 옮길 수 있는 범위 — 이미지와 프레임 크기 차이의 절반 (react-easy-crop restrictPosition 과 같다)
    const clampPos = () => {
      const iw = img.naturalWidth * base * zoom, ih = img.naturalHeight * base * zoom;
      const mx = Math.abs(iw - fw) / 2, my = Math.abs(ih - fh) / 2;
      ox = Math.max(-mx, Math.min(mx, ox));
      oy = Math.max(-my, Math.min(my, oy));
    };
    const draw = () => {
      clampPos();
      const iw = img.naturalWidth * base * zoom, ih = img.naturalHeight * base * zoom;
      Object.assign(shown.style, { width: `${iw}px`, height: `${ih}px`, left: `${FIX_W / 2 + ox - iw / 2}px`, top: `${FIX_H / 2 + oy - ih / 2}px` });
      $('zoom').value = zoom;
      $('pct').textContent = `${Math.round(zoom * 100)}%`;
      // 슬라이더 채운 부분 (빨강) — 블프와 같은 모양
      $('zoom').style.setProperty('--p', `${((zoom - minZoom) / (maxZoom - minZoom)) * 100}%`);
    };
    const setZoom = (z) => { zoom = clampZoom(z); draw(); };

    $('zoom').addEventListener('input', (e) => setZoom(Number(e.target.value)));
    $('zout').addEventListener('click', () => setZoom(zoom - zoomStep));
    $('zin').addEventListener('click', () => setZoom(zoom + zoomStep));
    $('fit').addEventListener('click', () => { ox = 0; oy = 0; setZoom(1); });

    $('apply').addEventListener('click', () => {
      // 프레임이 덮는 원본 픽셀 영역 — 이미지 밖은 투명으로 남는다
      const s = base * zoom;
      const sw = fw / s, sh = fh / s;
      const sx = img.naturalWidth / 2 - (fw / 2 + ox) / s;
      const sy = img.naturalHeight / 2 - (fh / 2 + oy) / s;
      const k = Math.min(1, MAX_OUT / Math.max(sw, sh));
      const c = document.createElement('canvas');
      c.width = Math.round(sw * k); c.height = Math.round(sh * k);
      c.getContext('2d').drawImage(img, -sx * k, -sy * k, img.naturalWidth * k, img.naturalHeight * k);
      finish({ dataUrl: c.toDataURL('image/png'), frame: { ox, oy, zoom, aspect } });
    });

    document.body.append(root);

    loadImg(imageSrc).then((loaded) => {
      if (!root.isConnected) return;
      img = loaded;
      base = Math.min(FIX_W / img.naturalWidth, FIX_H / img.naturalHeight);
      const view = $('view');
      shown = document.createElement('img');
      shown.src = imageSrc;
      shown.draggable = false;
      shown.className = 'pi-fcrop-img';
      const frame = document.createElement('div');
      frame.className = 'pi-fcrop-frame';
      Object.assign(frame.style, { width: `${fw}px`, height: `${fh}px`, left: `${(FIX_W - fw) / 2}px`, top: `${(FIX_H - fh) / 2}px` });
      frame.innerHTML = '<i class="v1"></i><i class="v2"></i><i class="h1"></i><i class="h2"></i>';
      view.replaceChildren(shown, frame);
      // 처음에는 프레임을 꽉 채운다 (cover) — 같은 비율로 다시 열면 지난 자리 그대로
      if (initial && Math.abs((initial.aspect ?? aspect) - aspect) < 0.02) ({ ox, oy, zoom } = initial);
      else zoom = clampZoom(Math.max(fw / (img.naturalWidth * base), fh / (img.naturalHeight * base)));
      $('apply').disabled = false;
      draw();

      let drag = null;
      view.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        view.setPointerCapture(e.pointerId);
        drag = { sx: e.clientX, sy: e.clientY, ox, oy };
      });
      view.addEventListener('pointermove', (e) => {
        if (!drag) return;
        ox = drag.ox + e.clientX - drag.sx;
        oy = drag.oy + e.clientY - drag.sy;
        draw();
      });
      view.addEventListener('pointerup', () => { drag = null; });
      view.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(zoom - Math.sign(e.deltaY) * zoomStep); }, { passive: false });
    }).catch(() => {
      $('view').innerHTML = '<div class="pi-loading">Failed to load image.</div>';
    });
  });
}
