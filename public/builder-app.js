/**
 * Trade In-Up Builder.
 *
 * BF Content Banner Builder 와 같은 흐름: 왼쪽 팔레트에서 에셋 하나를 고르면
 * 캔버스가 미리보기를, Edit panel 이 원본 프레임과 편집 항목을 보여준다.
 * 아트가 없는 에셋(`art: null`)은 빈 박스로 남는다. 아트는 원본을 그대로 쓰지
 * 않고 scripts/build-assets.sh 가 구운 thumb / preview / frame / stage 를 쓴다.
 *
 * Product & Shadow — studio.html(studio-app.js)의 제품 가져오기·배치·그림자를 옮겨 왔다.
 *   합성은 stage(원본 해상도)에 그리고, 캔버스에는 그중 미리보기 창(PREVIEW_ZOOM)만 보인다.
 *   Edit panel 프레임과 PNG 다운로드는 정사각 전체다. 셋 다 같은 #comp 캔버스에서 나온다.
 * Scene Color — studio.html 의 Color mood 를 옮겨 왔다. 화면은 바꾸지 않는다:
 *   제품 사진 속 영역(1: 화면 클릭 자동 감지 / 2: 네 점 직접 지정)을 잘라 그 색으로 배경을 물들인다.
 *   그리는 순서 (화면과 다운로드가 같은 paint() 를 쓴다):
 *     물든 배경 → 화면 빛 번짐 → (제품마다) 그림자 → 제품
 *   영역 네 모서리는 제품 사각형 기준(0~1)으로 저장해서 제품을 옮기거나 키워도 따라간다.
 */

import { blobToDataUrl, loadImage } from './lib/productApi.js';
import { importFromUrl, importFromFile, editProduct } from './lib/productImportFlow.js';
import { DEFAULT_FX, cloneFx, createBackground, drawComposite } from './lib/composite.js';
import { orderQuad, warpInfill, colorField, detectObjects, adjustBackground, glowLayer } from './lib/infill.js';
import { slotsForChannel, drawSlot, logosReady, onIconLoad } from './lib/channelSlots.js';
import { newCopyState, renderCopyPanel, bindCopyPanel } from './lib/channelCopy.js';

/**
 * 팔레트 줄 — Trade In / Trade Up 두 버전이 같은 목록·배치를 쓴다 (아이콘 화살표만 다르다).
 * id 는 버전 앞붙이 없는 파일명 stem — 실제 에셋 id 는 `<버전>-<id>` (예 in-b1-01-01),
 * scripts/build-assets.sh 의 bake 목록과 맞춘다. 그림이 있는지·원본 크기는 그 스크립트가
 * 쓴 manifest.json 에서 읽는다 — 원본을 넣고 스크립트만 돌리면 박스가 채워진다.
 *   stage = 제품을 처음 놓을 자리, 배경 대비 비율 — cx: 가로 중심, bottom: 발끝(바닥선), h: 제품 높이.
 *           01·02 는 제품 있는 컷과 없는 컷의 차이로 원래 TV 자리를 쟀고, 03·04 는 냉장고 자리를 눈으로 쟀다.
 */
/** Slot 박스 — 원본 픽셀 [x, y, w, h] → 원본 한 변(3000) 대비 비율 */
const boxesOf = list => list.map(([x, y, w, h]) => ({ x: x / 3000, y: y / 3000, w: w / 3000, h: h / 3000 }));

const ASSET_GROUPS = [
  // 라인(source/ 폴더)마다 한 줄, 파일명 순서대로. 캡션 = 파일명.
  // 팔레트는 제품이 있는 컷, 캔버스·패널은 제품을 얹을 빈 무대(-no product)
  // tones: 줄 제목 오른쪽에 Light / Dark 를 고를 수 있는 줄 (Basic 만)
  { key: 'basic-01', label: 'Main Key Visual', tones: true, bgColors: true, assets: [
    // 둥근 단상 (source/1102 정리/<trade-in|trade-up>/basic)
    // 팔레트 이름 — 01-0N = Wide Product (TV), 02-0N = Tall Product (냉장고). noteAfter: 그 박스 다음 줄에 작은 안내 — 01-01 TV · 01-02 TV+구형 · 02-01 냉장고 · 02-02 냉장고+구형
    // 제품 자리는 1023 컷에서 눈으로 쟀다 — 1102 썸네일·standard 차이로 다시 재도 맞는다
    // section — 팔레트에서 이 박스부터 새 묶음(제목 + 구분선)으로 나눠 그린다
    { id: 'b1-01-01', label: 'Wide Product 01', section: 'Main Key Visual _Wide', previewCy: 0.48, stage: { cx: 0.469, bottom: 0.51, h: 0.097 } },
    // oldProduct — 고르면 깔아 두는 구형 제품 (크리스마스 기본 배치 제품처럼 옮기고·키우고·지울 수 있다).
    //   자리 = 원본 3000² 픽셀 [x, y, w, h] — <컷>-thumbnail-light.png 왼쪽 구형 제품에 맞춰 쟀다 (그림자까지 든 이미지 전체 자리 — 제품 부분이 썸네일 구형 제품과 겹친다)
    { id: 'b1-01-02', label: 'Wide Product 02', oldProduct: { id: 'old-tv', label: 'Old TV', src: 'product/old-tv.png', srcDark: 'product/old-tv-dark.png', box: [1094, 1396, 222.8, 172.8] }, noteAfter: '* Wide Product - A product wider than it is tall (e.g. TV)', previewCy: 0.48, stage: { cx: 0.516, bottom: 0.48, h: 0.072 } },
    // previewCy — 캔버스 미리보기 창 세로 중심. 낮출수록 그림이 내려온다. TV 0.48 · 02-01 0.47 · 02-02 0.49 (previewCy — build-assets.sh 미리보기 세로 중심과 같은 값)
    { id: 'b1-02-01', label: 'Tall Product 01', section: 'Main Key Visual _Tall', previewCy: 0.47, stage: { cx: 0.463, bottom: 0.544, h: 0.188 } },
    { id: 'b1-02-02', label: 'Tall Product 02', oldProduct: { id: 'old-ref', label: 'Old refrigerator', src: 'product/old-ref.png', srcDark: 'product/old-ref-dark.png', box: [1092, 1284.9, 221, 355.8] }, noteAfter: '* Tall Product - A product taller than it is wide (e.g. refrigerator)', previewCy: 0.49, stage: { cx: 0.518, bottom: 0.536, h: 0.17 } },
  ] },
  // hidden — 시안 정리로 빌더 팔레트에서만 숨긴다 (에셋·설정은 그대로 — 다시 쓰려면 hidden 만 지운다)
  { key: 'basic-02', label: 'Basic 02', hidden: true, tones: true, bgColors: true, assets: [
    // 흰 계단 단상 — 01-0N TV · 02-0N 냉장고. 빈 무대 컷이 아직 없어 자리는 눈으로 쟀다
    // stageBy — 버전마다 컷이 달라 제품 자리가 다른 경우 (Trade In 은 thumbnail 과 빈 무대 차이로 쟀다)
    { id: 'b2-01-01', label: '01-01', previewCyBy: { in: 0.48 }, stage: { cx: 0.537, bottom: 0.452, h: 0.068 }, stageBy: { in: { cx: 0.536, bottom: 0.48, h: 0.071 } } },
    { id: 'b2-01-02', label: '01-02', previewCyBy: { in: 0.48 }, stage: { cx: 0.567, bottom: 0.452, h: 0.068 }, stageBy: { in: { cx: 0.556, bottom: 0.48, h: 0.071 } } },
    // previewCyBy — Trade In 컷은 단상이 위에 걸려 보여 (TV 0.48 · 냉장고 0.47) 캔버스 미리보기 창을 올린다 (= 그림이 내려온다. build-assets.sh 와 같은 값)
    { id: 'b2-02-01', label: '02-01', previewCyBy: { in: 0.47 }, stage: { cx: 0.543, bottom: 0.5, h: 0.136 } },
    { id: 'b2-02-02', label: '02-02', previewCyBy: { in: 0.47 }, stage: { cx: 0.563, bottom: 0.5, h: 0.136 } },
  ] },
  // source/1102 정리/<trade-in|trade-up>/slot-new — 세로형(v, 1:4) · 가로형(h, 2:2). build-assets.sh 주석 참고
  // 컬러·eco 는 박스로 늘리지 않고 Edit panel Background Color 로 고른다
  { key: 'slot', label: 'Product Slot', bgColors: true, assets: [
    // 팔레트 박스에는 이름을 달지 않는다 (noCaption) — 패널·캔버스 이름은 label
    // boxes — 무대에 그려진 빈 박스 (원본 3000² 픽셀에서 잰 값). 박스 하나에 제품 하나 (블프 PD Slot 과 같은 방식)
    // layouts — 한 Product Slot 의 두 배치(세로형 · 가로형). 매체 사이즈마다 둘이 섞여 쓰여서 제품은 같이 쓰고,
    //   팔레트에는 한 칸만 두고 Edit panel 이미지에서 화살표로 넘겨 본다
    // 세로형은 아이콘 아래 한 줄 넷 — 그림이 가운데보다 위라 미리보기 세로 중심 0.46, 위아래 여백이 남게 줌 2.8 (build-assets.sh 와 같은 값)
    { id: 'slot-v', label: 'Product Slot', layouts: ['slot-v', 'slot-h'], noCaption: true, previewCy: 0.46, previewZoom: 2.8, boxes: boxesOf([[1024, 1596, 221, 220], [1267, 1596, 221, 220], [1509, 1596, 221, 220], [1752, 1596, 221, 220]]) },
    // 가로형은 왼쪽 두 칸 · 오른쪽 두 칸 — 번호는 왼쪽 위 → 오른쪽 위 → 왼쪽 아래 → 오른쪽 아래. 미리보기 줌은 세로형과 같은 2.8
    // hidden — 팔레트에는 세로형 칸만 (가로형은 Edit panel 화살표로)
    { id: 'slot-h', label: 'Product Slot', layouts: ['slot-v', 'slot-h'], hidden: true, noCaption: true, previewZoom: 2.8, boxes: boxesOf([[901, 1174, 316, 316], [1783, 1174, 316, 316], [901, 1520, 316, 316], [1783, 1520, 316, 316]]) },
  ] },
];

/**
 * Background Color — Edit panel 이미지 아래에서 고르는 배경 컬러 칸 (Basic 01·02, Slot).
 * 칸 그림은 에셋의 컬러 부분을 잘라 둔 swatch (build-assets.sh SWATCH) — 없는 칸은 빈 점선 원.
 *   01 Standard = 원래 에셋, 02~06 = -color-01~05 컷, 07 Eco = -eco 컷 (컬러 + 우드 아이콘).
 *   그 변형이 구워져 있지 않은 에셋은 칸을 골라도 원래 컷 그대로 (빈 점선 원)
 */
const BG_COLORS = [
  { key: 'c1', label: '01', name: 'Standard', color: null },
  { key: 'c2', label: '02', suffix: '-color-01' },
  { key: 'c3', label: '03', suffix: '-color-02' },
  { key: 'c4', label: '04', suffix: '-color-03' },
  { key: 'c5', label: '05', suffix: '-color-04' },
  { key: 'c6', label: '06', suffix: '-color-05' },
  { key: 'c7', label: '07', name: 'Eco', suffix: '-eco' },
];

/** 그 줄에서 고를 수 있는 칸 — Dark 톤에는 Standard·Eco 컷이 없어 01 Standard · 07 Eco 를 숨긴다 */
const bgColorsFor = groupKey => BG_COLORS.filter(c => !((c.key === 'c1' || c.key === 'c7') && toneOf(groupKey) === 'dark'));
/** 그 줄에서 켜 보일 칸 — 고른 칸이 숨겨져 있으면 그 줄의 첫 칸 (Light 01 Standard · Dark 02) */
const bgColorOf = groupKey => { const list = bgColorsFor(groupKey); return list.some(c => c.key === state.bgColor) ? state.bgColor : list[0].key; };

/** 버전 — 왼쪽 팔레트 맨 위에서 고른다. */
const VERSIONS = [
  { key: 'in', label: 'Trade In' },
  { key: 'up', label: 'Trade Up' },
];

/** manifest.json — 구워 둔 에셋 id → 원본 크기. 없으면 그 박스는 빈 박스. */
let manifest = new Map();

/** 줄마다 고르는 톤 — Light 가 기본. Dark 에셋 id 는 끝에 -dark (build-assets.sh 와 맞춘다). */
const TONES = [
  { key: 'light', label: 'Light', icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>' },
  { key: 'dark', label: 'Dark', icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1z"/></svg>' },
];
const toneOf = groupKey => (ASSET_GROUPS.find(g => g.key === groupKey)?.tones && state.tone[groupKey]) || 'light';

/** 버전·톤까지 붙인 기본 에셋 id (Background Color 변형 전) */
const plainId = (v, groupKey, base) => `${v}-${base}${toneOf(groupKey) === 'dark' ? '-dark' : ''}`;
/** 그 변형 묶음(-np · -ni)이 하나라도 구워져 있나 */
const hasCut = id => manifest.has(id) || BG_COLORS.some(c => c.suffix && manifest.has(id + c.suffix));
/** 아이콘 없는 컷(-ni)이 구워진 에셋인가 — Basic 01 네 컷 (미리보기 오른쪽 위 Standard 토글) */
const hasNoIcon = (v, groupKey, base) => hasCut(plainId(v, groupKey, base) + '-ni');
/**
 * 고른 Background Color 칸의 변형(-eco 등)이 구워져 있으면 그 id, 아니면 기본 id.
 * 01-02 · 02-02 는 언제나 구형 제품을 뺀 컷(-np) — 구형 TV·냉장고는 나중에 따로 합성해 고정한다.
 * Standard 를 켜면 아이콘(과 구형 제품)이 없는 컷(-ni)에서 고른다.
 */
const assetId = (v, groupKey, base) => {
  let id = plainId(v, groupKey, base);
  // Dark 는 Standard 컷이 없다 — 고른 칸 대신 그 줄에서 켜 보일 칸(bgColorOf)의 변형으로
  const sfx = BG_COLORS.find(c => c.key === bgColorOf(groupKey))?.suffix;
  if (state.noIcon && hasCut(id + '-ni')) id += '-ni';
  else if (hasCut(id + '-np')) id += '-np';
  return sfx && manifest.has(id + sfx) ? id + sfx : id;
};

/** 한 버전의 팔레트 줄 — 공용 목록에 버전·톤 id, 그림 유무, 원본 크기를 입힌다. */
const groupsFor = v => ASSET_GROUPS.map(g => ({
  ...g,
  tone: toneOf(g.key),
  assets: g.assets.map(a => {
    const id = assetId(v, g.key, a.id);
    // 팔레트 썸네일은 변형(Eco 등)을 골라도 바뀌지 않는다 — 언제나 기본 컷
    const thumbId = plainId(v, g.key, a.id);
    const m = manifest.get(id);
    return { ...a, base: a.id, version: v, id, thumbId, stage: a.stageBy?.[v] ?? a.stage, previewCy: a.previewCyBy?.[v] ?? a.previewCy, art: !!m, size: m ? [m.w, m.h] : null };
  }),
}));

const ASSET_DIR = 'assets/trade-in-up';
/** 파일 이름 — 아이콘 없는 컷은 Trade In · Up 이 같은 그림이라 한 벌(ni-b1-…)만 구워 둔다: in-b1-01-02-dark-ni-color-01 → ni-b1-01-02-dark-color-01 */
const fileOf = id => id.replace(/^(?:in|up)-(.*?)-ni(?=-|$)/, 'ni-$1');
const thumbUrl = a => `${ASSET_DIR}/${fileOf(a.thumbId || a.id)}-thumb.jpg`;
const previewUrl = a => `${ASSET_DIR}/${fileOf(a.id)}-preview.jpg`;
const frameUrl = a => `${ASSET_DIR}/${fileOf(a.id)}-frame.jpg`;
const stageUrl = a => `${ASSET_DIR}/${fileOf(a.id)}-stage.jpg`;

/** 캔버스 미리보기 창 — 980:464 박스에 원본 높이의 1/3.3 (build-assets.sh 의 preview 와 같은 값). */
const PREVIEW_ZOOM = 3.3;
const PREVIEW_RATIO = 980 / 464;
const MAX_PRODUCTS = 6;
/** 제품마다 손잡이·탭 색 — 여러 개를 놓아도 어느 게 몇 번인지 보이게 (studio 와 같은 순서) */
const COLORS = ['#FD312E', '#2F6FE4', '#1F9D6B', '#8A5CF6', '#F08C00', '#0E9AAE'];
const colorOf = i => COLORS[i % COLORS.length];

/** 매체(Channel) — 3 단계에서 미리보기 아래 알약으로 고른다. 목록은 크리스마스 빌더와 같다. 매체별 사이즈는 나중에 */
const CHANNEL_ROWS = [
  ['ALL', 'LG.com', 'Criteo', 'DV360', 'Pmax', 'META', 'Google SEM', 'Twitch', 'Quantcast', 'ECRM'],
  ['Rakuten', 'Venngo', 'Perkopolis', 'Awin', 'Data Audience', 'Vase kupony', 'Plna penezenka', 'Tipli', 'Taiwan Affiliate', 'Telus Health'],
].map(row => row.map(label => ({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'), label })));

const CHANNEL_KEYS = Object.fromEntries(CHANNEL_ROWS.flat().filter(c => c.key !== 'all').map(c => [c.key, c.label]));

// 헤더 Working Files 버튼 링크 — 비어 있으면 흐린 채로 눌리지 않는다 (링크는 나중에)
const WORKING_FILES_URL = '';

/** 상단 스텝 — 크리스마스 빌더와 같은 구성. 누르면 그 화면으로 간다. 3 은 매체 고르기 (카피 편집은 나중에) */
const STEPS = ['Select Visual Type', 'Image Edit', 'Select Channel & Edit Copy'];
const STEP_READY = [true, true, true];
// 스텝 이름 아래 작은 안내
const STEP_HINTS = ['Pick an image on the left.', 'Edit the product and background on the right.', 'Pick your channels.'];

const versionLabel = v => VERSIONS.find(x => x.key === v)?.label ?? '';

const findAsset = id => {
  if (!id) return null;
  for (const g of groupsFor(id.split('-')[0])) {
    // 팔레트 칸 id(썸네일 id)로도 찾는다 — Dark 칸은 Standard 컷이 없어 칸 id 와 에셋 id 가 다르다
    const a = g.assets.find(x => x.id === id) || g.assets.find(x => x.thumbId === id);
    if (a) return { asset: a, group: g };
  }
  return null;
};

/**
 * i 동그라미 안내 (크리스마스 빌더와 같다) — 올리면 그림·영상 + 제목 + 설명 창이 뜨고, 누르면 고정된다.
 * img·video: 안내 그림·영상 경로 (assets/trade-in-up/ 기준, 영상은 소리 없이 반복). 둘 다 없으면 회색 자리만 보인다
 * 영상 원본은 source/호버/<이름>.mov — ffmpeg 로 1.5배속·폭 640·30fps·소리 없는 mp4 로 줄여 info/ 에 둔다
 */
// video 끝 ?v= — 영상을 바꾸면 숫자를 올린다 (브라우저가 옛 영상을 붙들고 있지 않게)
const INFO = {
  product: { title: 'Product & Shadow', video: 'info/product-shadow.mp4?v=2', img: null, text: 'Paste an LG.com product URL and the product image is fetched from the page for you. You can then move, resize and add shadows to it freely — on the preview and in the Edit panel on the right.' }, // 크리스마스 빌더 Product image 설명 그대로
  slot: { title: 'Products', video: 'info/product-slot.mp4?v=2', img: null, text: 'Paste an LG.com product URL and the product image is fetched from the page for you. You can then adjust its size and place it in each box.' },
};
const infoDot = key => `<span class="tb-info" data-info="${key}" role="button" tabindex="0" aria-label="About ${esc(INFO[key].title)}">i</span>`;

/** Edit panel 의 접이식 기능 박스. */
const EDIT_SECTIONS = [
  // fixed: 늘 펼쳐 두고 접지 않는다
  // boxTitle·boxDesc: Slot 에셋(박스에 제품을 넣는 방식)일 때 바꿔 보이는 이름
  // boxInfo: Slot 에셋일 때의 i 안내 (그림자 없음)
  { key: 'product', fixed: true, info: 'product', boxInfo: 'slot', boxTitle: 'Products', boxDesc: 'Add a product to each box on the stage.', title: 'Product & Shadow', desc: 'Import a product, place it on the stage and add a ground shadow.' },
  // 보류 — 배경 컬러를 고르는 방식으로 바꾸는 중. hidden: 빌더 화면에서만 숨긴다 (코드·기능은 그대로 — 다시 쓰려면 hidden 만 지운다)
  { key: 'scene', title: 'Scene Color', hidden: true, badge: '보류중 - 배경 컬러 선택방식으로 교체중', desc: 'Fill the TV screen and tint the background to match it.' },
];

/**
 * 제품 슬롯. 위치는 배경 대비 비율(dx, dy)로 들고 있어서 다른 에셋으로 바꿔도 자리가 이어진다.
 * eraser 만 배경 픽셀 좌표라 에셋을 바꾸면 버린다.
 */
const newSlot = i => ({
  product: null,   // ProductImage (productImportFlow.js) + img
  url: '',
  // 둘째부터는 좌우로 번갈아 비켜 놓는다 — 한자리에 겹쳐 나오면 뒤엣것을 못 찾는다
  place: { scale: 1, dx: i ? (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.1 : 0, dy: 0 },
  fx: cloneFx(DEFAULT_FX),
  eraser: null,
  // 색 소스 영역. quadN: 제품 사각형 기준 0~1 네 점, infill: 그 영역을 제품 사진에서 펴서 잘라낸 것,
  // method: 1(화면 클릭 자동 감지) | 2(네 점 직접) — 패널에서 어느 카드에 불을 켤지
  screen: { quadN: null, infill: null, infillId: 0, method: null },
});

/**
 * open    : 펼쳐진 기능 박스 key — 둘 다 동시에 열어둘 수 있다.
 * bg      : 지금 에셋의 합성 바탕 { assetId, id, w, h, px, scene }
 *           px: createBackground() 결과, scene: 색 보정이 읽는 형태 (infill.js readImage 와 같은 모양)
 * active  : 프리뷰 크기 조절 상자 · Shadow · Screen 이 다루는 슬롯
 * picking : 화면 모서리를 찍는 중인 슬롯 번호, pickPts: 찍은 점 (배경 좌표)
 * objects : 배경 속 오브젝트(단상·소품) 마스크 캔버스 — 알파 = 오브젝트. 에셋을 고를 때 자동 감지하고,
 *           Object tint 만큼만 물든다 (손으로 고치는 브러시는 뺐다)
 * 색 소스 화면 영역은 한 번에 하나 — 다른 제품에서 고르면 이전 것은 지운다
 */
const state = {
  version: 'in',
  tone: {}, // 줄 key → 'light' | 'dark' (없으면 light)
  bgColor: 'c1', // 고른 Background Color 칸 key — 01 Standard 가 기본
  noIcon: false, // Standard — 아이콘 없는 컷 (-ni) 으로 본다. 에셋을 새로 고르면 꺼진다
  selectedId: null,
  step: 0, // 상단 스텝 (0 부터) — 에셋을 고르면 1, 미리보기 아래 OK 를 누르면 2
  channel: null, // 3 단계에서 고른 매체 key
  copy: newCopyState(), // 매체를 고르면 Edit panel 에 뜨는 Copy 값 (lib/channelCopy.js) — 매체를 바꿔도 이어진다
  // 글자 모드는 판 종류마다 따로 — Main Key Visual 은 Light(흰 글자), Product Slot 은 밝은 배경이라 Dark(검은 글자)가 기본. copy.textMode 는 지금 판 종류 값을 옮겨 둔 것
  textModes: { kv: 'light', pslot: 'dark' },
  open: new Set(['product']), // Product & Shadow 는 늘 펼쳐 둔다 (EDIT_SECTIONS fixed)
  fxOpen: false, // 고른 제품 줄 아래 Shadow 드롭다운을 펼쳤나
  guide: false, // 프리뷰에서 고른 제품에 크기 조절 상자를 띄웠나 (배경을 누르면 끈다)
  bg: null,
  slots: [newSlot(0)], // 지금 에셋의 제품 칸 — Main Key Visual 은 kvSlots, Slot 은 boxSlots 를 가리킨다
  active: 0,
  erasing: false,
  eraseMode: 'erase',
  eraseSize: 40,
  picking: null,
  pickPts: [],
  sampling: false, // 제품 화면을 클릭해 색 소스로 잡는 중
  mood: { on: true, strength: 60, vivid: 30, objectAmount: 15, glow: 25, centerClear: 50, floorAmount: 30 },
  objects: null,
  objVersion: 0,
};
// 제품 칸 두 벌 — Main Key Visual(자유 배치) · Slot(박스). state.slots 는 지금 에셋 쪽을 가리킨다 (useSlotsFor)
state.kvSlots = state.slots;
state.boxSlots = [];

const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const IMAGE_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>';
const CHEVRON = '<svg class="tb-acc-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

/** where: 'product' | 'scene' — 메시지는 그 기능 박스 안에 뜬다 */
function setStatus(msg, isError = false, where = 'product') {
  const el = $(where === 'scene' ? '#sceneStatus' : '#status');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('error', isError);
}

// ── 배치 계산 ─────────────────────────────────────────────

/**
 * 제품이 놓일 사각형 (배경 픽셀). 발끝을 바닥선에 맞추고 가로 중심에 세운다.
 * 크기를 바꾸면 발끝이 그대로인 채 커지고 작아진다 — 단상 위에 선 채로.
 */
/** 박스 안 최소 여백 — 박스 짧은 변의 10% 를 사방에 비운다 (세일즈 배너 빌더 Product Slot 의 padding 10% 와 같다). 크롭에서 남긴 여백은 그 안쪽에 더해진다 */
const BOX_PAD = 0.1;

function productRect(slot) {
  const hit = findAsset(state.selectedId);
  if (!state.bg || !slot.product) return null;
  // Slot 에셋 — 제 번호 박스 안에 비율대로 꽉 맞춰 가운데 놓는다 (옮기기·크기 조절 없음)
  const boxes = hit?.asset.boxes;
  if (boxes) {
    const b = boxes[state.slots.indexOf(slot)];
    if (!b) return null;
    const { w: W, h: H } = state.bg;
    const pad = Math.min(b.w * W, b.h * H) * BOX_PAD;
    const bw = b.w * W - pad * 2, bh = b.h * H - pad * 2;
    const k = Math.min(bw / slot.product.w, bh / slot.product.h);
    const w = slot.product.w * k, h = slot.product.h * k;
    return { x: b.x * W + (b.w * W - w) / 2, y: b.y * H + (b.h * H - h) / 2, w, h };
  }
  if (!hit?.asset.stage) return null;
  const { w: W, h: H } = state.bg;
  const st = hit.asset.stage;
  const h = st.h * H * slot.place.scale;
  const w = h * (slot.product.w / slot.product.h);
  const cx = (st.cx + slot.place.dx) * W;
  const bottom = (st.bottom + slot.place.dy) * H;
  return { x: cx - w / 2, y: bottom - h, w, h };
}

/** 미리보기 창 (배경 픽셀) — 원본 높이의 1/PREVIEW_ZOOM (에셋에 previewZoom 이 있으면 그 값). 세로 중심은 에셋의 previewCy (기본 가운데). */
function previewWindow() {
  const { w, h } = state.bg;
  const asset = findAsset(state.selectedId)?.asset;
  const ch = h / (asset?.previewZoom ?? PREVIEW_ZOOM);
  const cw = Math.min(w, ch * PREVIEW_RATIO);
  const cy = asset?.previewCy ?? 0.5;
  return { x: (w - cw) / 2, y: cy * h - ch / 2, w: cw, h: ch };
}

// ── 렌더 (에셋을 고를 때 화면 뼈대를 다시 만든다) ─────────────────

function renderSteps() {
  const active = state.selectedId ? state.step : 0;
  $('#stepBack').disabled = active === 0;
  syncStepLock();
  $('#steps').innerHTML = STEPS.map((label, i) => {
    // 에셋을 고르기 전에는 1 만 누를 수 있다
    const why = !STEP_READY[i] ? 'Coming soon' : i > 0 && !state.selectedId ? 'Pick a visual type first' : '';
    return `
    ${i > 0 ? '<div class="tb-step-line"></div>' : ''}
    <button type="button" class="tb-step${i === active ? ' active' : ''}" data-step="${i}"${why ? ` disabled title="${why}"` : ''}>
      <span class="tb-step-num">${i + 1}</span>
      <span class="tb-step-text"><span class="tb-step-label">${esc(label)}</span><span class="tb-step-hint">${esc(STEP_HINTS[i])}</span></span>
    </button>`;
  }).join('');
}

/** 3 단계부터는 장면을 잠그고(손잡이·끌기 꺼짐) 미리보기 아래가 OK 안내 → 매체 목록으로 바뀐다 */
function syncStepLock() {
  $('#overlay')?.classList.toggle('locked', state.step !== 1);
  const gate = $('#channelGate'), body = $('#channelBody');
  if (gate && body) { gate.hidden = state.step >= 2; body.hidden = state.step < 2; }
  renderSlots();
}

/** 스텝을 누르면 그 화면으로 — 1 팔레트, 2 Edit panel 의 Product & Shadow, 3 미리보기 아래 매체 */
function goStep(i) {
  const changed = state.step !== i;
  state.step = i;
  renderSteps();
  // 단계가 바뀌면 Edit panel 도 — 2 단계에만 Background Color, 3 단계에서 매체를 골랐으면 Copy 패널
  if (changed && state.selectedId) { renderEdit(); buildProductList(); update(); }
  if (i === 0) {
    const cell = $('#palette .tb-cell.selected') || $('#palette .tb-cell');
    cell?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    cell?.focus({ preventScroll: true });
  } else if (i === 1) {
    $('#editBody .tb-acc[data-key="product"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (i === 2) {
    const box = $('.tb-channels');
    box?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    box?.classList.remove('flash');
    void box?.offsetWidth; // 애니메이션을 다시 걸려고 한 번 읽는다
    box?.classList.add('flash');
  }
}
if (WORKING_FILES_URL) {
  const wf = $('#workingFiles');
  Object.assign(wf, { href: WORKING_FILES_URL, title: '' });
  wf.removeAttribute('aria-disabled');
}
$('#stepBack').addEventListener('click', () => { if (state.selectedId && state.step > 0) goStep(state.step - 1); });
$('#steps').addEventListener('click', e => {
  const btn = e.target.closest('[data-step]');
  if (btn && !btn.disabled) goStep(Number(btn.dataset.step));
});

function renderPalette() {
  // 맨 위 버전 전환 — 아래 목록은 두 버전이 같은 배치다
  const versionSeg = `
    <div class="seg tb-version" role="tablist" aria-label="Version">
      ${VERSIONS.map(v => `<button type="button" role="tab" data-version="${v.key}" class="${state.version === v.key ? 'on' : ''}" aria-selected="${state.version === v.key}">${v.label}</button>`).join('')}
    </div>`;
  // 세로형을 보고 있어도 팔레트의 Product Slot 칸은 골라진 채로
  const sel = findAsset(state.selectedId);
  const selBase = sel?.asset.base, selGroup = sel?.group.key;
  const cellOf = (g, a, t) => {
    // 톤 줄은 Light · Dark 칸을 따로 그린다 — 지금 톤 칸은 고른 id 그대로, 다른 톤 칸은 그 톤의 기본 컷
    const cur = !t || g.tone === t.key;
    const id = cur ? a.id : `${a.version}-${a.base}${t.key === 'dark' ? '-dark' : ''}`;
    const thumb = cur ? a : { id, thumbId: id };
    // Dark 는 Standard 컷이 없어 manifest 에 -dark 가 없다 — 컬러 변형이 하나라도 있으면 타일이 있다
    const art = cur ? a.art : manifest.has(id) || BG_COLORS.some(c => c.suffix && manifest.has(id + c.suffix));
    const on = cur && (state.selectedId === a.id || (a.layouts && a.layouts.includes(selBase) && selGroup === g.key));
    return `
          <button type="button" class="tb-cell${on ? ' selected' : ''}" data-id="${id}"${t ? ` data-group="${g.key}" data-tone="${t.key}"` : ''}>
            <span class="tb-tile${art ? ' has-art' : ''}">${art ? `<img src="${thumbUrl(thumb)}" alt="${esc(a.label)}" loading="lazy" draggable="false" />` : ''}</span>
            ${a.noCaption ? '' : `<span class="tb-caption">${t ? `<span class="tb-tone-dot tb-tone-${t.key}">${t.icon}</span>` : ''}${esc(a.label)}</span>`}
          </button>`;
  };
  // 묶음 — 박스의 section 에서 새 묶음을 연다 (Main Key Visual _Wide · _Tall). 없으면 줄 하나가 한 묶음
  //   톤 줄은 Light 칸 줄 · Dark 칸 줄을 차례로, 안내(noteAfter)는 칸 아래에
  const sections = [];
  for (const g of groupsFor(state.version).filter(g => !g.hidden)) {
    for (const a of g.assets.filter(a => !a.hidden)) {
      if (a.section || sections.at(-1)?.group !== g) sections.push({ group: g, label: a.section ?? g.label, list: [], notes: [] });
      sections.at(-1).list.push(a);
      if (a.noteAfter) sections.at(-1).notes.push(a.noteAfter);
    }
  }
  $('#palette').innerHTML = versionSeg + sections.map(({ group: g, label, list, notes }) => `
    <section class="tb-group">
      <p class="tb-group-label">${esc(label)}</p>
      <div class="tb-grid">${g.tones ? TONES.map(t => list.map(a => cellOf(g, a, t)).join('')).join('') : list.map(a => cellOf(g, a)).join('')}
      </div>${notes.map(n => `
      <p class="tb-grid-note">${esc(n)}</p>`).join('')}
    </section>`).join('');
}

function renderCanvas() {
  const hit = findAsset(state.selectedId);
  if (!hit) {
    $('#canvas').innerHTML = `
      <div class="tb-empty">
        <div>
          <p class="tb-empty-title">Canvas</p>
          <p>Pick an asset on the left to preview it.</p>
          <p>You can preview the image being edited.</p>
        </div>
      </div>`;
    return;
  }
  const { asset, group } = hit;
  // 합성 바탕이 뜨기 전까지는 구워 둔 미리보기 이미지가 자리를 지킨다
  $('#canvas').innerHTML = `
    <div class="tb-preview">
      <div class="tb-preview-art">
        ${asset.art
          ? `<img src="${previewUrl(asset)}" alt="${esc(asset.label)}" draggable="false" />
             <div class="tb-scene" id="scene" hidden>
               <canvas id="comp"></canvas>
               <div class="overlay" id="overlay">
                 <canvas id="eraseView"></canvas>
                 <svg id="quadSvg" preserveAspectRatio="none"><polygon /></svg>
                 <div id="handles"></div>
                 <div id="brushCursor" hidden></div>
               </div>
             </div>
             ${hasNoIcon(asset.version, group.key, asset.base) ? `
               <div class="tb-example-toggle" role="group" aria-label="Icon">
                 <button type="button" data-noicon${state.noIcon ? ' class="on"' : ''} aria-pressed="${state.noIcon}">Standard</button>
               </div>` : ''}`
          : `${IMAGE_ICON}<span>Artwork coming soon</span>`}
      </div>
      <div class="tb-preview-foot">
        <p class="name">${esc(asset.label)}</p>
        <p class="meta">${esc(versionLabel(asset.version))} · ${esc(group.label)}</p>
      </div>
    </div>
    ${channelPicker()}`;
  productEls.length = 0;
  syncStepLock();
}

/**
 * 매체(Channel) 고르기 — 미리보기 아래 (크리스마스 빌더와 같은 모양).
 * 2 단계에서는 OK 안내, OK 를 누르면 3 단계로 넘어가 매체 목록이 열린다. 매체별 사이즈는 아직 없어 Coming soon
 */
function channelPicker() {
  return `
    <div class="tb-channels">
      <p class="tb-channels-label">Channel</p>
      <div class="tb-channel-gate" id="channelGate"${state.step >= 2 ? ' hidden' : ''}>
        <p class="tb-channels-note">The image can’t be changed in later steps. When you finish editing it in the Edit panel on the right, press OK to go on to channel selection.</p>
        <button type="button" class="btn tb-channel-open" data-act="open-channels">OK</button>
      </div>
      <div class="tb-channels-body" id="channelBody"${state.step < 2 ? ' hidden' : ''}>
        <div class="tb-channels-list">
          ${CHANNEL_ROWS.map(row => `
            <div class="tb-channels-row">
              ${row.map(c => `<button type="button" class="tb-channel${state.channel === c.key ? ' on' : ''}" data-channel="${c.key}">${esc(c.label)}</button>`).join('')}
            </div>`).join('')}
        </div>
      </div>
    </div>
    <div class="tb-slots" id="slots" hidden></div>`;
}

/**
 * 매체 사이즈 미리보기 — 3 단계에서 고른 매체의 사이즈를 미리보기 아래에 모두 그린다 (lib/channelSlots.js, 크리스마스 빌더와 같다).
 * Main Key Visual 의 Wide Product 01 · 02 는 Figma "Trade In Up - Main Key Visual 01" 보드, Tall Product 01 · 02 는 "… 02" 보드 데이터.
 * 바탕은 제품까지 합성한 3000² 완성 컷(#comp). 컬러·톤이 바뀌어도 빈 영역은 그 컷의 가장자리로, 그라데이션은 그 컷의 벽 색으로 맞춘다.
 * 카피는 매체를 고르면 Edit panel 에 뜨는 Copy 패널(state.copy) 값 — 비어 있으면 Figma 자리 표시 문구.
 */
// 에셋 → 보드 ('tall' = Main Key Visual 02, '' = 01). Product Slot 줄(group 'slot')은 'pslot' — 세로형·가로형 어느 쪽이든 Product Slot 01 · 02 보드
const SLOT_ASSETS = new Map([['b1-01-01', ''], ['b1-01-02', ''], ['b1-02-01', 'tall'], ['b1-02-02', 'tall']]);
const boardOf = hit => hit.group.key === 'slot' ? 'pslot' : SLOT_ASSETS.get(hit.asset.base);
/** 지금 판 종류의 글자 모드를 copy 에 옮긴다 — Copy 패널·매체 미리보기를 그리기 전에 */
const textKind = () => findAsset(state.selectedId)?.group.key === 'slot' ? 'pslot' : 'kv';
const syncTextMode = () => { state.copy.textMode = state.textModes[textKind()]; };
// Product Slot 판 아이콘 — 버전 × (Background Color 07 Eco 면 나무, 아니면 클리어). 처음 읽히면 다시 그린다
const slotIcons = new Map();
function slotIcon(version) {
  const src = `assets/trade-in-up/slot-icon/${version}-${bgColorOf('slot') === 'c7' ? 'wood' : 'clear'}.png`;
  if (!slotIcons.has(src)) {
    const img = new Image();
    img.onload = () => renderSlots();
    img.src = src;
    slotIcons.set(src, img);
  }
  return slotIcons.get(src);
}
// Product Slot 판 배경 이미지 — Background Color 02~06 에 배경 컷이 구워져 있으면 (build-assets.sh slot-bg). 없으면 null = 바탕색
function slotBg(version) {
  const sfx = BG_COLORS.find(c => c.key === bgColorOf('slot'))?.suffix;
  if (!sfx?.startsWith('-color-') || !manifest.has(`${version}-slot-v${sfx}`)) return null;
  const src = `assets/trade-in-up/slot-bg/${sfx.slice(1)}.jpg`;
  if (!slotIcons.has(src)) {
    const img = new Image();
    img.onload = () => renderSlots();
    img.src = src;
    slotIcons.set(src, img);
  }
  return slotIcons.get(src);
}
// LG.com 은 히어로 두 장(1920×720 → 720×960)을 맨 앞에
const HERO_PC = 'lgcom-ST0001-pc-1920x720', HERO_MO = 'lgcom-ST0001-mo-720x960';
const heroFirst = list => [...list.filter(s => s.key === HERO_PC), ...list.filter(s => s.key === HERO_MO), ...list.filter(s => s.key !== HERO_PC && s.key !== HERO_MO)];

/**
 * 그라데이션 색 — Figma 의 #9C9185 는 기본 컷(Standard Light) 벽 색 (218,211,203) 에서 채널마다 이 비율만큼 어두운 색이다.
 * 다른 컬러·톤은 그 컷의 벽 색에서 같은 방향으로 FADE_DEPTH 만큼만 (너무 어둡지 않게 — 사용자 요청) 어둡게 한다
 */
const FADE_RATIO = [156 / 218.4, 145 / 210.5, 133 / 202.8];
const FADE_DEPTH = 0.7;
let artVersion = 0;
function fadeColorFor(comp) {
  const c = document.createElement('canvas');
  c.width = c.height = 300;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(comp, 0, 0, 300, 300);
  // 벽 — 왼쪽 위 (제품이 들어오지 않는 자리, 위 기준값을 잰 곳과 같다)
  const d = g.getImageData(15, 15, 75, 75).data;
  const sum = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) { sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; }
  const n = d.length / 4;
  const base = state.bgColor === 'c1' && toneOf('basic-01') === 'light';
  const k = base ? 1 : FADE_DEPTH;
  return '#' + sum.map((v, i) => Math.round((v / n) * (1 - k * (1 - FADE_RATIO[i]))).toString(16).padStart(2, '0')).join('');
}

let slotsQueued = false;
function renderSlots() {
  if (slotsQueued) return;
  slotsQueued = true;
  requestAnimationFrame(() => {
    slotsQueued = false;
    const box = $('#slots');
    if (!box) return;
    syncTextMode();
    const hit = findAsset(state.selectedId);
    const on = state.step >= 2 && state.channel && hit;
    box.hidden = !on;
    if (!on) return;
    const board = boardOf(hit);
    if (board == null) {
      box.innerHTML = '<p class="tb-slots-empty">Sizes for this visual are coming soon.</p>';
      box.dataset.keys = '';
      return;
    }
    const slots = state.channel === 'all'
      ? Object.keys(CHANNEL_KEYS).flatMap(k => heroFirst(slotsForChannel(k, board)))
      : heroFirst(slotsForChannel(state.channel, board));
    if (!slots.length) {
      box.innerHTML = '<p class="tb-slots-empty">Sizes for this channel are coming soon.</p>';
      box.dataset.keys = '';
      return;
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // LG.com 히어로 두 장(1920×720 · 720×960)은 같은 높이로 한 줄에 나란히 — 미리보기 폭에 꽉 차게
    const avail = Math.min(1200, box.clientWidth || 900);
    const heroH = Math.min(720, (avail - 16) / (1920 / 720 + 720 / 960));
    const keys = `${dpr}|${Math.round(heroH)}|${slots.map(sl => sl.key).join()}`;
    if (box.dataset.keys !== keys) {
      box.dataset.keys = keys;
      box.innerHTML = slots.map((sl, i) => {
        const hero = sl.key === HERO_PC || sl.key === HERO_MO;
        const k = hero ? heroH / sl.h : Math.min(1, 360 / Math.max(sl.w, sl.h));
        const head = state.channel === 'all' && sl.label !== slots[i - 1]?.label ? `<p class="tb-slots-group">${esc(sl.label)}</p>` : '';
        return `${head}
        <figure class="tb-slot">
          <canvas width="${Math.round(sl.w * k * dpr)}" height="${Math.round(sl.h * k * dpr)}" data-slot="${esc(sl.key)}" style="width:${sl.w * k}px"></canvas>
          <figcaption>${esc(sl.key)}</figcaption>
        </figure>${sl.key === HERO_MO ? '<div class="tb-slots-break"></div>' : ''}`;
      }).join('');
    }
    const pslot = board === 'pslot';
    const comp = !pslot && state.bg?.assetId === state.selectedId ? $('#comp') : null;
    const fadeColor = comp ? fadeColorFor(comp) : null;
    // Product Slot 판 — 칸 제품은 지금 Slot 칸(boxSlots) 그대로, 배경은 Standard 01 바탕색 · 컬러 02~06 은 그 배경 이미지
    const pslotOpts = pslot ? { icon: slotIcon(hit.asset.version), products: state.boxSlots.map(s => s.product), bg: '#F0ECE4', bgImg: slotBg(hit.asset.version) } : {};
    const canvases = box.querySelectorAll('canvas[data-slot]');
    slots.forEach((sl, i) => {
      const c = canvases[i];
      if (!c) return;
      const ctx = c.getContext('2d');
      ctx.setTransform(c.width / sl.w, 0, 0, c.height / sl.h, 0, 0);
      drawSlot(ctx, sl, comp, state.copy, { fadeColor, artVersion, ...pslotOpts });
    });
  });
}
// 글꼴·로고가 늦게 읽히면 한 번 더
Promise.all([document.fonts.load('600 20px "LGEI Headline"'), document.fonts.load('400 20px "LGEI Text"'), logosReady()]).then(() => renderSlots());
onIconLoad(() => renderSlots());

/** Product Slot 배치 넘기기 — Edit panel 이미지 양옆 화살표 + 아래 점. 넘기면 프리뷰·이미지가 그 배치로 바뀌고 제품은 그대로 */
function layoutNav(asset) {
  const list = asset.layouts;
  if (!list || list.length < 2) return '';
  const at = list.indexOf(asset.base);
  const arrow = (d, path) => `<button type="button" class="tb-layout-arrow ${d < 0 ? 'prev' : 'next'}" data-layout-step="${d}" aria-label="${d < 0 ? 'Previous' : 'Next'} layout"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="${path}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
  return `${arrow(-1, 'M10 3L5 8l5 5')}${arrow(1, 'M6 3l5 5-5 5')}
    <div class="tb-layout-dots">${list.map((_, k) => `<i${k === at ? ' class="on"' : ''}></i>`).join('')}</div>`;
}

function renderEdit() {
  const hit = findAsset(state.selectedId);
  if (!hit) {
    $('#editBody').innerHTML = '';
    return;
  }
  // 매체를 골라 3 단계에 있으면 Edit panel 은 그 매체의 Copy 패널 (크리스마스 빌더와 같다)
  const channel = state.step >= 2 && CHANNEL_ROWS.flat().find(c => c.key === state.channel);
  if (channel) {
    syncTextMode();
    $('#editBody').innerHTML = renderCopyPanel(state.copy, channel);
    return;
  }
  const { asset, group } = hit;
  $('#editBody').innerHTML = `
    <div class="tb-edit-asset">
      <p class="name">${esc(asset.label)}</p>
      <p class="meta">${esc(versionLabel(asset.version))} · ${esc(group.label)}${asset.size ? ` · ${asset.size[0]} × ${asset.size[1]}` : ''}</p>
      ${asset.art ? `<div class="tb-edit-frame"><img src="${frameUrl(asset)}" alt="${esc(asset.label)}" draggable="false" /><canvas id="frameView" hidden></canvas>${layoutNav(asset)}</div>` : ''}
      ${group.bgColors && state.step === 1 /* Background Color 는 2 단계(Image Edit)에서만 */ ? `
        <div class="tb-bgcolor">
          <p class="tb-acc-item-label">Background Color</p>
          <div class="tb-bgcolor-row" role="radiogroup" aria-label="Background color">
            ${bgColorsFor(group.key).map((c, n) => {
              // 칸 그림 — 이 에셋(버전·톤)의 그 변형에서 잘라 둔 컬러 조각
              const sid = (c.key === 'c1' || c.suffix) ? plainId(asset.version, group.key, asset.base) + (c.suffix || '') : null;
              const sw = sid && manifest.get(sid)?.swatch ? `${ASSET_DIR}/${sid}-swatch.jpg` : null;
              return `
              <button type="button" role="radio" class="tb-bgcolor-item${bgColorOf(group.key) === c.key ? ' on' : ''}" aria-checked="${bgColorOf(group.key) === c.key}" data-bgcolor="${c.key}">
                <span class="tb-bgcolor-dot${sw ? '' : ' empty'}"${sw ? ` style="background-image:url('${sw}')"` : ''}></span>
                <span class="tb-bgcolor-label">${/* 번호는 보이는 칸 순서대로 — Dark 는 Standard 가 없어 02 부터가 01 */ String(n + 1).padStart(2, '0')}${c.name ? `<br>${esc(c.name)}` : ''}</span>
              </button>`;
            }).join('')}
          </div>
        </div>` : ''}
    </div>
    ${EDIT_SECTIONS.map(sec => `
      <section class="tb-acc${state.open.has(sec.key) || sec.fixed ? ' open' : ''}${sec.fixed ? ' fixed' : ''}" data-key="${sec.key}"${sec.hidden ? ' hidden style="display:none"' : ''}>
        <button type="button" class="tb-acc-head" aria-expanded="${state.open.has(sec.key) || !!sec.fixed}"${sec.fixed ? ' tabindex="-1"' : ''}>
          <span class="tb-acc-text">
            <span class="tb-acc-title">${esc(asset.boxes && sec.boxTitle || sec.title)}${(asset.boxes ? sec.boxInfo : sec.info) ? infoDot(asset.boxes ? sec.boxInfo : sec.info) : ''}</span>
            ${sec.badge ? `<span class="tb-acc-badge">${esc(sec.badge)}</span>` : ''}
            <span class="tb-acc-desc">${esc(asset.boxes && sec.boxDesc || sec.desc)}</span>
          </span>
          ${CHEVRON}
        </button>
        <div class="tb-acc-body"><div class="tb-acc-inner">
          ${!asset.art
            ? '<div class="tb-acc-item"><div class="tb-acc-slot">Available once the artwork lands.</div></div>'
            : sec.key === 'product' ? (asset.boxes ? SLOT_PANEL : PRODUCT_PANEL) : SCENE_PANEL}
        </div></div>
      </section>`).join('')}`;
}

/**
 * Product & Shadow 박스 안 — Product Image. 옮기기·크기·지우기는 프리뷰에서 (크기 조절 상자 — 크리스마스 빌더와 같다)
 * Shadow 패널(#fxPanel)은 하나만 두고, 고른 제품 줄 바로 아래로 옮겨 드롭다운처럼 펼친다 (placeFxPanel — 크리스마스 빌더와 같다)
 * 톤 매치·바닥 반사는 뺐다 (composite.js 기본값도 꺼 둠)
 */
const PRODUCT_PANEL = `
  <div class="tb-acc-item">
    <p class="tb-acc-item-label">Product Image</p>
    <div class="list" id="productList"></div>
    <button type="button" class="btn ghost full" data-act="add-product">+ Add product</button>
    <p class="status" id="status"></p>
  </div>

  <div id="fxPark" hidden></div>

  <div class="tb-fx-drop" id="fxPanel" hidden>

    <div class="field">
      <div class="field-row"><span>Surface</span></div>
      <div class="seg" data-seg="surface">
        <button type="button" data-v="floor">Floor</button>
        <button type="button" data-v="wall">Wall</button>
        <button type="button" data-v="both">Floor + Wall</button>
      </div>
      <p class="hint" id="surfaceHint"></p>
    </div>

    <div class="field">
      <div class="field-row"><span>Shadow direction</span></div>
      <div class="seg" data-seg="direction">
        <button type="button" data-v="left">← Left</button>
        <button type="button" data-v="center">Center</button>
        <button type="button" data-v="right">Right →</button>
      </div>
    </div>

    <div class="fx-card" data-show="floor" data-toggle="contact.on">
      <label class="fx-head"><input type="checkbox" data-fx="contact.on" /> Contact shadow</label>
      <label class="fx-slider"><span>Strength</span><input type="range" min="0" max="100" data-fx="contact.strength" /><output></output></label>
    </div>

    <div class="fx-card" data-show="floor" data-toggle="floor.on">
      <label class="fx-head"><input type="checkbox" data-fx="floor.on" /> Floor shadow</label>
      <label class="fx-slider"><span>Strength</span><input type="range" min="0" max="100" data-fx="floor.strength" /><output></output></label>
      <label class="fx-slider"><span>Softness</span><input type="range" min="0" max="100" data-fx="floor.softness" /><output></output></label>
      <label class="fx-slider"><span>Length</span><input type="range" min="0" max="100" data-fx="floor.length" /><output></output></label>
    </div>

    <div class="fx-card" data-show="wall">
      <p class="fx-head">Wall shadow</p>
      <label class="fx-slider"><span>Strength</span><input type="range" min="0" max="100" data-fx="wall.strength" /><output></output></label>
      <label class="fx-slider"><span>Depth</span><input type="range" min="0" max="100" data-fx="wall.depth" /><output></output></label>
      <label class="fx-slider"><span>Vertical</span><input type="range" min="-50" max="50" data-fx="wall.offsetY" /><output></output></label>
      <p class="hint">Depth = distance from the wall (product thickness). Vertical moves the shadow up (−) or down (+).</p>
    </div>

    <div class="fx-card" id="eraserCard">
      <p class="fx-head">Shadow eraser</p>
      <button id="eraseToggle" type="button" class="btn ghost full" data-act="erase-toggle">Paint to erase shadow</button>
      <div class="seg" id="eraseMode">
        <button type="button" data-v="erase">Erase</button>
        <button type="button" data-v="restore">Restore</button>
      </div>
      <label class="fx-slider"><span>Brush</span><input id="eraseSize" type="range" min="5" max="200" value="40" /><output></output></label>
      <button id="eraseClear" type="button" class="link" data-act="erase-clear">Clear erased areas</button>
      <p class="hint">Erased areas stay fixed on the background — move the product and they still block the shadow there.</p>
    </div>

    <div class="row">
      <button type="button" class="btn ghost" data-act="fx-reset">Reset</button>
      <button type="button" class="btn ghost" style="flex:1" data-act="fx-all">Apply to all</button>
    </div>
  </div>`;


/** Slot 에셋의 Products 박스 안 — 박스마다 제품 하나 (블프 PD Slot 과 같은 방식). 그림자·배치 없음 */
const SLOT_PANEL = `
  <div class="tb-acc-item">
    <p class="tb-acc-item-label">Products</p>
    <p class="hint">One product per box — it fits inside the box automatically.</p>
    <div class="list" id="productList"></div>
    <p class="status" id="status"></p>
  </div>`;

/** Scene Color 박스 안 — studio.html 의 Screen infill / Color mood / Background objects 와 같은 구성. */
const SCENE_PANEL = `
  <div class="tb-acc-item" id="screenPanel">
    <div class="group-row">
      <p class="tb-acc-item-label">Screen Area</p>
      <span class="fx-for">Product <b id="screenFor">1</b></span>
    </div>
    <!-- 화면을 고르는 두 방법 — 지금 쓰는 쪽 카드에 불이 들어온다 -->
    <div class="tb-method" id="method1">
      <div class="tb-method-head"><span class="tb-method-num">1</span><p>Screen Select 1 <span>· Keep the product screen</span></p></div>
      <p class="hint">Click the TV screen on the canvas. The background takes its colors — the screen itself is kept as is.</p>
      <button id="sampleScreen" type="button" class="btn ghost full" data-act="sample-screen">Click the screen</button>
    </div>
    <div class="tb-method" id="method2">
      <div class="tb-method-head"><span class="tb-method-num">2</span><p>Screen Select 2 <span>· Mark the area by hand</span></p></div>
      <p class="hint">Click four corners on the canvas to mark the area yourself. The background takes the colors inside it — nothing is replaced. Drag the points to adjust.</p>
      <button id="setCorners" type="button" class="btn ghost full" data-act="set-corners">Set four points</button>
    </div>
    <button type="button" class="link tb-clear-screen" data-act="clear-screen">Clear screen</button>
    <p class="status" id="sceneStatus"></p>
  </div>

  <div class="tb-acc-item" id="moodPanel">
    <div class="group-row">
      <p class="tb-acc-item-label">Color Mood</p>
      <!-- 물들이기 전/후 비교 — Before 는 원래 무대, 영역·설정은 그대로 남는다 -->
      <div class="seg tb-ba" data-mseg="on" title="Compare the background before and after coloring">
        <button type="button" data-v="before">Before</button>
        <button type="button" data-v="after">After</button>
      </div>
    </div>
    <p class="hint" id="moodSourceHint">Pick a screen area (Screen Select 1 or 2 above) to color the background from it.</p>
    <label class="fx-slider"><span>Strength</span><input type="range" min="0" max="100" data-m="strength" /><output></output></label>
    <label class="fx-slider"><span>Vividness</span><input type="range" min="0" max="100" data-m="vivid" /><output></output></label>
    <label class="fx-slider"><span>Object tint</span><input type="range" min="0" max="100" data-m="objectAmount" /><output></output></label>
    <label class="fx-slider"><span>Screen glow</span><input type="range" min="0" max="100" data-m="glow" /><output></output></label>
    <label class="fx-slider"><span>Center clear</span><input type="range" min="0" max="100" data-m="centerClear" /><output></output></label>
    <label class="fx-slider"><span>Floor tint</span><input type="range" min="0" max="100" data-m="floorAmount" /><output></output></label>
    <p class="hint">Object tint = how much the stands and props take the color. Center clear keeps the area around the screen clean; Floor tint colors the floor below the product.</p>
  </div>`;

/** 에셋을 고르거나 풀 때 — 화면 뼈대를 다시 만들고 합성 바탕을 불러온다. */
function selectAsset(id) {
  state.selectedId = id;
  useSlotsFor(findAsset(id)?.asset);
  // 톤·버전·Background Color 를 바꿔 같은 자리의 다른 컷으로 갈아 끼울 때는 스텝을 그대로 둔다 (팔레트 클릭은 1 로)
  state.step = id ? Math.max(state.step, 1) : 0;
  state.erasing = false;
  state.sampling = false;
  state.picking = null;
  state.pickPts = [];
  renderSteps();
  renderPalette();
  renderCanvas();
  renderEdit();
  buildProductList();
  update();
  const hit = findAsset(id);
  if (hit?.asset.art) void loadStage(hit.asset);
}

/**
 * Main Key Visual(자유 배치 + 그림자)과 Slot(박스마다 제품 하나)은 제품 칸을 따로 든다 — 오가도 서로 섞이지 않게.
 * Slot 은 박스 수만큼 칸을 채워 둔다
 */
function useSlotsFor(asset) {
  if (!asset) return;
  const list = asset.boxes ? state.boxSlots : state.kvSlots;
  if (asset.boxes) while (list.length < asset.boxes.length) list.push(newSlot(list.length));
  if (state.slots === list) return;
  state.slots = list;
  state.active = 0;
  state.fxOpen = false;
  state.guide = false;
  state.erasing = false;
}

/** 합성 바탕(원본 해상도)을 읽고 그늘색 지도까지 만들어 둔다. */
async function loadStage(asset) {
  if (state.bg?.assetId === asset.id) return showScene();
  try {
    const img = await loadImage(stageUrl(asset));
    if (state.selectedId !== asset.id) return; // 읽는 사이 다른 에셋을 골랐다
    useStage(asset, img);
    showScene();
  } catch (err) {
    console.error(err);
    setStatus(`Could not load the stage image: ${err.message}`, true);
  }
}

/** 읽어 온 무대 그림을 합성 바탕으로 삼는다. */
function useStage(asset, img) {
  const w = img.naturalWidth, h = img.naturalHeight;
  // 지운 자리는 배경 좌표라 다른 배경에서는 의미가 없다
  if (state.bg) state.slots.forEach(s => { s.eraser = null; });
  const px = createBackground(img);
  state.bg = { assetId: asset.id, id: Date.now(), w, h, px };
  // 색 보정이 읽을 형태 (readImage 와 같은 모양)
  state.bg.scene = { canvas: img, w, h, data: new ImageData(new Uint8ClampedArray(px.data), w, h) };
  // 단상·소품 같은 배경 속 오브젝트를 바로 한 번 나눠 둔다
  state.objects = detectObjects(state.bg.scene, null);
  state.objVersion++;
}

/**
 * 톤·버전·배경색 전환 — 새로 보일 그림(팔레트 썸네일·미리보기·프레임·무대)을 먼저 다 읽어 두고 한 번에 바꾼다.
 * 바로 다시 그리면 새 그림이 오는 동안 빈칸 → 미리보기 → 합성 순으로 비쳐 깜빡인다.
 * apply 는 상태를 바꾸는 함수, next 는 바뀐 상태에서 옮겨 갈 박스 id 를 내는 함수 (없으면 팔레트만 다시 그린다).
 * 썸네일 주소가 새 상태에서 나오므로 apply 를 먼저 부르고, 화면은 다 읽은 뒤 그린다.
 */
let swapSeq = 0;
/** 누른 버튼은 그림을 기다리지 않고 바로 켠다. */
const markOn = (btn, aria) => btn.parentElement.querySelectorAll(':scope > button').forEach(b => {
  b.classList.toggle('on', b === btn);
  b.setAttribute(aria, String(b === btn));
});
async function swapTo(apply, next) {
  const seq = ++swapSeq;
  apply();
  const nextId = next ? next() : null;
  const urls = groupsFor(state.version).filter(g => !g.hidden).flatMap(g => g.assets.filter(a => a.art).map(thumbUrl));
  const hit = nextId && findAsset(nextId);
  if (hit?.asset.art) urls.push(previewUrl(hit.asset), frameUrl(hit.asset));
  const decode = src => loadImage(src).then(img => img.decode?.().catch(() => {}).then(() => img)).catch(() => null);
  const [stage] = await Promise.all([
    hit?.asset.art && state.bg?.assetId !== hit.asset.id ? decode(stageUrl(hit.asset)) : null,
    ...urls.map(decode),
  ]);
  if (seq !== swapSeq) return; // 기다리는 사이 또 바꿨다 — 마지막 것만 그린다
  if (!nextId) return renderPalette();
  if (stage) useStage(hit.asset, stage);
  selectAsset(nextId);
}

/** 합성 캔버스를 바탕 크기로 맞추고 미리보기 창만큼 잘라 보이게 놓는다. */
function showScene() {
  const scene = $('#scene');
  if (!scene || !state.bg) return;
  const { w, h } = state.bg;
  for (const c of [$('#comp'), $('#eraseView')]) { c.width = w; c.height = h; }
  // 박스(= 창) 기준 %로 장면 전체를 키워 놓고 창 위치만큼 당긴다
  const win = previewWindow();
  Object.assign(scene.style, {
    width: `${(w / win.w) * 100}%`,
    height: `${(h / win.h) * 100}%`,
    left: `${(-win.x / win.w) * 100}%`,
    top: `${(-win.y / win.h) * 100}%`,
  });
  scene.hidden = false;
  const frame = $('#frameView');
  if (frame) { frame.width = frame.height = 800; }
  update();
}

// ── 갱신 (제품·설정이 바뀔 때 — 뼈대는 그대로 두고 값만 맞춘다) ─────────

const productEls = [];

function update() {
  renderSteps();
  $('#download').disabled = !state.bg || state.bg.assetId !== state.selectedId;
  syncHandles();
  syncProductList();
  syncFxPanel();
  placeFxPanel();
  syncScene();
  scheduleDraw();
}

function pct(v, total) { return `${(v / total) * 100}%`; }

// 크기 조절 상자 네 모서리 — 끌면 맞은편 모서리를 붙든 채 원래 비율로만 커지고 작아진다 (크리스마스 빌더와 같다)
const RESIZE_KNOBS = ['nw', 'ne', 'sw', 'se'].map(c => `<i class="tb-rs" data-c="${c}"></i>`).join('') +
  '<i class="tb-rs-del" title="Delete" aria-label="Delete"></i>'; // 오른쪽 위 빨간 동그라미 — 누르면 바로 지운다

/** 캔버스가 그린 제품 위에 얹는 투명 손잡이 — 끌어서 옮긴다. 고른 것에는 크기 조절 상자(.guide)를 띄운다 */
function syncHandles() {
  const overlay = $('#overlay');
  if (!overlay) return;
  const n = state.slots.length;
  while (productEls.length < n) {
    const el = document.createElement('div');
    el.className = 'product';
    overlay.append(el);
    productEls.push(el);
  }
  while (productEls.length > n) productEls.pop().remove();
  const inBox = boxMode();
  state.slots.forEach((slot, i) => {
    const el = productEls[i];
    const r = productRect(slot);
    // 박스 제품은 자리가 정해져 있다 — 끌기·크기 조절 상자를 띄우지 않는다
    el.hidden = !r || inBox;
    if (!r) return;
    el.dataset.i = i;
    el.classList.toggle('active', i === state.active);
    el.classList.toggle('guide', state.guide && i === state.active);
    if (!el.firstChild) el.innerHTML = RESIZE_KNOBS;
    el.style.setProperty('--c', colorOf(i));
    const { w, h } = state.bg;
    Object.assign(el.style, { left: pct(r.x, w), top: pct(r.y, h), width: pct(r.w, w), height: pct(r.h, h) });
  });
  overlay.classList.toggle('erasing', state.erasing);
}

/** 제품 행 목록 — 슬롯 수가 바뀔 때만 다시 만든다 (입력 중인 URL 이 날아가지 않게). */
function buildProductList() {
  const list = $('#productList');
  if (!list) return;
  $('#fxPark')?.append($('#fxPanel'));
  const inBox = boxMode();
  list.innerHTML = state.slots.map((slot, i) => `
    ${inBox ? `<p class="tb-box-label">BOX ${i + 1}</p>` : ''}
    <div class="item product-row" data-i="${i}">
      <div class="thumb">
        <span class="tag" style="--c:${colorOf(i)}">${i + 1}</span>
        <img alt="" hidden />
        <div class="thumb-actions" hidden>
          <button type="button" class="edit" data-act="edit" title="Edit (brush + crop)">Edit</button>
          <button type="button" class="remove" data-act="remove" title="Remove">×</button>
        </div>
      </div>
      <div class="product-inputs">
        <form class="row url-form">
          <input type="url" placeholder="LG.com product URL" value="${esc(slot.url)}" required />
          <button type="submit">Import</button>
        </form>
        <div class="row">
          <label class="file-btn ghost-btn">Upload<input type="file" accept="image/*" /></label>
          <button type="button" class="link change" data-act="change" hidden>Change from imported images</button>
          ${i > 0 && !inBox ? '<button type="button" class="link tb-drop-slot" data-act="drop-slot">Delete</button>' : ''}
        </div>
        <p class="muted meta"></p>
      </div>
      ${inBox ? '' : SHADOW_HEAD}
    </div>`).join('');
  placeFxPanel();
}

/** 제품 줄 아래 Shadow 드롭다운 머리 — 누르면 그 줄을 고르고 #fxPanel 을 그 아래로 펼친다 */
const SHADOW_HEAD = `<button type="button" class="tb-fx-head" data-act="fx-open"><span>Shadow</span>${CHEVRON}</button><div class="tb-fx-slot"></div>`;

/**
 * Shadow 패널을 고른 줄 아래로 옮긴다. 줄 목록을 다시 만들기 전에는 박스 끝 자리(#fxPark)로 빼 둬야 같이 지워지지 않는다
 * state.fxOpen 이면 고른 슬롯(state.active)의 줄에서 펼친다
 */
function placeFxPanel() {
  const panel = $('#fxPanel');
  if (!panel) return;
  const row = document.querySelector(`.product-row[data-i="${state.active}"]`);
  document.querySelectorAll('.tb-fx-head').forEach(h => {
    const open = state.fxOpen && h.closest('[data-i]') === row;
    h.classList.toggle('open', open);
    h.setAttribute('aria-expanded', open);
  });
  const home = state.fxOpen && row ? row.querySelector('.tb-fx-slot') : $('#fxPark');
  if (panel.parentElement !== home) home.append(panel);
  panel.hidden = !(state.fxOpen && row);
}

function syncProductList() {
  const list = $('#productList');
  if (!list) return;
  list.querySelectorAll('.item').forEach(row => {
    const p = state.slots[Number(row.dataset.i)]?.product;
    const img = row.querySelector('.thumb img');
    img.hidden = !p;
    if (p && img.getAttribute('src') !== p.src) img.src = p.src;
    row.querySelector('.thumb-actions').hidden = !p;
    row.querySelector('.change').hidden = !(p?.images?.length);
    row.querySelector('.meta').textContent = p?.meta ? [p.meta.name, p.meta.model].filter(Boolean).join(' · ') : '';
  });
  const add = $('[data-act="add-product"]');
  if (add) add.disabled = state.slots.length >= MAX_PRODUCTS;
}

// ── 합성 그리기 ───────────────────────────────────────────

let drawQueued = false;
function scheduleDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => {
    drawQueued = false;
    const comp = $('#comp');
    if (!state.bg || !comp || state.bg.assetId !== state.selectedId) return;
    paint(comp.getContext('2d'));
    // Edit panel 프레임은 같은 합성의 정사각 전체를 줄여 보여준다
    const frame = $('#frameView');
    if (frame) {
      frame.getContext('2d').drawImage(comp, 0, 0, frame.width, frame.height);
      if (frame.hidden) {
        frame.hidden = false;
        frame.previousElementSibling.hidden = true;
      }
    }
    drawEraseView();
    // 합성이 바뀌었으니 매체 사이즈도 다시 (가장자리 사본도 새로 만든다)
    artVersion++;
    renderSlots();
  });
}

/** 최종 이미지를 ctx 에 그린다. 화면과 다운로드가 같이 쓴다. */
/** 박스에 넣은 제품은 그림자 없이 — 그림자·톤 기본값을 다 끈 설정 */
const NO_SHADOW_FX = (() => { const fx = cloneFx(DEFAULT_FX); fx.surface = 'floor'; fx.contact.on = false; fx.floor.on = false; return fx; })();
const boxMode = () => !!findAsset(state.selectedId)?.asset.boxes;

function paint(ctx) {
  const inBox = boxMode();
  const items = state.slots
    .map(slot => ({ slot, rect: productRect(slot) }))
    .filter(({ slot, rect }) => rect && slot.product.img)
    .map(({ slot, rect }) => {
      const scr = screenLayer(slot, rect);
      return {
        image: slot.product.img, rect, fx: inBox ? NO_SHADOW_FX : slot.fx, eraser: inBox ? null : slot.eraser,
        glow: scr && scr.glow && { canvas: scr.glow, x: Math.round(rect.x) - scr.pad, y: Math.round(rect.y) - scr.pad },
      };
    });
  drawComposite(ctx, coloredBackground() || state.bg.px, items, {
    // 화면 빛은 배경 위·그림자와 제품 아래에 번진다
    afterBackground: c => {
      if (!state.mood.on || !state.mood.glow) return;
      c.globalCompositeOperation = 'screen';
      c.globalAlpha = state.mood.glow / 100;
      for (const it of items) if (it.glow) c.drawImage(it.glow.canvas, it.glow.x, it.glow.y);
    },
  });
}

// ── 제품 가져오기 ─────────────────────────────────────────

/**
 * 팝업 흐름 하나를 돌려 슬롯에 넣는다. 취소하면 아무것도 안 바꾼다.
 * keep 을 주면 결과에 빠진 정보(메타·이미지 목록)를 이전 것에서 이어받는다.
 */
async function runImport(i, flow, keep) {
  setStatus('');
  try {
    const out = await flow();
    if (!out) return;
    const slot = state.slots[i];
    if (!slot) return; // 그새 슬롯을 지웠다
    // 합성 엔진은 이미지 요소로 그리므로 미리 디코드해 둔다
    const img = await loadImage(out.src);
    // 기본 배치 칸에 제품을 새로 올리면 더는 기본 배치가 아니다 (다른 에셋으로 가도 남는다)
    slot.preset = out.preset ?? null;
    slot.product = { ...out, img, meta: out.meta ?? keep?.meta, images: out.images ?? keep?.images };
    // 제품 사진이 바뀌었으니 화면 영역의 색도 새 사진에서 다시 읽는다
    if (slot.screen.quadN) sampleQuad(slot);
    state.active = i;
    update();
    const m = slot.product.meta;
    setStatus(`Product ${i + 1} placed · ${out.w} × ${out.h}px${m?.model ? ` · ${m.model}` : ''}`);
  } catch (err) {
    console.error(err);
    setStatus(`Image processing failed: ${err.message}`, true);
  }
}

// ── 그림자 · 톤 ───────────────────────────────────────────

const SURFACE_HINT = {
  floor: 'Standing on the floor — fridges, washers, TVs on a stand.',
  wall: 'Mounted on the wall — wall TVs, air conditioners.',
  both: 'Standing on the floor in front of a wall.',
};
const activeFx = () => state.slots[state.active].fx;
const getPath = (o, path) => path.split('.').reduce((v, k) => v?.[k], o);
function setPath(o, path, v) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((v2, k) => v2[k], o)[last] = v;
}

/** 패널을 활성 제품의 fx 값으로 맞춘다. */
function syncFxPanel() {
  const panel = $('#fxPanel');
  if (!panel) return;
  const fx = activeFx();
  panel.querySelectorAll('[data-seg]').forEach(seg => {
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === fx[seg.dataset.seg]));
  });
  $('#surfaceHint').textContent = SURFACE_HINT[fx.surface];
  panel.querySelectorAll('[data-fx]').forEach(input => {
    const v = getPath(fx, input.dataset.fx);
    if (input.type === 'checkbox') input.checked = !!v;
    else {
      input.value = v;
      input.nextElementSibling.textContent = v;
    }
  });
  // 바닥 쪽 카드는 Wall 에서, 벽 카드는 Floor 에서 숨긴다
  panel.querySelectorAll('[data-show]').forEach(card => {
    card.hidden = card.dataset.show === 'floor' ? fx.surface === 'wall' : fx.surface === 'floor';
  });
  panel.querySelectorAll('[data-toggle]').forEach(card => card.classList.toggle('off', !getPath(fx, card.dataset.toggle)));

  $('#eraseToggle').classList.toggle('active', state.erasing);
  $('#eraseToggle').textContent = state.erasing ? 'Done erasing' : 'Paint to erase shadow';
  $('#eraseMode').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === state.eraseMode));
  $('#eraseSize').value = state.eraseSize;
  $('#eraseSize').nextElementSibling.textContent = state.eraseSize;
  $('#eraseClear').hidden = !state.slots[state.active].eraser;
  const cursor = $('#brushCursor');
  if (cursor) cursor.classList.toggle('restore', state.eraseMode === 'restore');
}

// ── 그림자 지우개 ─────────────────────────────────────────

/** 활성 제품의 지우개 캔버스 (없으면 만든다). */
function activeEraser() {
  const slot = state.slots[state.active];
  if (!slot.eraser) {
    const c = document.createElement('canvas');
    c.width = state.bg.w;
    c.height = state.bg.h;
    slot.eraser = c;
  }
  return slot.eraser;
}

/** a → b 선을 따라 부드러운 원형 브러시로 칠한다. Erase 는 알파를 더하고, Restore 는 뺀다. */
function paintEraser(a, b) {
  const ctx = activeEraser().getContext('2d');
  const r = state.eraseSize / 2;
  ctx.globalCompositeOperation = state.eraseMode === 'erase' ? 'source-over' : 'destination-out';
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(dist / Math.max(1, r * 0.25)));
  for (let i = 0; i <= steps; i++) {
    const x = a.x + ((b.x - a.x) * i) / steps;
    const y = a.y + ((b.y - a.y) * i) / steps;
    const g = ctx.createRadialGradient(x, y, r * 0.55, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  update();
}

/** 지우개 모드일 때 지운 자리를 붉게 비춰 보여준다. */
function drawEraseView() {
  const view = $('#eraseView');
  if (!view || !state.erasing) return;
  const ctx = view.getContext('2d');
  ctx.clearRect(0, 0, view.width, view.height);
  const er = state.slots[state.active].eraser;
  if (!er) return;
  ctx.drawImage(er, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = 'rgba(253, 49, 46, 0.35)';
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.globalCompositeOperation = 'source-over';
}

function moveBrushCursor(e) {
  const overlay = $('#overlay');
  const rect = overlay.getBoundingClientRect();
  const d = state.eraseSize * (rect.width / state.bg.w);
  Object.assign($('#brushCursor').style, {
    left: `${e.clientX - rect.left}px`, top: `${e.clientY - rect.top}px`, width: `${d}px`, height: `${d}px`,
  });
  $('#brushCursor').hidden = false;
}

function setErasing(on) {
  if (on && !state.slots[state.active].product) return setStatus(`Add product ${state.active + 1} first.`, true);
  state.erasing = on;
  if (on) { state.picking = null; state.pickPts = []; state.sampling = false; }
  const cursor = $('#brushCursor');
  if (cursor) cursor.hidden = true;
  update();
  if (on) setStatus(`Erasing shadow of product ${state.active + 1}. Paint on the canvas, then click Done erasing (Esc).`);
}

// ── 화면 인필 ─────────────────────────────────────────────

const screenCache = new Map(); // 슬롯 → { key, layer, glow, pad }

/**
 * 화면 빛 번짐. 잘라 둔 영역을 제자리(quad)에 다시 끼운 레이어를 크게 흐린다 — 화면 자체는 그리지 않는다.
 * 제품이 같은 크기로 움직이는 동안은 다시 계산하지 않고 위치만 옮겨 그린다.
 */
function screenLayer(slot, rect) {
  const sc = slot.screen;
  if (!sc.quadN || !sc.infill) return null;
  const w = Math.max(1, Math.round(rect.w)), h = Math.max(1, Math.round(rect.h));
  const key = JSON.stringify([sc.infillId, w, h, sc.quadN.map(p => [p.x.toFixed(4), p.y.toFixed(4)])]);
  const hit = screenCache.get(slot);
  if (hit && hit.key === key) return hit;
  const quad = sc.quadN.map(p => ({ x: p.x * w, y: p.y * h }));
  const { layer } = warpInfill({ w, h }, sc.infill, quad, 'stretch');
  // 번짐은 제품 밖으로 퍼져야 하므로 여백을 둔 캔버스에서 만든다
  const pad = Math.round(Math.max(w, h) * 0.8);
  const padded = document.createElement('canvas');
  padded.width = w + pad * 2; padded.height = h + pad * 2;
  padded.getContext('2d').drawImage(layer, pad, pad);
  const out = { key, layer, glow: glowLayer(padded, 0.5), pad };
  screenCache.set(slot, out);
  return out;
}

/** 슬롯의 화면 네 모서리 (배경 좌표). 없으면 null */
function screenQuad(slot) {
  const r = productRect(slot);
  if (!r || !slot.screen.quadN) return null;
  return slot.screen.quadN.map(p => ({ x: r.x + p.x * r.w, y: r.y + p.y * r.h }));
}

/** 색 소스는 한 번에 하나 — 이 슬롯 말고 다른 제품에 잡힌 영역은 지운다. */
function keepOnlyScreen(slot) {
  for (const s of state.slots) if (s !== slot) Object.assign(s.screen, { quadN: null, infill: null, method: null });
}

/**
 * 슬롯의 영역(quadN)을 제품 사진에서 반듯한 사각형으로 펴서 잘라 색 소스(infill)로 둔다.
 * 네 모서리를 쌍선형으로 이어 픽셀을 집는다 — 비스듬히 찍어도 둘레의 베젤·배경이 덜 섞인다.
 */
function sampleQuad(slot) {
  const img = slot.product?.img, q = slot.screen.quadN;
  if (!img || !q) return;
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const src = document.createElement('canvas');
  src.width = iw; src.height = ih;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(img, 0, 0);
  const sd = sctx.getImageData(0, 0, iw, ih).data;
  // 결과 크기 — 위·왼쪽 변 길이 비율 그대로, 긴 쪽 400px (색 배치만 쓰므로 충분)
  const top = Math.hypot((q[1].x - q[0].x) * iw, (q[1].y - q[0].y) * ih);
  const left = Math.hypot((q[3].x - q[0].x) * iw, (q[3].y - q[0].y) * ih);
  const k = 400 / Math.max(top, left, 1);
  const w = Math.max(2, Math.round(top * k)), h = Math.max(2, Math.round(left * k));
  const out = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const px = ((1 - u) * (1 - v) * q[0].x + u * (1 - v) * q[1].x + u * v * q[2].x + (1 - u) * v * q[3].x) * iw;
      const py = ((1 - u) * (1 - v) * q[0].y + u * (1 - v) * q[1].y + u * v * q[2].y + (1 - u) * v * q[3].y) * ih;
      const sx = Math.min(iw - 1, Math.max(0, Math.round(px))), sy = Math.min(ih - 1, Math.max(0, Math.round(py)));
      const si = (sy * iw + sx) * 4, oi = (y * w + x) * 4;
      out.data[oi] = sd[si]; out.data[oi + 1] = sd[si + 1]; out.data[oi + 2] = sd[si + 2]; out.data[oi + 3] = 255;
    }
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').putImageData(out, 0, 0);
  slot.screen.infill = { canvas: c, w, h, data: out };
  slot.screen.infillId = Date.now();
}

function pickCorner(p) {
  state.pickPts.push(p);
  if (state.pickPts.length === 4) {
    const i = state.picking;
    const slot = state.slots[i];
    const r = productRect(slot);
    slot.screen.quadN = orderQuad(state.pickPts).map(q => ({ x: (q.x - r.x) / r.w, y: (q.y - r.y) / r.h }));
    slot.screen.method = 2;
    sampleQuad(slot);
    keepOnlyScreen(slot);
    state.picking = null;
    state.pickPts = [];
    setStatus(`Background now takes its colors from the marked area of product ${i + 1}.`, false, 'scene');
  }
  update();
}

function setPicking(on) {
  const slot = state.slots[state.active];
  if (on && !productRect(slot)) return setStatus(`Place product ${state.active + 1} first (Product & Shadow).`, true, 'scene');
  state.picking = on ? state.active : null;
  state.pickPts = [];
  if (on) { state.erasing = false; state.sampling = false; }
  update();
  if (on) setStatus(`Click four corners of the area on product ${state.active + 1} (any order). Esc cancels.`, false, 'scene');
}

/**
 * 제품 사진 속 화면 영역 찾기. 클릭한 점에서 시작해 "베젤이 아닌" 픽셀(밝거나 색이 있는)을
 * 이어 칠하고, 그 범위를 화면으로 본다 — 둘레의 검은 베젤에서 번짐이 멈춘다.
 * u, v: 제품 이미지 기준 0~1 클릭 위치. @returns 0~1 사각형 { x0, y0, x1, y1 } 또는 null
 */
function detectScreen(img, u, v) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const S = Math.min(1, 500 / Math.max(iw, ih));
  const w = Math.max(8, Math.round(iw * S)), h = Math.max(8, Math.round(ih * S));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const ok = i => {
    const p = i * 4;
    if (d[p + 3] < 200) return false;
    const r = d[p], g = d[p + 1], b = d[p + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return 0.299 * r + 0.587 * g + 0.114 * b > 40 || mx - mn > 40;
  };
  // 찍은 자리가 하필 어두운 픽셀이면 가까운 밝은 픽셀에서 시작한다
  let sx = Math.min(w - 1, Math.max(0, Math.round(u * w))), sy = Math.min(h - 1, Math.max(0, Math.round(v * h)));
  if (!ok(sy * w + sx)) {
    let best = null;
    const R = Math.round(Math.max(w, h) * 0.05);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const x = sx + dx, y = sy + dy;
      if (x < 0 || y < 0 || x >= w || y >= h || !ok(y * w + x)) continue;
      const dist = dx * dx + dy * dy;
      if (!best || dist < best.dist) best = { x, y, dist };
    }
    if (!best) return null;
    sx = best.x; sy = best.y;
  }
  const seen = new Uint8Array(w * h);
  const stack = [sy * w + sx];
  seen[stack[0]] = 1;
  let x0 = sx, x1 = sx, y0 = sy, y1 = sy, n = 0;
  while (stack.length) {
    const i = stack.pop();
    const x = i % w, y = (i - x) / w;
    n++;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (j >= 0 && !seen[j] && ok(j)) { seen[j] = 1; stack.push(j); }
    }
  }
  // 너무 작으면 화면이 아니라 반사광 같은 조각을 찍은 것
  if (n < w * h * 0.02) return null;
  // 가장자리 안티에일리어싱 줄은 살짝 안으로
  const ix = (x1 - x0) * 0.01, iy = (y1 - y0) * 0.01;
  return { x0: (x0 + ix) / w, y0: (y0 + iy) / h, x1: (x1 + 1 - ix) / w, y1: (y1 + 1 - iy) / h };
}

/** 클릭한 제품의 화면을 찾아 그 화면 자체를 색 소스(인필)로 잡는다. 화면은 바꾸지 않는다. */
function sampleScreen(p) {
  // 위에 그려진(뒷번호) 제품부터 — 겹쳐 있으면 보이는 쪽을 집는다
  let i = -1, r = null;
  for (let k = state.slots.length - 1; k >= 0; k--) {
    const rk = productRect(state.slots[k]);
    if (rk && p.x >= rk.x && p.x <= rk.x + rk.w && p.y >= rk.y && p.y <= rk.y + rk.h) { i = k; r = rk; break; }
  }
  if (i < 0) return setStatus('Click on the screen of a product.', true, 'scene');
  const slot = state.slots[i];
  const img = slot.product.img;
  const box = detectScreen(img, (p.x - r.x) / r.w, (p.y - r.y) / r.h);
  if (!box) return setStatus('Could not find a screen there. Click the middle of the TV screen, or mark it with Screen Select 2.', true, 'scene');
  slot.screen.quadN = [{ x: box.x0, y: box.y0 }, { x: box.x1, y: box.y0 }, { x: box.x1, y: box.y1 }, { x: box.x0, y: box.y1 }];
  slot.screen.method = 1;
  sampleQuad(slot);
  keepOnlyScreen(slot);
  state.active = i;
  state.sampling = false;
  update();
  setStatus(`Background now takes its colors from product ${i + 1}'s screen.`, false, 'scene');
}

function setSampling(on) {
  if (on && !state.slots.some(s => productRect(s))) return setStatus('Place a product first (Product & Shadow).', true, 'scene');
  state.sampling = on;
  if (on) { state.erasing = false; state.picking = null; state.pickPts = []; }
  update();
  if (on) setStatus('Click the TV screen on the canvas. Esc cancels.', false, 'scene');
}

// ── 배경 컬러 (Color mood) ────────────────────────────────

/** 색을 가져올 슬롯 — 화면 영역이 잡힌 제품 (한 번에 하나뿐이다) */
function moodSourceSlot() {
  return state.slots.find(s => s.screen.infill && s.screen.quadN && productRect(s)) || null;
}

const moodCache = { key: null, bg: null, fieldKey: null, field: null, objKey: null, objData: null };

/**
 * 인필 색으로 물든 배경 (createBackground 형태 — 그림자 색도 물든 배경을 따른다).
 * 바뀐 입력이 없으면 캐시를 그대로 쓴다. 색을 뽑는 TV 를 끄는 동안(드래그)은 다시 계산하지
 * 않고, 손을 뗄 때 한 번 계산한다 — 2~3백 ms 걸려서 드래그가 끊기면 안 되기 때문.
 */
function coloredBackground() {
  const m = state.mood;
  const src = m.on ? moodSourceSlot() : null;
  if (!src || m.strength <= 0) return null;
  const { w, h } = state.bg;
  const quad = screenQuad(src);
  const cx = quad.reduce((a, p) => a + p.x, 0) / 4, cy = quad.reduce((a, p) => a + p.y, 0) / 4;
  const srcRect = productRect(src);
  const key = JSON.stringify([
    state.bg.id, src.screen.infillId, m.strength, m.vivid, m.objectAmount, state.objVersion,
    Math.round(cx / 8), Math.round(cy / 8), m.centerClear, m.floorAmount, Math.round((srcRect.y + srcRect.h) / 8),
  ]);
  if (key === moodCache.key) return moodCache.bg;
  if (gesture && gesture.kind === 'move' && moodCache.bg && moodCache.srcId === src.screen.infillId && moodCache.bgId === state.bg.id) return moodCache.bg;

  const fk = `${src.screen.infillId}:${m.vivid}:${state.bg.id}`;
  if (fk !== moodCache.fieldKey) { moodCache.fieldKey = fk; moodCache.field = colorField(src.screen.infill, w, h, m.vivid / 100); }
  if (moodCache.objKey !== state.objVersion) {
    moodCache.objKey = state.objVersion;
    moodCache.objData = state.objects ? state.objects.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data : null;
  }
  const data = adjustBackground(state.bg.scene, {
    mode: 'palette', strength: m.strength / 100, saturation: 0, protectNeutrals: true,
    from: { h: 0, s: 0 }, to: { h: 0, s: 0 },
    field: moodCache.field,
    objectAmount: m.objectAmount / 100,
    weightMap: null,
    center: { x: cx, y: cy, r: (m.centerClear / 100) * 0.7 * Math.hypot(w, h) },
    // 바닥선 = 색을 뽑는 제품의 발끝. 그 아래(바닥)는 Floor tint 만큼만
    floor: { y: srcRect.y + srcRect.h, amount: m.floorAmount / 100 },
  }, null, moodCache.objData);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').putImageData(data, 0, 0);
  moodCache.key = key;
  moodCache.srcId = src.screen.infillId;
  moodCache.bgId = state.bg.id;
  moodCache.bg = createBackground(c);
  return moodCache.bg;
}

/** Scene Color 패널 · 화면 모서리 핸들을 지금 상태로 맞춘다. */
function syncScene() {
  const ov = $('#overlay');
  if (ov) {
    ov.classList.toggle('picking', state.picking !== null || state.sampling);
    // 화면 모서리 핸들 — 찍는 중이면 찍은 점, 아니면 활성 제품의 네 점
    const slot = state.slots[state.active];
    const pts = state.picking !== null ? state.pickPts : (screenQuad(slot) || []);
    const handles = $('#handles');
    while (handles.children.length < pts.length) { const hd = document.createElement('div'); hd.className = 'handle'; handles.append(hd); }
    while (handles.children.length > pts.length) handles.lastElementChild.remove();
    if (state.bg) {
      pts.forEach((p, k) => {
        const hd = handles.children[k];
        hd.dataset.k = k;
        hd.textContent = state.picking === null ? k + 1 : '';
        hd.style.left = pct(p.x, state.bg.w);
        hd.style.top = pct(p.y, state.bg.h);
      });
      // 가이드 사각형은 Scene Color 박스가 열려 있을 때만 — 결과를 볼 때 거슬리지 않게
      ov.classList.toggle('screen-guides', state.open.has('scene') || state.picking !== null);
      $('#quadSvg').setAttribute('viewBox', `0 0 ${state.bg.w} ${state.bg.h}`);
      $('#quadSvg polygon').setAttribute('points', pts.map(p => `${p.x},${p.y}`).join(' '));
    }
  }

  if (!$('#screenPanel')) return;
  const sc = state.slots[state.active].screen;
  $('#screenFor').textContent = state.active + 1;
  $('#sampleScreen').classList.toggle('active', state.sampling);
  $('#sampleScreen').textContent = state.sampling ? 'Click the TV screen on the canvas…' : sc.method === 1 ? 'Click the screen again' : 'Click the screen';
  $('#setCorners').classList.toggle('active', state.picking !== null);
  $('#setCorners').textContent = state.picking !== null ? `Click point ${state.pickPts.length + 1} of 4…` : sc.method === 2 ? 'Set four points again' : 'Set four points';
  // 지금 쓰는 방법의 카드에 불 — 고르는 중이면 그 방법
  const on = state.sampling ? 1 : state.picking !== null ? 2 : sc.method;
  $('#method1').classList.toggle('on', on === 1);
  $('#method2').classList.toggle('on', on === 2);
  $('.tb-clear-screen').hidden = !(sc.quadN || sc.infill);

  const m = state.mood;
  $('#moodPanel').classList.toggle('off', !m.on);
  document.querySelectorAll('[data-mseg="on"] button').forEach(b => b.classList.toggle('on', (b.dataset.v === 'after') === m.on));
  $('#moodSourceHint').hidden = !!moodSourceSlot();
  document.querySelectorAll('[data-m]').forEach(input => { input.value = m[input.dataset.m]; input.nextElementSibling.textContent = m[input.dataset.m]; });
}

// ── 이벤트: 팔레트 · 기능 박스 ────────────────────────────

$('#palette').addEventListener('click', e => {
  const vb = e.target.closest('[data-version]');
  if (vb) {
    const v = vb.dataset.version;
    if (v === state.version) return;
    // 고른 박스가 있으면 다른 버전의 같은 자리로 옮겨 간다 — 제품·설정은 그대로
    const cur = findAsset(state.selectedId);
    markOn(vb, 'aria-selected');
    void swapTo(() => { state.version = v; }, cur && (() => assetId(v, cur.group.key, cur.asset.base)));
    return;
  }
  const cell = e.target.closest('.tb-cell');
  if (!cell) return;
  // 같은 타일을 다시 누르면 선택 해제 (BF 와 동일)
  if (cell.classList.contains('selected')) { selectAsset(null); return; }
  // Light · Dark 칸 — 그 칸의 톤으로 바꾼 뒤 고른다 (findAsset 이 지금 톤의 id 로 찾는다)
  if (cell.dataset.tone) state.tone[cell.dataset.group] = cell.dataset.tone;
  // 다른 에셋을 고르면 Background Color 는 언제나 첫 칸에서 시작한다 (Light 01 Standard · Dark 02)
  state.bgColor = 'c1';
  state.noIcon = false;
  state.step = 1;
  const hit = findAsset(cell.dataset.id);
  selectAsset(hit ? assetId(hit.asset.version, hit.group.key, hit.asset.base) : cell.dataset.id);
  placeOldProduct(hit?.asset, hit?.group.key);
});

const editBody = $('#editBody');
// Copy 패널 입력 — 글자는 사이즈만 다시, 체크·로고·모드처럼 패널 모양이 바뀌는 건 패널까지 (크리스마스 빌더와 같다)
// Text mode 버튼은 copy.textMode 를 바꾸고 첫 콜백을 부른다 — 그 값을 지금 판 종류 몫으로 남긴다
bindCopyPanel(editBody, state.copy, () => { state.textModes[textKind()] = state.copy.textMode; renderEdit(); renderSlots(); }, () => renderSlots());

editBody.addEventListener('click', e => {
  // 기능 박스 펼치기/접기 — 다시 그리지 않고 클래스만 바꿔야 높이 전환이 보인다
  const head = e.target.closest('.tb-acc-head');
  if (head) {
    const sec = head.parentElement;
    const key = sec.dataset.key;
    if (sec.classList.contains('fixed')) return;
    const open = !state.open.has(key);
    if (open) state.open.add(key); else state.open.delete(key);
    sec.classList.toggle('open', open);
    head.setAttribute('aria-expanded', String(open));
    syncScene();
    return;
  }

  // Product Slot 배치 화살표 — 같은 톤·Background Color 로 다른 배치에 갈아 끼운다 (박스 제품은 그대로)
  const arrow = e.target.closest('[data-layout-step]');
  if (arrow) {
    const cur = findAsset(state.selectedId);
    const list = cur?.asset.layouts;
    if (!list) return;
    const next = list[(list.indexOf(cur.asset.base) + Number(arrow.dataset.layoutStep) + list.length) % list.length];
    void swapTo(() => {}, () => assetId(cur.asset.version, cur.group.key, next));
    return;
  }

  // Background Color 칸 — 변형 컷(07 Eco 등)이 있는 에셋이면 그 컷으로 갈아 끼운다. 제품·설정은 그대로
  const dot = e.target.closest('[data-bgcolor]');
  if (dot) {
    const cur = findAsset(state.selectedId);
    state.bgColor = dot.dataset.bgcolor;
    const next = cur && assetId(cur.asset.version, cur.group.key, cur.asset.base);
    if (next && next !== state.selectedId) { void swapTo(() => {}, () => next); return; }
    document.querySelectorAll('[data-bgcolor]').forEach(b => {
      const on = b.dataset.bgcolor === state.bgColor;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
    return;
  }

  const tab = e.target.closest('[data-tab]');
  if (tab) { state.active = Number(tab.dataset.tab); update(); return; }

  const segBtn = e.target.closest('#fxPanel [data-seg] button');
  if (segBtn) { activeFx()[segBtn.closest('[data-seg]').dataset.seg] = segBtn.dataset.v; update(); return; }

  const modeBtn = e.target.closest('#eraseMode button');
  if (modeBtn) { state.eraseMode = modeBtn.dataset.v; update(); return; }

  const baBtn = e.target.closest('[data-mseg="on"] button');
  if (baBtn) { state.mood.on = baBtn.dataset.v === 'after'; update(); return; }



  const act = e.target.closest('[data-act]')?.dataset.act;
  if (!act) return;
  const row = e.target.closest('.product-row');
  const i = row ? Number(row.dataset.i) : state.active;
  const slot = state.slots[i];
  switch (act) {
    case 'add-product':
      if (state.slots.length >= MAX_PRODUCTS) return;
      state.slots.push(newSlot(state.slots.length));
      state.active = state.slots.length - 1;
      buildProductList();
      update();
      break;
    case 'drop-slot':
      if (slot.product && !confirm(`Remove product ${i + 1}?`)) return;
      state.slots.splice(i, 1);
      state.active = Math.min(state.active, state.slots.length - 1);
      buildProductList();
      update();
      break;
    case 'edit':
      if (slot.product) runImport(i, () => editProduct(slot.product, { box: boxMode() }), slot.product);
      break;
    case 'remove':
      slot.product = null;
      update();
      break;
    case 'change':
      runImport(i, () => importFromUrl(slot.url, { images: slot.product?.images, box: boxMode() }), slot.product);
      break;
    case 'fx-open':
      // 같은 줄을 다시 누르면 접는다, 다른 줄이면 그 줄을 고르고 펼친다
      state.fxOpen = !(state.fxOpen && state.active === i);
      state.active = i;
      update();
      break;
    case 'fx-reset':
      state.slots[state.active].fx = cloneFx(DEFAULT_FX);
      update();
      break;
    case 'fx-all': {
      const src = activeFx();
      state.slots.forEach(s => { s.fx = cloneFx(src); });
      update();
      setStatus(`Shadow settings of product ${state.active + 1} applied to all ${state.slots.length} products.`);
      break;
    }
    case 'erase-toggle':
      setErasing(!state.erasing);
      break;
    case 'erase-clear':
      state.slots[state.active].eraser = null;
      update();
      break;
    case 'sample-screen':
      setSampling(!state.sampling);
      break;
    case 'set-corners':
      setPicking(state.picking === null);
      break;
    case 'clear-screen':
      Object.assign(state.slots[state.active].screen, { quadN: null, infill: null, method: null });
      state.picking = null;
      state.pickPts = [];
      update();
      break;
  }
});

editBody.addEventListener('submit', e => {
  const form = e.target.closest('.url-form');
  if (!form) return;
  e.preventDefault();
  const i = Number(form.closest('.product-row').dataset.i);
  runImport(i, () => importFromUrl(form.querySelector('input').value.trim(), { box: boxMode() }));
});

editBody.addEventListener('input', e => {
  const t = e.target;
  if (t.matches('.url-form input')) {
    const slot = state.slots[Number(t.closest('.product-row').dataset.i)];
    slot.url = t.value;
    // URL 을 바꾸면 이전 크롤링 목록은 더 이상 이 URL 것이 아니다
    if (slot.product) slot.product.images = null;
    syncProductList();
    return;
  }
  if (t.id === 'eraseSize') { state.eraseSize = Number(t.value); update(); return; }
  if (t.dataset.m) { state.mood[t.dataset.m] = Number(t.value); update(); return; }
  const path = t.dataset.fx;
  if (path) { setPath(activeFx(), path, t.type === 'checkbox' ? t.checked : Number(t.value)); update(); }
});

editBody.addEventListener('change', async e => {
  const t = e.target;
  if (t.type !== 'file') return;
  const file = t.files[0];
  t.value = '';
  if (!file) return;
  if (t.closest('.product-row')) {
    runImport(Number(t.closest('.product-row').dataset.i), () => importFromFile(file, { box: boxMode() }));
  }
});

// ── 이벤트: 캔버스 (제품 끌기 · 지우개) ───────────────────

/** 화면 좌표 → 배경 픽셀 좌표 (장면이 창보다 커서 잘려 있어도 그대로 맞는다) */
function toBg(e) {
  const rect = $('#overlay').getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(state.bg.w, (e.clientX - rect.left) * (state.bg.w / rect.width))),
    y: Math.max(0, Math.min(state.bg.h, (e.clientY - rect.top) * (state.bg.h / rect.height))),
  };
}

let gesture = null; // { kind: 'move', i, from, dx, dy } | { kind: 'erase', last } | { kind: 'corner', i, k }

const canvasEl = $('#canvas');
// OK — 이미지 편집을 마치고 누르면 3 단계(Select Channel)로 넘어가 매체 목록이 열린다
canvasEl.addEventListener('click', e => {
  if (e.target.closest('[data-act="open-channels"]')) goStep(2);
});
// Standard — 아이콘 없는 컷으로 갈아 끼운다 (같은 톤·Background Color). 한 번 더 누르면 원래 컷. 제품·설정은 그대로
canvasEl.addEventListener('click', e => {
  if (!e.target.closest('[data-noicon]')) return;
  const cur = findAsset(state.selectedId);
  if (!cur) return;
  void swapTo(() => { state.noIcon = !state.noIcon; }, () => assetId(cur.asset.version, cur.group.key, cur.asset.base));
});
// 매체 알약 — 하나만 고른다, 한 번 더 누르면 해제
canvasEl.addEventListener('click', e => {
  const btn = e.target.closest('[data-channel]');
  if (!btn) return;
  state.channel = state.channel === btn.dataset.channel ? null : btn.dataset.channel;
  canvasEl.querySelectorAll('[data-channel]').forEach(b => b.classList.toggle('on', b.dataset.channel === state.channel));
  // 고르든 풀든 3 단계 — Edit panel 이 Copy 패널 ↔ 편집 박스로 바뀐다
  state.step = 2;
  renderSteps();
  renderEdit();
  buildProductList();
  update();
  renderSlots();
});
canvasEl.addEventListener('pointerdown', e => {
  const overlay = e.target.closest('#overlay');
  if (!overlay || !state.bg) return;
  if (state.sampling) {
    sampleScreen(toBg(e));
    return;
  }
  if (state.picking !== null) {
    pickCorner(toBg(e));
    return;
  }
  const handle = e.target.closest('.handle');
  if (handle) {
    e.preventDefault();
    overlay.setPointerCapture(e.pointerId);
    gesture = { kind: 'corner', i: state.active, k: Number(handle.dataset.k) };
    return;
  }
  if (state.erasing) {
    e.preventDefault();
    overlay.setPointerCapture(e.pointerId);
    const p = toBg(e);
    gesture = { kind: 'erase', last: p };
    paintEraser(p, p);
    return;
  }
  const del = e.target.closest('.tb-rs-del');
  if (del) {
    e.preventDefault();
    removeSlot(Number(del.parentElement.dataset.i));
    return;
  }
  const knob = e.target.closest('.tb-rs');
  if (knob) {
    e.preventDefault();
    overlay.setPointerCapture(e.pointerId);
    const i = Number(knob.parentElement.dataset.i);
    const r = productRect(state.slots[i]);
    const c = knob.dataset.c;
    // 맞은편 모서리 (배경 픽셀) — 이 점을 붙든 채 키운다
    const anchor = { x: c.includes('w') ? r.x + r.w : r.x, y: c.includes('n') ? r.y + r.h : r.y };
    const p = toBg(e);
    gesture = { kind: 'scale', i, c, anchor, d0: Math.hypot(p.x - anchor.x, p.y - anchor.y), s0: state.slots[i].place.scale };
    return;
  }
  const target = e.target.closest('.product');
  // 빈 바탕을 누르면 크기 조절 상자를 끈다
  if (!target) {
    if (state.guide) { state.guide = false; update(); }
    return;
  }
  e.preventDefault();
  overlay.setPointerCapture(e.pointerId);
  const i = Number(target.dataset.i);
  const { dx, dy } = state.slots[i].place;
  gesture = { kind: 'move', i, from: toBg(e), dx, dy };
  state.active = i;
  state.guide = true;
  update();
});

/**
 * 구형 제품 기본 배치 — 팔레트에서 Wide · Tall Product 02 를 고르면 그 에셋의 oldProduct 를 제품 칸 하나로 깐다.
 * 업로드한 제품과 똑같이 고르고·옮기고·키우고·지운다. 다른 에셋으로 가면 깔아 둔 칸(preset)은 걷는다
 */
function placeOldProduct(asset, groupKey) {
  if (!asset || asset.boxes) return;
  const list = state.kvSlots, op = asset.oldProduct;
  for (let i = list.length - 1; i >= 0; i--) if (list[i].preset && list[i].preset !== op?.id) list.splice(i, 1);
  if (!list.length) list.push(newSlot(0));
  if (state.active >= list.length) state.active = 0;
  // Light · Dark 이미지가 따로 있다 (srcDark) — 같은 칸에서 톤만 바꾸면 자리는 두고 그림만 갈아 끼운다
  const dark = toneOf(groupKey) === 'dark';
  const load = i => runImport(i, async () => {
    const res = await fetch(`${ASSET_DIR}/${dark && op.srcDark ? op.srcDark : op.src}`);
    if (!res.ok) throw new Error(`Product load failed (${res.status})`);
    const original = await blobToDataUrl(await res.blob());
    const img = await loadImage(original);
    return { original, brushed: original, cropRect: null, src: original, w: img.naturalWidth, h: img.naturalHeight, meta: { name: op.label, model: 'Default' }, preset: op.id, presetDark: dark };
  });
  const had = op && list.findIndex(s => s.preset === op.id);
  if (op && had >= 0 && !!list[had].product?.presetDark !== dark) load(had);
  if (op && had < 0) {
    const [x, y, w, h] = op.box.map(v => v / 3000);
    const st = asset.stage;
    const slot = newSlot(0);
    slot.preset = op.id;
    // 그림자는 이미지에 이미 들어 있다 — 빌더 그림자(접지·바닥)는 꺼 두고 필요하면 패널에서 켠다
    slot.fx.contact.on = false;
    slot.fx.floor.on = false;
    Object.assign(slot.place, { scale: h / st.h, dx: x + w / 2 - st.cx, dy: y + h - st.bottom });
    // 1 번 칸으로 — 비어 있는 1 번 칸은 그 자리를 쓰고, 제품이 있으면 앞에 끼운다
    if (!list[0].product) list[0] = slot; else list.unshift(slot);
    state.active = 0;
    load(0);
  }
  buildProductList();
  update();
}

/** 프리뷰에서 지우기 — 칸이 여럿이면 칸째로, 하나뿐이면 사진만 비운다 (링크·업로드 자리는 남긴다) */
function removeSlot(i) {
  const slot = state.slots[i];
  if (!slot) return;
  if (state.slots.length === 1) { slot.product = null; slot.preset = null; }
  else state.slots.splice(i, 1);
  state.guide = false;
  if (state.active >= state.slots.length || state.active > i) state.active = Math.max(0, state.active - 1);
  buildProductList();
  update();
}

canvasEl.addEventListener('pointermove', e => {
  if (!e.target.closest('#overlay') || !state.bg) return;
  if (state.erasing) moveBrushCursor(e);
  if (!gesture) return;
  const p = toBg(e);
  if (gesture.kind === 'corner') {
    const slot = state.slots[gesture.i];
    const r = productRect(slot);
    if (r) slot.screen.quadN[gesture.k] = { x: (p.x - r.x) / r.w, y: (p.y - r.y) / r.h };
    update();
    return;
  }
  if (gesture.kind === 'erase') {
    paintEraser(gesture.last, p);
    gesture.last = p;
    return;
  }
  if (gesture.kind === 'scale') {
    // 맞은편 모서리에서 손까지 거리 비로 키운다 — 가로세로 같은 비율 (20~300%)
    const { i, c, anchor, d0, s0 } = gesture;
    const slot = state.slots[i];
    const st = findAsset(state.selectedId).asset.stage;
    const { w: W, h: H } = state.bg;
    const scale = Math.min(3, Math.max(0.2, s0 * Math.hypot(p.x - anchor.x, p.y - anchor.y) / Math.max(1, d0)));
    const h = st.h * H * scale;
    const w = h * (slot.product.w / slot.product.h);
    const x = c.includes('w') ? anchor.x - w : anchor.x;
    const y = c.includes('n') ? anchor.y - h : anchor.y;
    Object.assign(slot.place, { scale, dx: (x + w / 2) / W - st.cx, dy: (y + h) / H - st.bottom });
    update();
    return;
  }
  // 위치는 배경 대비 비율로 — 다른 에셋으로 바꿔도 같은 자리에 선다
  const place = state.slots[gesture.i].place;
  place.dx = gesture.dx + (p.x - gesture.from.x) / state.bg.w;
  place.dy = gesture.dy + (p.y - gesture.from.y) / state.bg.h;
  update();
});

canvasEl.addEventListener('pointerup', () => {
  const moved = gesture?.kind === 'move' || gesture?.kind === 'scale';
  if (gesture?.kind === 'corner') {
    const slot = state.slots[gesture.i];
    slot.screen.method = 2; // 손으로 고친 영역
    sampleQuad(slot);
    gesture = null;
    update();
    return;
  }
  gesture = null;
  // 끄는 동안 미뤄 둔 배경 색 계산을 손을 뗄 때 한 번 한다
  if (moved) update();
});
canvasEl.addEventListener('pointerleave', () => { const c = $('#brushCursor'); if (c) c.hidden = true; }, true);

// i 안내 창 — 하나를 body 에 두고 아이콘 옆에 띄운다 (Edit panel 은 넘치면 잘려서 그 안에 못 둔다)
const infoPop = document.createElement('div');
infoPop.className = 'tb-info-pop';
infoPop.hidden = true;
document.body.append(infoPop);
let infoPinned = null;
function showInfo(dot) {
  const info = INFO[dot.dataset.info];
  if (!info) return;
  infoPop.innerHTML = `
    <div class="tb-info-img${info.video ? ' video' : ''}">${info.video
      ? `<video src="${ASSET_DIR}/${info.video}" autoplay muted loop playsinline></video>`
      : info.img ? `<img src="${ASSET_DIR}/${info.img}" alt="" draggable="false" />` : ''}</div>
    <p class="tb-info-title">${esc(info.title)}</p>
    <p class="tb-info-text">${esc(info.text)}</p>`;
  infoPop.hidden = false;
  placeInfo(dot);
  // 영상은 크기를 읽은 뒤에야 창 높이가 정해진다 — 그때 한 번 더 자리를 잡는다
  infoPop.querySelector('video')?.addEventListener('loadedmetadata', () => placeInfo(dot), { once: true });
}
function placeInfo(dot) {
  // 아이콘 아래, 넘치면 위로. 화면 오른쪽 끝을 넘지 않게
  const r = dot.getBoundingClientRect();
  const w = infoPop.offsetWidth, h = infoPop.offsetHeight;
  const left = Math.max(12, Math.min(r.left - 12, innerWidth - w - 12));
  const top = r.bottom + 8 + h > innerHeight - 12 ? r.top - 8 - h : r.bottom + 8;
  Object.assign(infoPop.style, { left: `${left}px`, top: `${Math.max(12, top)}px` });
}
function hideInfo() { infoPop.hidden = true; infoPinned = null; }
document.addEventListener('mouseover', e => {
  const dot = e.target.closest('.tb-info');
  if (dot && !infoPinned) showInfo(dot);
});
document.addEventListener('mouseout', e => {
  const dot = e.target.closest('.tb-info');
  if (dot && !infoPinned && !dot.contains(e.relatedTarget)) infoPop.hidden = true;
});
// 누르면 고정, 다시 누르거나 바깥을 누르면 닫는다. 아코디언 머리 안에 있어도 머리는 안 눌리게
document.addEventListener('click', e => {
  const dot = e.target.closest('.tb-info');
  if (dot) {
    e.preventDefault();
    e.stopPropagation();
    if (infoPinned === dot) return hideInfo();
    infoPinned = dot;
    showInfo(dot);
    return;
  }
  if (infoPinned && !infoPop.contains(e.target)) hideInfo();
}, true);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !infoPop.hidden) hideInfo();
  if (e.key !== 'Escape' || document.querySelector('.pi-backdrop')) return;
  if (state.erasing) setErasing(false);
  if (state.picking !== null) { state.picking = null; state.pickPts = []; update(); }
  if (state.sampling) setSampling(false);
});

// ── 다운로드 — 정사각 전체를 원본 해상도로 ───────────────────

$('#download').addEventListener('click', () => {
  const comp = $('#comp');
  if (!comp || !state.bg) return;
  // 화면용 캔버스를 그대로 쓰면 지우개 표시 등과 섞일 일이 없도록 새로 그린다
  const out = document.createElement('canvas');
  out.width = state.bg.w;
  out.height = state.bg.h;
  paint(out.getContext('2d'));
  out.toBlob(blob => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `trade-in-up-${state.selectedId}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
});

/**
 * 사이드바 폭 드래그 — 값은 localStorage 에 남기고, 더블클릭하면 기본값으로.
 * side: 오른쪽으로 끌 때 폭이 늘어나는 쪽이 'left'.
 */
function dragWidth(panel, handle, key, initial, min, max, side) {
  const apply = w => { panel.style.width = `${w}px`; };
  let w = initial;
  try {
    const saved = Number(localStorage.getItem(key));
    if (saved >= min && saved <= max) w = saved;
  } catch { /* storage unavailable */ }
  apply(w);
  const save = () => { try { localStorage.setItem(key, String(w)); } catch { /* ignore */ } };

  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = w;
    handle.classList.add('dragging');
    const move = ev => {
      const d = ev.clientX - x0;
      w = Math.min(max, Math.max(min, side === 'left' ? w0 + d : w0 - d));
      apply(w);
    };
    const up = () => {
      handle.classList.remove('dragging');
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      save();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });
  handle.addEventListener('dblclick', () => { w = initial; apply(w); save(); });
}

dragWidth($('#leftPanel'), $('#leftDrag'), 'tib.leftW', 320, 256, 520, 'left');
dragWidth($('#rightPanel'), $('#rightDrag'), 'tib.rightW', 384, 300, 640, 'right');

selectAsset(null);

// 구워 둔 에셋 목록을 읽고 팔레트를 다시 그린다 (스크립트를 다시 돌린 뒤 새로고침하면 반영)
fetch(`${ASSET_DIR}/manifest.json`, { cache: 'no-cache' })
  .then(r => (r.ok ? r.json() : []))
  .then(list => {
    manifest = new Map(list.map(m => [m.id, m]));
    // 아이콘 없는 컷(ni-b1-<컷>[-dark]…)은 두 버전 id(<버전>-b1-<컷>[-dark]-ni…)로도 찾게 한다 — fileOf 의 반대
    for (const m of list) {
      const hit = m.id.match(/^ni-(b1-\d\d-\d\d(?:-dark)?)(.*)$/);
      if (hit) for (const v of VERSIONS) manifest.set(`${v.key}-${hit[1]}-ni${hit[2]}`, m);
    }
    renderPalette();
  })
  .catch(err => console.error('[manifest]', err));
