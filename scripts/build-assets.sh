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

NEW="1102 정리"
first_of() { for c in "$@"; do [ -f "$SRC/$c" ] && { echo "$c"; return 0; }; done; return 0; }

# 새로 굽는 줄의 옛 결과물은 먼저 지운다 — 원본에서 빠진 변형이 남아 있지 않게
rm -f "$OUT"/in-b1-* "$OUT"/up-b1-* "$OUT"/in-slot-* "$OUT"/up-slot-*

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
#   <톤>/<컷>-standard.png             : 캔버스·패널 빈 무대 = Background Color 01 Standard (없으면 썸네일로 대신)
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
    bake $pre-$f$t "$th" "$d/$f-standard.png" "$@"
    for c in 01 02 03 04 05; do [ -f "$SRC/$d/$f-color-$c.png" ] && bake $pre-$f$t-color-$c "$th" "$d/$f-color-$c.png" "$@"; done
    [ -f "$SRC/$d/$f-color-eco.png" ] && bake $pre-$f$t-eco "$th" "$d/$f-color-eco.png" "$@"
    # No Old Product — <컷>/noproduct-standard/<톤>/<컷>-noproduct-{standard,color-0N,color-eco}.png (01-02 · 02-02 만)
    #   미리보기 오른쪽 위 No Old Product 를 켜면 이 컷으로 바뀐다 → id <컷>[-dark]-np[-color-0N|-eco]
    npd="$ld/$f/noproduct-standard/$tone"
    if [ -f "$SRC/$npd/$f-noproduct-standard.png" ]; then
      bake $pre-$f$t-np "$th" "$npd/$f-noproduct-standard.png" "$@"
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

# Slot — "1102 정리/<버전>/slot/<가로형|세로형>/" → id <버전>-slot-h / -slot-v (톤 없음)
#   standard-thumbnail.png : 팔레트 타일 (칸에 제품이 든 컷)
#   img/standard.png       : 캔버스·패널 무대 (빈 칸), img/color-0N.png · img/color-eco.png = Background Color 02~07
#   컬러 칸은 컬러 띠의 빈 자리 — 가로형은 아이콘 왼쪽(1060,1300 에서 150px), 세로형은 아이콘 아래(1430,1710 에서 100px)
bake_slot() {
  v=$1; shape=$2; key=$3; SWATCH=$4
  d="$NEW/trade-$v/slot/$shape"
  bake $v-slot-$key "$d/standard-thumbnail.png" "$d/img/standard.png" 54
  for c in 01 02 03 04 05; do [ -f "$SRC/$d/img/color-$c.png" ] && bake $v-slot-$key-color-$c "$d/standard-thumbnail.png" "$d/img/color-$c.png" 54; done
  [ -f "$SRC/$d/img/color-eco.png" ] && bake $v-slot-$key-eco "$d/standard-thumbnail.png" "$d/img/color-eco.png" 54
  SWATCH=""
  return 0
}
for v in in up; do
  bake_slot $v 가로형 h "1060 1300 150"
  bake_slot $v 세로형 v "1430 1710 100"
done

printf '[%s\n]\n' "$MANIFEST" > "$OUT/manifest.json"
echo "manifest: $OUT/manifest.json"
