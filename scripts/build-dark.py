#!/usr/bin/env python3
"""
Main Key Visual 다크 톤 에셋 — "source/1120 정리/dark/" 에서 빌더가 쓰는 레이어를 만든다 (build-assets.sh 보다 먼저 돌린다).

  python3 scripts/build-dark.py

다크는 완성 컷을 받지 않고 쌓아서 그린다 (builder-app.js darkBg — 화면 · 다운로드 모두):
  컬러 배경 → 단상 그림자 k(곱하기) + 바닥 반사 floor(더하기) → 아이콘 접지선 · 반사 → 블랙 그라데이션(Darkness) → 단상 몸통 body(더하기)
  → 아이콘 몸통 (k 곱하기 + 배경색 하모나이즈한 a 더하기)

입력 (source/1120 정리/dark/)
  bg/color-0N.png          : 다크 컬러 배경 5장 (블랙 그라데이션 · 단상 없음)
  podium/<에셋>-white/black : 단상(그림자 포함)만 흰 배경 · 검은 배경에 저장한 두 장 → k = (흰 − 검) / 흰 배경 값, 색 = 검은 배경
  icon.psd                 : trade-in / trade-up × clear / wood × front / side1 / side2. 그림자 · 반사 레이어는 끄고 몸통 레이어
                             (유리 면 · 화살표 그림자 · 화살표 · 테두리)를 하나씩 꺼내 직접 쌓는다.
                             바닥 그림자 · 반사도 PSD 레이어(마스크 적용) 그대로 — 다크 바닥에 맞게 그림자는 어둡게 하는 성분만(곱하기),
                             반사는 라이트의 곱하기 대신 아주 옅게 더하기(REFLECT — 2026-11-18 '반광처럼 조금' 확정 느낌)
                             유리 면은 PSD 에서 흰색 80% — 밝은 배경에선 비쳐 보이지만 어두운 배경에선 흰 판처럼 막힌다 (GLASS 로 바꿀 수 있다).
                             줄일 때는 LANCZOS 로 먼저 줄이고 소수 자리만 옮긴다 (한 번에 bilinear 로 줄이면 테두리가 계단처럼 깨진다)

출력
  public/assets/trade-in-up/dark/bg/color-0N(-swatch).jpg     : 컬러 배경 · Background Color 동그라미
  public/assets/trade-in-up/dark/b1-<에셋>-{k,body,floor}.png  : 단상 레이어 (Trade In · Up 공통)
  public/assets/trade-in-up/dark/<in|up>-b1-<에셋>-icon-{k,a,shadow,refl}.png : 3000² 자리에 놓은 아이콘 몸통 · 바닥 그림자 · 반사
  source/.gen/dark/…   : Darkness 40 으로 미리 그린 컷 — build-assets.sh 가 기존 다크 컷 자리처럼 굽는다
                         (팔레트 · 처음 그림 · 제품 그림자 색 고르기용. 화면 · 다운로드는 빌더가 다시 그린다)
  source/.gen/<in|up> icon-<v|h>-{fixed,eco}.png : Product Slot 매체 판 아이콘 — 슬롯 컷에서 떼어 1102 파일과 같은 2015×2243 자리에
"""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'source', '1120 정리')
GEN = os.path.join(ROOT, 'source', '.gen')
OUT = os.path.join(ROOT, 'public', 'assets', 'trade-in-up', 'dark')
N = 3000
ASSETS = ['01-01', '01-02', '02-01', '02-02']
COLORS = ['01', '02', '03', '04', '05']
# 에셋별 아이콘 각도 · 자리 — 1120 라이트 컷(아이콘 있는 컷 − 없는 컷)에 icon.psd 렌더를 맞춰 찾은 값
#   psd 픽셀 (u, v) → 3000² (tx + s·u, ty + s·v). Trade In · Up 이 1px 안으로 같아 평균
ICON_PLACE = {
    '01-01': ('front', 0.2345, 1628.6, 1511.7),
    '02-01': ('front', 0.2347, 1628.3, 1511.4),
    '01-02': ('side2', 0.2485, 1154.3, 1504.1),
    '02-02': ('side2', 0.2485, 1167.3, 1543.1),
}
# builder-app.js 와 같은 값 (DARK_GRAD · DARK_DEFAULT · ICON_REFLECT · ICON_HARMONY)
GRAD = dict(cx=1462, cy=1544, rx=1921, ry=1603, r0=0.206, r1=0.84, mid=0.603)
DARK_DEFAULT = 40
GLASS = float(os.environ.get('GLASS', 0.8))  # 다크 아이콘 유리 면 불투명도 (PSD 원래 값 0.8)
SHADOW = float(os.environ.get('SHADOW', 2.5))  # 아이콘 바닥 그림자 진하기 — PSD 그림자가 어둡게 하는 만큼 × SHADOW
# (2026-11-23 사용자: 퍼지면 안 되고 포토샵처럼 밑변에 붙은 선만 — 포토샵 캡처와 맞춰 2.5)
REFLECT = float(os.environ.get('REFLECT', 0.05))  # 아이콘 바닥 반사 세기 (더하기) — builder-app.js ICON_REFLECT
HARMONY = dict(amount=0.05, dim=0.98, lift=1.0)  # 색 5% · 밝기 −2% (2026-11-23 사용자 조정) · lift = 더 밝힐 때만


def L(path, mode='RGB'):
    return np.asarray(Image.open(path).convert(mode), dtype=np.float32)


def save(a, path, **kw):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(np.clip(a + .5, 0, 255).astype(np.uint8)).save(path, **kw)


# ── icon.psd ──────────────────────────────────────────────────────────────
def load_layers():
    """{(ver, mat, ang): [(이름, RGBA 0~1, 불투명도, 블렌드, 클립, 역할)]} 아래 → 위. 역할 = body · shadow · reflection.
    오래 걸려 source/.gen/icon-cache 에 남긴다"""
    cache = os.path.join(GEN, 'icon-cache')
    psd = os.path.join(SRC, 'dark', 'icon.psd')
    stamp = f'layers2 {os.path.getmtime(psd)}'
    want = [(v, m, a) for v in ('in', 'up') for m in ('clear', 'wood') for a in ('front', 'side2')]
    f = lambda k: f'{cache}/L-{"-".join(k)}.npz'
    if not (os.path.exists(os.path.join(cache, 'stamp')) and open(os.path.join(cache, 'stamp')).read() == stamp):
        from psd_tools import PSDImage
        p = PSDImage.open(psd)
        H, W = p.height, p.width
        def full(layer):
            out = np.zeros((H, W, 4), np.float32)
            im = layer.topil()
            if im is None:
                return out
            im = np.asarray(im.convert('RGBA'), np.float32) / 255
            x0, y0 = layer.left, layer.top
            h, w = im.shape[:2]
            ys, xs, ye, xe = max(0, y0), max(0, x0), min(H, y0 + h), min(W, x0 + w)
            out[ys:ye, xs:xe] = im[ys - y0:ye - y0, xs - x0:xe - x0]
            # 레이어 마스크 — 안 씌우면 그림자 레이어의 가려진 쪽이 색 노이즈로 나온다
            m = layer.mask if layer.has_mask() else None
            if m is not None and m.topil() is not None:
                mm = np.full((H, W), m.background_color / 255, np.float32)
                mi = np.asarray(m.topil().convert('L'), np.float32) / 255
                ys, xs, ye, xe = max(0, m.top), max(0, m.left), min(H, m.bottom), min(W, m.right)
                mm[ys:ye, xs:xe] = mi[ys - m.top:ye - m.top, xs - m.left:xe - m.left]
                out[..., 3] *= mm
            return out
        os.makedirs(cache, exist_ok=True)
        for k in want:
            v, mat, ang = k
            g = [x for x in p if x.name == ('trade-in' if v == 'in' else 'trade-up')][0]
            A = [x for x in [x for x in g if x.name == mat][0] if x.name == ang][0]
            arrs, meta = {}, []
            for grp in A:
                role = 'shadow' if grp.name == 'shadow' else 'reflection' if grp.name.endswith('-reflection') else 'body'
                for c in (list(grp) if grp.is_group() else [grp]):
                    arrs[f'l{len(meta)}'] = full(c)
                    meta.append([c.name, c.opacity / 255, c.blend_mode.name, bool(c.clipping), role])
            np.savez_compressed(f(k), meta=json.dumps(meta), **arrs)
            print('  icon.psd', *k, [m[0] for m in meta], flush=True)
        open(os.path.join(cache, 'stamp'), 'w').write(stamp)
    out = {}
    for k in want:
        z = np.load(f(k))
        meta = json.loads(str(z['meta']))
        out[k] = [(n, z[f'l{i}'], op, bl, cl, role) for i, (n, op, bl, cl, role) in enumerate(meta)]
    return out


def stack(layers, bg, glass=None):
    """아이콘 몸통 레이어를 bg(1 = 흰, 0 = 검) 위에 쌓은 RGB 0~1. glass = 유리 면 불투명도 바꾸기"""
    x = np.full(layers[0][1].shape[:2] + (3,), bg, np.float32)
    # 클리핑 묶음 — 포토샵처럼 아래(기준) 레이어 모양 안에서 위 레이어를 먼저 합치고, 묶음 전체를 기준 레이어 불투명도로 한 번만 얹는다
    # (side2 의 blur 가 유리 면에 클리핑돼 있다 — 따로 한 겹 더 얹으면 유리가 막혀 뒤가 안 비친다)
    groups = []
    for name, im, op, blend, clip, role in layers:
        if role != 'body':
            continue
        if name == 'surface-transparent' and glass is not None:
            op = glass
        if clip and groups:
            groups[-1][3].append((im, op))
        else:
            groups.append([im, op, blend, []])
    for im, op, blend, clipped in groups:
        c = im[..., :3]
        for ci, cop in clipped:
            ca = ci[..., 3:] * cop
            c = c * (1 - ca) + ci[..., :3] * ca
        a = im[..., 3:] * op
        x = x * (1 - a + c * a) if blend == 'MULTIPLY' else x * (1 - a) + c * a
    return x


def down_place(img, s, tx, ty, size=(N, N), origin=(0, 0)):
    """psd 해상도 → 3000² (tx + s·u, ty + s·v). LANCZOS 로 먼저 줄이고 남은 소수 자리만 bilinear 로 옮긴다"""
    H, W = img.shape[:2]
    w2, h2 = round(W * s), round(H * s)
    k = w2 / W / s
    ox, oy = origin
    ch = []
    for c in range(img.shape[2]):
        r = Image.fromarray(np.ascontiguousarray(img[..., c], np.float32)).resize((w2, h2), Image.LANCZOS)
        ch.append(np.asarray(r.transform(size, Image.AFFINE, (k, 0, (ox - tx) * k, 0, k, (oy - ty) * k), Image.BILINEAR)))
    return np.stack(ch, -1)


def floor_layers(layers):
    """PSD 바닥 그림자 · 반사 (psd 해상도) → (그림자 곱하기 값 0~1, 반사 색 × 알파 0~1)
    그림자: 라이트용 회색 칠(보통 · 곱하기) — 어두운 바닥에 회색이 뜨지 않게 어둡게 하는 만큼(1 − 알파 × (1 − 색))만 쓴다"""
    H, W = layers[0][1].shape[:2]
    sh = np.ones((H, W, 1), np.float32)
    rf = np.zeros((H, W, 3), np.float32)
    for name, im, op, blend, clip, role in layers:
        a = im[..., 3:] * op
        if role == 'shadow':
            sh *= 1 - a * (1 - im[..., :3].mean(-1, keepdims=True))
        elif role == 'reflection':
            rf = rf * (1 - im[..., 3:]) + im[..., :3] * im[..., 3:]
    return sh, rf


def icon_layers(layers):
    """{(ver, 에셋): (k 3000² 0~1, a 3000²×3 0~255, 그림자 0~1, 반사 0~255)} — 유리 면은 GLASS"""
    res = {}
    for a, (ang, s, tx, ty) in ICON_PLACE.items():
        for v in ('in', 'up'):
            L_ = layers[(v, 'clear', ang)]
            Wt, Bt = stack(L_, 1.0, GLASS), stack(L_, 0.0, GLASS)
            # 아이콘 밖은 다 비친다(k = 1) — 옮길 때 밖이 0 으로 채워지므로 가림 정도(1 − k)로 옮긴다
            k = 1 - np.clip(down_place(1 - (Wt - Bt), s, tx, ty), 0, 1).mean(-1)
            Bp = np.clip(down_place(Bt, s, tx, ty), 0, 1) * 255
            sh, rf = floor_layers(L_)
            shp = 1 - np.clip(down_place(1 - sh, s, tx, ty) * SHADOW, 0, 1)[..., 0]
            rfp = np.clip(down_place(rf, s, tx, ty), 0, 1) * 255
            res[(v, a)] = (k, Bp, shp, rfp)
    return res


def slot_icons(layers):
    """Product Slot 매체 판 아이콘 — 사용자가 슬롯 컷(1120 '<trade in|up>/slot/<세로형|가로형>/no box(-eco).png')에 배치해 둔 아이콘을
    그대로 떼어, 1102 '<버전> icon-fixed/-eco.png' 와 같은 2015×2243 틀 · 자리에 놓는다 (channelSlots.js PSLOT_ICON 그대로).
    판마다 배치(세로형 v · 가로형 h)가 달라 아이콘도 둘 — .gen/<버전> icon-<v|h>-<fixed|eco>.png
      틀 자리: 컷 아이콘에 icon.psd side2 를 맞춰(크기 · 위치) 틀 좌표로 되돌리고, front 가 1102 파일 자리로 가는 만큼 같이 옮긴다"""
    from scipy.optimize import minimize
    old = os.path.join(ROOT, 'source', '1102 정리')
    for v in ('in', 'up'):
        for mat, name, f in (('clear', 'fixed', 'no box.png'), ('wood', 'eco', 'no box-eco.png')):
            fa = lambda ang: np.clip(1 - (stack(layers[(v, mat, ang)], 1.0) - stack(layers[(v, mat, ang)], 0.0)).mean(-1), 0, 1)
            front, side = fa('front'), fa('side2')
            H, W = front.shape
            ref = np.asarray(Image.open(os.path.join(old, f'{v} icon-{name}.png')).convert('RGBA'))[..., 3] > 8
            ry, rx = np.nonzero(ref)
            ny, nx = np.nonzero(front > 8 / 255)
            dx = (rx.min() + rx.max() - nx.min() - nx.max()) / 2
            dy = (ry.min() + ry.max() - ny.min() - ny.max()) / 2
            py, px = np.nonzero(side > 0.5)
            Si = Image.fromarray(side.astype(np.float32))
            for shape, lay in (('세로형', 'v'), ('가로형', 'h')):
                cut = np.asarray(Image.open(os.path.join(SRC, f'trade {v}', 'slot', shape, f)).convert('RGBA'), np.float32) / 255
                ys, xs = np.nonzero(cut[..., 3] > 0.5)
                box = (xs.min() - 30, ys.min() - 30, xs.max() + 30, ys.max() + 30)
                Ac = cut[box[1]:box[3], box[0]:box[2], 3]
                size = (box[2] - box[0], box[3] - box[1])
                def err(p):
                    sc, tx, ty = p
                    m = np.asarray(Si.transform(size, Image.AFFINE, (1 / sc, 0, (box[0] - tx) / sc, 0, 1 / sc, (box[1] - ty) / sc), Image.BILINEAR))
                    return float(np.abs(m - Ac).mean())
                s0 = (xs.max() - xs.min()) / (px.max() - px.min())
                sc, tx, ty = minimize(err, (s0, xs.min() - s0 * px.min(), ys.min() - s0 * py.min()), method='Nelder-Mead',
                                      options={'xatol': 0.01, 'fatol': 1e-5}).x
                # 틀 픽셀 (u, v) ← 컷 (tx + sc·(u − dx), ty + sc·(v − dy)). 알파를 곱한 색으로 옮겨 가장자리 테가 안 생기게
                pre = np.concatenate([cut[..., :3] * cut[..., 3:], cut[..., 3:]], -1)
                aff = (sc, 0, tx - sc * dx, 0, sc, ty - sc * dy)
                ch = [np.asarray(Image.fromarray(np.ascontiguousarray(pre[..., c])).transform((W, H), Image.AFFINE, aff, Image.BICUBIC)) for c in range(4)]
                al = np.clip(ch[3], 0, 1)[..., None]
                rgb = np.where(al > 0.004, np.stack(ch[:3], -1) / np.maximum(al, 1e-3), 0)
                save(np.concatenate([np.clip(rgb, 0, 1), al], -1) * 255, os.path.join(GEN, f'{v} icon-{lay}-{name}.png'))
                print(f'  slot icon {v}-{lay}-{mat}: 컷에서 떼어 냄 (맞춤 오차 {err((sc, tx, ty)):.3f})', flush=True)


# ── 단상 ──────────────────────────────────────────────────────────────────
def podium(a):
    d = os.path.join(SRC, 'dark', 'podium')
    W, B = L(f'{d}/{a}-white.png'), L(f'{d}/{a}-black.png')
    white = W[:40, :40].mean()  # 흰 배경 실제 값 (02-01 은 250)
    k = np.clip((W - B) / white, 0, 1).mean(-1)
    w = np.clip((k - 0.3) / 0.3, 0, 1)[..., None]  # 그림자 진한 곳 = 몸통, 옅은 곳 = 바닥 반사
    return k, B * (1 - w), B * w


# ── Darkness 40 미리 그리기 (builder-app.js darkBg 와 같은 순서 · 값) ─────────
def dark_alpha(d=DARK_DEFAULT):
    G = GRAD
    W0 = G['r1'] - G['r0']
    if d <= DARK_DEFAULT:
        sc = 1.3 - 0.3 * d / DARK_DEFAULT
        i0, i1, soft = G['r0'] * sc, G['r1'] * sc, 0
    else:
        t = (d - DARK_DEFAULT) / (100 - DARK_DEFAULT)
        i1 = G['r1'] + (0.42 - G['r1']) * t
        i0, soft = i1 - W0, t
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    r = np.sqrt(((xx - G['cx']) / G['rx']) ** 2 + ((yy - G['cy']) / G['ry']) ** 2)
    u = np.clip((r - i0) / (i1 - i0), 0, 1) ** (np.log(.5) / np.log(G['mid']))
    return (u + soft * (u * u * (3 - 2 * u) - u))[..., None]


def harmony_fill(bg):
    v = bg[900:1700, 1100:2100].reshape(-1, 3).mean(0)
    m = max(v.max(), 1)
    A, D = HARMONY['amount'], HARMONY['dim']
    return np.round(255 * D * (1 - A + A * v / m))


def compose(bg, pod, icon, black):
    k, body, floor = pod
    x = bg * k[..., None]
    x = np.minimum(255, x + floor)
    if icon:
        # 아이콘 바닥 그림자(곱하기) · 반사(옅게 더하기) — 블랙 아래 (아이콘이 떠 보이지 않게)
        x = x * icon[2][..., None]
        x = np.minimum(255, x + icon[3] * REFLECT)
    x = x * (1 - black)
    x = np.minimum(255, x + body)
    if icon:
        ki, ai = icon[0], icon[1]
        x = x * ki[..., None]
        x = np.minimum(255, x + np.minimum(255, ai * harmony_fill(bg) / 255 * HARMONY.get('lift', 1)))
    return x


def main():
    os.makedirs(OUT, exist_ok=True)
    print('icon.psd 레이어 · 유리 면', GLASS)
    psd_layers = load_layers()
    slot_icons(psd_layers)
    layers = icon_layers(psd_layers)
    for (v, a), (k, ai, sh, rf) in layers.items():
        save(k * 255, f'{OUT}/{v}-b1-{a}-icon-k.png', optimize=True)
        save(ai, f'{OUT}/{v}-b1-{a}-icon-a.png', optimize=True)
        save(sh * 255, f'{OUT}/{v}-b1-{a}-icon-shadow.png', optimize=True)
        save(rf, f'{OUT}/{v}-b1-{a}-icon-refl.png', optimize=True)
    bgs = {}
    for c in COLORS:
        bgs[c] = L(f'{SRC}/dark/bg/color-{c}.png')
        save(bgs[c], f'{OUT}/bg/color-{c}.jpg', quality=90)
        # Background Color 동그라미 — 블랙 없는 컬러 배경에서 (라이트 칸과 같은 자리 1250,600 에서 500px)
        Image.fromarray(bgs[c][600:1100, 1250:1750].astype(np.uint8)).resize((96, 96), Image.LANCZOS).save(f'{OUT}/bg/color-{c}-swatch.jpg', quality=90)
    black = dark_alpha()
    for a in ASSETS:
        pod = podium(a)
        k, body, floor = pod
        save(k * 255, f'{OUT}/b1-{a}-k.png', optimize=True)
        save(body, f'{OUT}/b1-{a}-body.png', optimize=True)
        save(floor, f'{OUT}/b1-{a}-floor.png', optimize=True)
        np_ = a in ('01-02', '02-02')  # 구형 제품 없는 컷 자리 (빌더는 01-02 · 02-02 에서 늘 -np 를 쓴다)
        for c in COLORS:
            save(compose(bgs[c], pod, None, black), f'{GEN}/dark/basic-noicon/{a}/dark/color-{c}.png', compress_level=1)
            for v in ('in', 'up'):
                x = compose(bgs[c], pod, layers[(v, a)], black)
                p = (f'{GEN}/dark/trade-{v}/basic/{a}/noproduct-standard/dark/{a}-noproduct-color-{c}.png' if np_
                     else f'{GEN}/dark/trade-{v}/basic/{a}/dark/{a}-color-{c}.png')
                save(x, p, compress_level=1)
        print('  podium · 미리 그린 컷', a, flush=True)


if __name__ == '__main__':
    main()
