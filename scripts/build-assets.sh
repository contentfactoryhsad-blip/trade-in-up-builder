#!/bin/sh
# Trade In-Up Builder 에셋 굽기 — source/ 의 3077×3077 원본(장당 6~9MB)을 그대로 못 쓰므로
# BF 빌더(buildContentTemplateAssets)처럼 팔레트 썸네일 / 캔버스 미리보기 / Edit panel 원본 프레임을 따로 만든다.
#   thumb   : 팔레트 타일(140×76)용 — 가운데를 잘라 280×152 (2x)
#   preview : 캔버스 980×464 박스용 — 원본 높이의 1/3.3 을 가운데에서 잘라 1960×928 (BF 는 2.5 — 무대가 작아 더 당겼다)
#   frame   : Edit panel 정사각 전체 프레임 — 1200×1200
#   stage   : 합성 바탕 — 원본 해상도 그대로 (PNG 다운로드가 이 크기로 나간다)
#
# 버전 두 벌 — 박스 배치·파일명은 같고 아이콘(화살표)만 다르다:
#   Trade In : source/<라인>/…            → id in-<라인>-<파일명>
#   Trade Up : source/trade up/<라인>/…   → id up-<라인>-<파일명>
# 줄마다 Light / Dark 톤 — Dark 는 같은 버전 폴더 아래 dark/ 에 같은 이름으로 둔다:
#   source/dark/<라인>/…, source/trade up/dark/<라인>/…   → id 끝에 -dark (예 in-b1-01-01-dark)
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

# 사용법: bake <id> <타일용 원본> <캔버스·패널용 원본> [타일 가로 비율 %, 기본 52] [타일 세로 중심 %, 기본 50] [타일 가로 중심 %, 기본 50] [미리보기 세로 중심 %, 기본 50 — builder-app.js 의 previewCy 와 맞춘다]
# 빈 무대(_no product)가 아직 없으면 타일용 원본으로 대신 굽고 경고만 남긴다 — 들어오면 다시 돌리면 된다
bake() {
  id=$1; tile=$2; stage=$3; tw=${4:-52}; ty=${5:-50}; tx=${6:-50}; py=${7:-50}
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
  ph=$((n * 10 / 33))
  if [ "$py" = 50 ]; then poff=""; else poff="--cropOffset $((n * py / 100 - ph / 2)) $(((n - ph * 980 / 464) / 2))"; fi
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

# 팔레트에는 제품이 있는 컷, 캔버스에는 제품을 얹을 빈 무대(-no product)를 보여준다.
# source/ 는 라인(폴더)별로 나뉘고, 파일명 순서가 팔레트 순서다. id = b<라인>-<파일명>
#   basic 01 — 단상이 둥근 컷: 01-01 TV · 01-02 TV+구형 · 02-01 냉장고 · 02-02 냉장고+구형
#   basic 02 — 흰 계단 단상 컷: 01-0N TV · 02-0N 냉장고
# 냉장고처럼 키 큰 제품이 있는 컷과 basic 02(피사체가 위로 높다)는 타일을 넓게(70%) 잘라야 위가 안 잘린다
# 사용법: bake_set <버전> <그 버전·톤의 source 하위 폴더> [id 끝붙이] [basic 02 폴더 — 1023 정리로 옮겨 간 줄] [basic 01 폴더]
# basic 02 를 1023 정리에서 가져올 때는 빈 무대 컷이 없어 제품 있는 컷이 무대가 되고,
# 피사체가 원본 가운데에 작게 있어 타일을 당겨 자른다 (가로 54% — TV 세로 중심 47%, 냉장고 48%)
bake_set() {
  v=$1; dir=$2; t=${3:-}; b2=${4:-}; b1=${5:-$dir/basic 01}
  # basic 01 — 1023 정리 새 컷(3000²). 빈 무대 컷이 없으면 제품 있는 컷이 무대가 된다.
  # 피사체가 원본 가운데에 작게 있어 타일을 당겨 자른다. 같은 단상이라 폭(60%)은 맞추고,
  # 냉장고 컷은 위가 높아 타일·미리보기 중심을 조금 올린다 (미리보기 47% — builder-app.js previewCy)
  # b1 = skip : 이 버전의 basic 01 은 컷 폴더(bake_cut)로 따로 굽는다
  if [ "$b1" != skip ]; then
    for f in 01-01 01-02; do bake $v-b1-$f$t "$b1/$f.png" "$b1/$f-no product.png" 60 50 51; done
    for f in 02-01 02-02; do bake $v-b1-$f$t "$b1/$f.png" "$b1/$f-no product.png" 60 48 51 47; done
  fi
  # b2 = skip : 이 버전의 basic 02 는 비워 둔다 (Trade In basic 02 는 옛 Trade Up 컷이라 빼 두었다 — 새로 만드는 중)
  [ "$b2" = skip ] && return 0
  if [ -n "$b2" ]; then
    # 01(TV)·02(냉장고)는 같은 단상에 높이만 다르다 — 단상 폭이 같아 보이게 가로 비율을 맞추고, 냉장고 컷은 단상이 조금 낮아 중심만 내린다
    for f in 01-01 01-02; do bake $v-b2-$f$t "$b2/$f.png" "$b2/$f.png" 54 47; done
    for f in 02-01 02-02; do bake $v-b2-$f$t "$b2/$f.png" "$b2/$f.png" 54 48; done
    return 0
  fi
  bake $v-b2-01-01$t "$dir/basic 02/01-01.png" "$dir/basic 02/01-01-no product.png" 70
  bake $v-b2-01-02$t "$dir/basic 02/01-02.png" "$dir/basic 02/01-02-no product.png" 70
  bake $v-b2-02-01$t "$dir/basic 02/02-01.png" "$dir/basic 02/02-01-no product.png" 70
  bake $v-b2-02-02$t "$dir/basic 02/02-02.png" "$dir/basic 02/02-02-no product.png" 70
}

bake_set in "." "" skip skip
bake_set in "dark" -dark
bake_set up "trade up" "" "1023 정리/trade up/basic 2"
bake_set up "trade up/dark" -dark

NEW="1023 정리"
# 컷 폴더 — "1023 정리/<버전>/<라인>/<컷>/" 에 컷마다 정리해 둔 것
#   <컷>-thumbnail[-dark].png              : 팔레트 타일 (제품 합성된 컷) — 톤마다. <컷>/ 나 <컷>/<톤>/ 어느 쪽에 있어도 된다
#   <톤>/<컷>[-dark].png                   : 캔버스·패널 빈 무대 = Background Color 01 Standard (없으면 썸네일 컷으로 대신)
#   <톤>/<컷>-color-0N[-dark].png          : 02~06 (color-01~05) → id 끝 -color-0N
#   <톤>/<컷>-color-eco[-dark].png         : 07 Eco → id 끝 -eco
#   없는 변형은 건너뛴다 (그 칸을 골라도 기본 컷 그대로)
# 사용법: bake_cut <id 머리 (예 in-b2)> <라인 폴더> <컷> <컬러 칸 SWATCH "x y 한변"> [bake 의 타일·미리보기 인자…]
first_of() { for c in "$@"; do [ -f "$SRC/$c" ] && { echo "$c"; return 0; }; done; return 0; }
bake_cut() {
  pre=$1; ld=$2; f=$3; csw=$4; shift 4
  for tone in light dark; do
    [ $tone = dark ] && t=-dark || t=""
    d="$ld/$f/$tone"
    th=$(first_of "$ld/$f/$f-thumbnail$t.png" "$d/$f-thumbnail$t.png" "$ld/$f/$f-$f-thumbnail$t.png" "$d/$f-$f-thumbnail$t.png")
    [ -n "$th" ] || { echo "  - $ld/$f $tone 썸네일 없음 — $pre-$f$t 는 빈 박스"; continue; }
    st=$(first_of "$d/$f$t.png")
    if [ -z "$st" ]; then bake $pre-$f$t "$th" "$th" "$@"; continue; fi
    SWATCH=$csw
    bake $pre-$f$t "$th" "$st" "$@"
    for c in 01 02 03 04 05; do [ -f "$SRC/$d/$f-color-$c$t.png" ] && bake $pre-$f$t-color-$c "$th" "$d/$f-color-$c$t.png" "$@"; done
    [ -f "$SRC/$d/$f-color-eco$t.png" ] && bake $pre-$f$t-eco "$th" "$d/$f-color-eco$t.png" "$@"
    SWATCH=""
  done
  return 0
}

# Trade In basic 01 — 둥근 단상. 같은 단상이라 폭(60%)은 맞추고, 냉장고 컷은 타일·미리보기 중심을 조금 올린다 (미리보기 47% — builder-app.js previewCy)
TI1="$NEW/trade in/basic 1"
for f in 01-01 01-02; do bake_cut in-b1 "$TI1" $f "1250 600 500" 60 50 51; done
for f in 02-01 02-02; do bake_cut in-b1 "$TI1" $f "1250 600 500" 60 48 51 47; done
# Trade In basic 02 — 흰 계단 단상. 컬러 칸은 단상 위 배경(원본 1250,600 에서 500px)
TI2="$NEW/trade in/basic 2"
# 미리보기 중심 — TV 컷 48%, 냉장고 컷 47% (builder-app.js previewCyBy)
for f in 01-01 01-02; do bake_cut in-b2 "$TI2" $f "1250 600 500" 54 47 50 48; done
for f in 02-01 02-02; do bake_cut in-b2 "$TI2" $f "1250 600 500" 54 48 50 47; done

# Slot — 지금은 02 만 (01 은 사이즈 베리에이션용으로 나중에).
#   02-eco = 같은 배치에 컬러 띠 녹색 + 아이콘 우드 → Edit panel Background Color 의 07 Eco 를 고르면 이걸로 바뀐다
#   컬러 칸은 아이콘 아래 띠의 빈 자리(원본 1450,1725 에서 100px)를 잘라 쓴다
for v in in up; do
  [ $v = in ] && d="$NEW/trade in" || d="$NEW/trade up"
  SWATCH="1450 1725 100"
  bake $v-slot-02 "$d/slot/02.png" "$d/slot/02.png" 54
  bake $v-slot-02-eco "$d/slot/02-eco.png" "$d/slot/02-eco.png" 54
  SWATCH=""
done

printf '[%s\n]\n' "$MANIFEST" > "$OUT/manifest.json"
echo "manifest: $OUT/manifest.json"
