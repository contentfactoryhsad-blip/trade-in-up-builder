#!/bin/sh
# Trade In-Up Builder 에셋 굽기 — source/ 의 3077×3077 원본(장당 6~9MB)을 그대로 못 쓰므로
# BF 빌더(buildContentTemplateAssets)처럼 팔레트 썸네일 / 캔버스 미리보기 / Edit panel 원본 프레임을 따로 만든다.
#   thumb   : 팔레트 타일(140×76)용 — 가운데를 잘라 280×152 (2x)
#   preview : 캔버스 980×464 박스용 — 원본 높이의 1/3.3 을 가운데에서 잘라 1960×928 (BF 는 2.5 — 무대가 작아 더 당겼다)
#   frame   : Edit panel 정사각 전체 프레임 — 1200×1200
#   stage   : 합성 바탕 — 원본 해상도 그대로 (PNG 다운로드가 이 크기로 나간다)
#
# 원본 = source/1102 정리/<trade-in|trade-up>/… (아래 bake_cut · bake_slot 주석). 버전 두 벌은 박스 배치·파일명이 같고 아이콘(화살표)만 다르다
#   id = <in|up>-<줄>-<컷>[-dark][-np][-color-0N|-eco]  (예 in-b1-01-01-dark-color-02, up-slot-h-eco)
# 원본이 없는 박스는 건너뛰고(빈 박스로 남는다), 구운 목록은 manifest.json 에 적는다 — 빌더가 이걸 읽는다.
#
#   sh scripts/build-assets.sh
set -e
cd "$(dirname "$0")/.."
SRC=source
OUT=public/assets/trade-in-up
mkdir -p "$OUT"

# 원본마다 크기가 달라서(01 = 3077², 02 = 2533²) 자르는 영역은 원본 한 변에 대한 비율로 잡는다
#   thumb   : 가로 0.52 × 세로 0.2823 (140:76) — 키 큰 제품 컷은 넷째 인자로 가로 비율을 넓힌다(%)
#   preview : 세로 1/3.3, 가로는 980:464 로
size_of() { sips -g pixelWidth "$1" | awk '/pixelWidth/ {print $2}'; }
height_of() { sips -g pixelHeight "$1" | awk '/pixelHeight/ {print $2}'; }
MANIFEST=""

# 사용법: bake <id> <타일용 원본> <캔버스·패널용 원본> [타일 가로 비율 %, 기본 52] [타일 세로 중심 %, 기본 50] [타일 가로 중심 %, 기본 50] [미리보기 세로 중심 %, 기본 50 — builder-app.js 의 previewCy 와 맞춘다] [미리보기 줌 ×10, 기본 33 — previewZoom 과 맞춘다]
# 빈 무대(_no product)가 아직 없으면 타일용 원본으로 대신 굽고 경고만 남긴다 — 들어오면 다시 돌리면 된다
bake() {
  id=$1; tile=$2; stage=$3; tw=${4:-52}; ty=${5:-50}; tx=${6:-50}; py=${7:-50}; pz=${8:-33}
  if [ ! -f "$SRC/$tile" ]; then
    echo "  - $tile 없음 — $id 는 빈 박스"
    return 0
  fi
  if [ ! -f "$SRC/$stage" ]; then
    echo "  ! $stage 없음 — $tile 로 대신 굽는다"
    stage=$tile
  fi
  n=$(size_of "$SRC/$tile")
  tcw=$((n * tw / 100))
  tch=$((tcw * 76 / 140))
  # 세로 중심을 따로 주지 않으면 sips 기본(가운데) 자르기 — 이미 구운 타일이 1px 도 바뀌지 않게
  if [ "$ty" = 50 ] && [ "$tx" = 50 ]; then off=""; else off="--cropOffset $((n * ty / 100 - tch / 2)) $((n * tx / 100 - tcw / 2))"; fi
  sips -s format jpeg -s formatOptions 85 -c $tch $tcw $off "$SRC/$tile" --out "$OUT/$id-thumb.jpg" >/dev/null
  sips -z 152 280 "$OUT/$id-thumb.jpg" >/dev/null
  n=$(size_of "$SRC/$stage")
  ph=$((n * 10 / pz))
  if [ "$py" = 50 ] && [ "$pz" = 33 ]; then poff=""; else poff="--cropOffset $((n * py / 100 - ph / 2)) $(((n - ph * 980 / 464) / 2))"; fi
  sips -s format jpeg -s formatOptions 85 -c $ph $((ph * 980 / 464)) $poff "$SRC/$stage" --out "$OUT/$id-preview.jpg" >/dev/null
  sips -z 928 1960 "$OUT/$id-preview.jpg" >/dev/null
  sips -s format jpeg -s formatOptions 85 -Z 1200 "$SRC/$stage" --out "$OUT/$id-frame.jpg" >/dev/null
  sips -s format jpeg -s formatOptions 92 "$SRC/$stage" --out "$OUT/$id-stage.jpg" >/dev/null
  # Background Color 칸 — SWATCH="x y 한변" (원본 픽셀) 이 있으면 그 자리(에셋의 컬러 부분)를 잘라 둔다. 원 모양은 CSS 가 만든다
  sw=""
  if [ -n "${SWATCH:-}" ]; then
    set -- $SWATCH
    sips -s format jpeg -s formatOptions 90 -c $3 $3 --cropOffset $2 $1 "$SRC/$stage" --out "$OUT/$id-swatch.jpg" >/dev/null
    sips -z 96 96 "$OUT/$id-swatch.jpg" >/dev/null
    sw=", \"swatch\": true"
  fi
  # 원본 크기는 Edit panel 표기용
  MANIFEST="$MANIFEST${MANIFEST:+,}
  { \"id\": \"$id\", \"w\": $(size_of "$SRC/$stage"), \"h\": $(height_of "$SRC/$stage")$sw }"
  echo "baked $id"
}

NEW="1102 정리"

# 팔레트 타일(-thumb.jpg)만 — bake 의 타일 자르기와 같은 값. 사용법은 bake 의 앞 두 인자 + 타일 인자
thumb_only() {
  id=$1; tile=$2; tw=${3:-52}; ty=${4:-50}; tx=${5:-50}
  n=$(size_of "$SRC/$tile")
  tcw=$((n * tw / 100))
  tch=$((tcw * 76 / 140))
  if [ "$ty" = 50 ] && [ "$tx" = 50 ]; then off=""; else off="--cropOffset $((n * ty / 100 - tch / 2)) $((n * tx / 100 - tcw / 2))"; fi
  sips -s format jpeg -s formatOptions 85 -c $tch $tcw $off "$SRC/$tile" --out "$OUT/$id-thumb.jpg" >/dev/null
  sips -z 152 280 "$OUT/$id-thumb.jpg" >/dev/null
  echo "thumb $id"
}
first_of() { for c in "$@"; do [ -f "$SRC/$c" ] && { echo "$c"; return 0; }; done; return 0; }

# 새로 굽는 줄의 옛 결과물은 먼저 지운다 — 원본에서 빠진 변형이 남아 있지 않게
rm -f "$OUT"/in-b1-* "$OUT"/up-b1-* "$OUT"/ni-b1-* "$OUT"/in-slot-* "$OUT"/up-slot-*

# 원본이 더는 없는 줄(Basic 02 — 팔레트에서 숨김)은 이미 구운 파일과 manifest 항목을 그대로 둔다
if [ -f "$OUT/manifest.json" ]; then
  for keep in $(grep -o '"id": "[a-z]*-b2-[^"]*"' "$OUT/manifest.json" | sed 's/"id": "//; s/"$//'); do
    line=$(grep "\"id\": \"$keep\"" "$OUT/manifest.json" | sed 's/,$//; s/^ *//')
    [ -f "$OUT/$keep-stage.jpg" ] && MANIFEST="$MANIFEST${MANIFEST:+,}
  $line"
  done
fi

# Basic 01 — "1102 정리/<trade-in|trade-up>/basic/<컷>/" (둥근 단상: 01-01 TV · 01-02 TV+구형 · 02-01 냉장고 · 02-02 냉장고+구형)
#   <컷>-thumbnail-<톤>.png            : 팔레트 타일 (제품 합성된 컷)
#   <톤>/<컷>-standard.png             : 캔버스·패널 빈 무대 = Background Color 01 Standard (Light 만 — Dark 는 02~06 만 있다)
#   <톤>/<컷>-color-0N.png             : 02~06 → id 끝 -color-0N
#   <톤>/<컷>-color-eco.png            : 07 Eco → id 끝 -eco
#   Dark 는 id 끝 -dark. 없는 변형은 건너뛴다 (그 칸을 골라도 기본 컷 그대로)
# 사용법: bake_cut <id 머리 (예 in-b1)> <라인 폴더> <컷> <컬러 칸 SWATCH "x y 한변"> [bake 의 타일·미리보기 인자…]
bake_cut() {
  pre=$1; ld=$2; f=$3; csw=$4; shift 4
  for tone in light dark; do
    [ $tone = dark ] && t=-dark || t=""
    d="$ld/$f/$tone"
    th=$(first_of "$ld/$f/$f-thumbnail-$tone.png")
    [ -n "$th" ] || { echo "  - $ld/$f $tone 썸네일 없음 — $pre-$f$t 는 빈 박스"; continue; }
    SWATCH=$csw
    # Dark 는 Standard 컷이 없다 (Background Color 02~06 만) — 팔레트 타일만 굽고 manifest 에는 넣지 않는다
    if [ $tone = dark ]; then thumb_only $pre-$f$t "$th" "$@"; else bake $pre-$f$t "$th" "$d/$f-standard.png" "$@"; fi
    for c in 01 02 03 04 05; do [ -f "$SRC/$d/$f-color-$c.png" ] && bake $pre-$f$t-color-$c "$th" "$d/$f-color-$c.png" "$@"; done
    [ -f "$SRC/$d/$f-color-eco.png" ] && bake $pre-$f$t-eco "$th" "$d/$f-color-eco.png" "$@"
    # No Old Product — <컷>/noproduct-standard/<톤>/<컷>-noproduct-{standard,color-0N,color-eco}.png (01-02 · 02-02 만)
    #   미리보기 오른쪽 위 No Old Product 를 켜면 이 컷으로 바뀐다 → id <컷>[-dark]-np[-color-0N|-eco]
    npd="$ld/$f/noproduct-standard/$tone"
    if [ -d "$SRC/$npd" ]; then
      [ $tone = light ] && [ -f "$SRC/$npd/$f-noproduct-standard.png" ] && bake $pre-$f$t-np "$th" "$npd/$f-noproduct-standard.png" "$@"
      for c in 01 02 03 04 05; do [ -f "$SRC/$npd/$f-noproduct-color-$c.png" ] && bake $pre-$f$t-np-color-$c "$th" "$npd/$f-noproduct-color-$c.png" "$@"; done
      [ -f "$SRC/$npd/$f-noproduct-color-eco.png" ] && bake $pre-$f$t-np-eco "$th" "$npd/$f-noproduct-color-eco.png" "$@"
    fi
    SWATCH=""
  done
  return 0
}

# 같은 단상이라 폭(60%)은 맞추고, TV 컷은 타일 중심을 48% 로 올려 그림을 조금 내리고(사용자 요청), 냉장고 컷은 타일·미리보기 중심을 조금 올린다 (미리보기 47% — builder-app.js previewCy)
# 컬러 칸은 단상 위 배경(원본 1250,600 에서 500px)
for v in in up; do
  ld="$NEW/trade-$v/basic"
  # TV 컷 미리보기 중심 48% — 캔버스 그림을 조금 내린다 (builder-app.js previewCy, 사용자 요청)
  for f in 01-01 01-02; do bake_cut $v-b1 "$ld" $f "1250 600 500" 60 48 51 48; done
  # 냉장고 타일 중심 — 02-01 은 45%, 02-02 는 47%. 미리보기 중심 — 02-01 47%, 02-02 49% (그림을 조금 올린다). 사용자 요청
  bake_cut $v-b1 "$ld" 02-01 "1250 600 500" 60 45 51 47
  bake_cut $v-b1 "$ld" 02-02 "1250 600 500" 60 47 51 49
done

# 아이콘 없는 컷 (미리보기 오른쪽 위 Standard) — "1102 정리/basic-noicon/<컷>/<톤>/color-{standard,0N,eco}.png"
#   Trade In · Up 이 같은 그림이라 한 번만 굽는다 → id ni-b1-<컷>[-dark][-color-0N|-eco]. 빌더가 <버전>-b1-<컷>[-dark]-ni… 로 읽는다
#   구형 제품(01-02 · 02-02)도 빠진 컷. 타일·미리보기 자리는 위 bake_cut 과 같은 값
bake_noicon() {
  f=$1; shift
  for tone in light dark; do
    [ $tone = dark ] && t=-dark || t=""
    d="$NEW/basic-noicon/$f/$tone"
    SWATCH="1250 600 500"
    [ -f "$SRC/$d/color-standard.png" ] && bake ni-b1-$f$t "$d/color-standard.png" "$d/color-standard.png" "$@"
    for c in 01 02 03 04 05; do [ -f "$SRC/$d/color-$c.png" ] && bake ni-b1-$f$t-color-$c "$d/color-$c.png" "$d/color-$c.png" "$@"; done
    [ -f "$SRC/$d/color-eco.png" ] && bake ni-b1-$f$t-eco "$d/color-eco.png" "$d/color-eco.png" "$@"
    SWATCH=""
  done
  return 0
}
for f in 01-01 01-02; do bake_noicon $f 60 48 51 48; done
bake_noicon 02-01 60 45 51 47
bake_noicon 02-02 60 47 51 49

# Slot — id <버전>-slot-v (세로형 = 아이콘 아래 칸 넷 한 줄, 1:4) / -slot-h (가로형 = 아이콘 양옆 두 칸씩, 2:2) (톤 없음)
#   원본 = "1102 정리/<버전>/slot-new/<세로형|가로형>/"
#     thumbnail.png : 팔레트 타일 (칸에 제품이 든 컷, 배경 있음)
#     no product.png : 캔버스·패널 무대 (빈 칸), no product-eco.png = Background Color 07 Eco (나무 아이콘)
#     무대 컷은 배경이 투명하다 (배경 컬러는 Figma 에서 따로 입힌다) — 굽기 전에 배경을 깔아 source/.flat/ 에 둔다
#       배경 = "1102 정리/slot-new/bg/" (3000², In·Up 공통) — standard.png = Standard 01, color-01~05.png = 컬러 02~06, eco.png = Eco 07 (없으면 바탕색 240,236,228)
#         Figma "Trade In Up - Product Slot BG" 컴포넌트의 배경(레이어 위에서부터 Standard → … → Eco)에 흰색 50% 를 씌운 값
#         = 아이보리 베이지 · 퍼플 · 핑크 · 오렌지 · 옐로 · (06 없음) · 그린
#       매체 사이즈 미리보기용으로 같은 배경을 줄여 assets/trade-in-up/slot-bg/<standard|color-0N|eco>.jpg 에도 둔다 (lib/channelSlots.js drawProductSlot 이 판에 cover 로 깐다)
#   세로형 : 그림(아이콘 위끝 975 ~ 칸 아래끝 1816)이 가운데보다 위라 타일 폭 66% · 세로 중심 46%, 미리보기 세로 중심 46% · 줌 2.8 (builder-app.js previewCy · previewZoom)
#            컬러 칸은 아이콘 면 왼쪽 아래(1230,1380 에서 100px — 화살표가 안 걸리는 자리)
#   가로형 : 그림(901~2098 × 1174~1835)이 가운데라 타일 폭 66% · 미리보기 줌 2.8 (세로형과 같은 배율 — 화살표로 넘겨도 아이콘 크기가 같다)
#            컬러 칸은 아이콘 면 왼쪽 아래(1255,1605 에서 60px)
#   배경 컬러 컷(02~06 · Eco)의 컬러 칸은 배경 왼쪽 가운데(200,1350 에서 300px — 아이콘·칸이 없는 자리). Main Key Visual 처럼 Eco 칸도 배경색(그린)
BGDIR="$NEW/slot-new/bg"
# 사용법: flat <투명 원본> <.flat 이름> [배경 이미지 — 없으면 바탕색]
flat() {
  mkdir -p "$SRC/.flat"
  python3 -c "import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGBA')
bg = Image.open(sys.argv[3]).convert('RGBA').resize(im.size) if len(sys.argv) > 3 else Image.new('RGBA', im.size, (240, 236, 228, 255))
bg.alpha_composite(im); bg.convert('RGB').save(sys.argv[2])" "$SRC/$1" "$SRC/.flat/$2.png" ${3:+"$SRC/$3"}
}
# 팔레트 타일 바탕 바꾸기 — thumbnail.png 는 단색 바탕(240,236,228) 위에 아이콘·칸·제품을 합친 컷이라, 배경 없는 no product.png 의 알파
# (칸 = 흰 70%)와 썸네일에만 있는 제품(불투명)만큼 남기고 나머지 바탕을 배경 컷으로 바꾼다. 사용법: rebg_thumb <thumbnail> <no product> <배경> <.flat 이름>
rebg_thumb() {
  mkdir -p "$SRC/.flat"
  python3 -c "import sys, numpy as np
from PIL import Image
t = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(float)
n = np.asarray(Image.open(sys.argv[2]).convert('RGBA')).astype(float)
g = np.asarray(Image.open(sys.argv[3]).convert('RGB').resize((t.shape[1], t.shape[0]))).astype(float)
flat = np.array([240, 236, 228], float)
a = n[..., 3:] / 255
prod = np.abs(t - (n[..., :3] * a + flat * (1 - a))).max(-1, keepdims=True) > 10
a = np.where(prod, 1.0, a)
Image.fromarray(np.clip(t + (1 - a) * (g - flat) + .5, 0, 255).astype(np.uint8)).save(sys.argv[4])" "$SRC/$1" "$SRC/$2" "$SRC/$3" "$SRC/.flat/$4.png"
}
bake_slot() {
  v=$1; shape=$2; key=$3; sw=$4; shift 4
  d="$NEW/trade-$v/slot-new/$shape"
  [ -f "$SRC/$d/no product.png" ] || { echo "  - $d/no product.png 없음 — $v-slot-$key 는 빈 박스"; return 0; }
  std="$BGDIR/standard.png"; [ -f "$SRC/$std" ] || std=""
  # 팔레트 타일 — Standard 배경이 있으면 썸네일 바탕도 그 배경으로 (모든 컬러 칸이 같은 타일을 쓴다)
  slot_tile="$d/thumbnail.png"
  if [ -n "$std" ]; then rebg_thumb "$slot_tile" "$d/no product.png" "$std" "$v-slot-$key-thumb"; slot_tile=".flat/$v-slot-$key-thumb.png"; fi
  # 컬러 칸 — 배경 컷이 있으면 배경(왼쪽 가운데), 없으면 아이콘 면
  if [ -n "$std" ]; then SWATCH="200 1350 300"; else SWATCH=$sw; fi
  # (bake 가 tile · stage 라는 이름을 쓰므로 여기선 다른 이름을 쓴다)
  # 무대 = 칸 없는 컷 (no box.png — PSD 에서 slot 레이어만 빼고 합성) — 칸은 빌더가 Box 탭 설정대로 그린다. 없으면 칸이 구워진 no product.png
  nobox="$d/no box.png"; [ -f "$SRC/$nobox" ] || nobox="$d/no product.png"
  nobox_eco="$d/no box-eco.png"; [ -f "$SRC/$nobox_eco" ] || nobox_eco="$d/no product-eco.png"
  flat "$nobox" "$v-slot-$key" ${std:+"$std"}
  # 칸 위에 다시 얹는 아이콘 — 칸 없는 컷에서 아이콘 자리(1160,950 에서 720×850, 여덟 컷 모두 이 안)만 잘라 둔다 (builder-app SLOT_ICON_CROP)
  mkdir -p "$OUT/slot-icon-stage"
  sips -c 850 720 --cropOffset 950 1160 "$SRC/$nobox" --out "$OUT/slot-icon-stage/$v-$key-clear.png" >/dev/null
  [ -f "$SRC/$nobox_eco" ] && sips -c 850 720 --cropOffset 950 1160 "$SRC/$nobox_eco" --out "$OUT/slot-icon-stage/$v-$key-wood.png" >/dev/null
  bake $v-slot-$key "$slot_tile" ".flat/$v-slot-$key.png" "$@"
  if [ -f "$SRC/$nobox_eco" ]; then
    eco="$BGDIR/eco.png"; [ -f "$SRC/$eco" ] || eco=$std
    [ -f "$SRC/$BGDIR/eco.png" ] && SWATCH="200 1350 300"
    flat "$nobox_eco" "$v-slot-$key-eco" ${eco:+"$eco"}
    bake $v-slot-$key-eco "$slot_tile" ".flat/$v-slot-$key-eco.png" "$@"
  fi
  SWATCH="200 1350 300"
  for c in 01 02 03 04 05; do
    [ -f "$SRC/$BGDIR/color-$c.png" ] || continue
    flat "$nobox" "$v-slot-$key-color-$c" "$BGDIR/color-$c.png"
    bake $v-slot-$key-color-$c "$slot_tile" ".flat/$v-slot-$key-color-$c.png" "$@"
  done
  SWATCH=""
  return 0
}
rm -rf "$SRC/.flat" "$OUT/slot-bg" "$OUT/slot-icon-stage"
mkdir -p "$OUT/slot-bg"
for c in standard color-01 color-02 color-03 color-04 color-05 eco; do
  [ -f "$SRC/$BGDIR/$c.png" ] && sips -s format jpeg -s formatOptions 90 -Z 1500 "$SRC/$BGDIR/$c.png" --out "$OUT/slot-bg/$c.jpg" >/dev/null
done
for v in in up; do
  bake_slot $v 세로형 v "1230 1380 100" 66 46 50 46 28
  bake_slot $v 가로형 h "1255 1605 60" 66 50 50 50 28
done

printf '[%s\n]\n' "$MANIFEST" > "$OUT/manifest.json"
echo "manifest: $OUT/manifest.json"
