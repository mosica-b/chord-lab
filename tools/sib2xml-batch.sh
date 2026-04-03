#!/bin/bash
# ============================================================
# Sibelius .sib → MusicXML 일괄 변환 스크립트
# ============================================================
# 사용법:
#   ./sib2xml-batch.sh /path/to/folder          # 폴더 내 모든 .sib 변환
#   ./sib2xml-batch.sh /path/to/file.sib         # 단일 파일 변환 (테스트용)
#
# 옵션:
#   --dry-run    실제 변환 없이 대상 파일만 출력
#   --skip-done  이미 .musicxml이 있는 파일 건너뛰기 (기본값: ON)
#   --force      이미 .musicxml이 있어도 다시 변환
#   --delay N    파일 간 대기 시간 초 (기본: 3)
#
# 요구사항:
#   - macOS + Sibelius 정식 버전 설치
#   - 시스템 환경설정 > 개인정보 보호 > 손쉬운 사용 > Terminal 허용
#
# 결과: 각 .sib 파일과 같은 폴더에 .musicxml 파일 생성
# 로그: ./sib2xml-batch.log 에 기록
# ============================================================

set -euo pipefail

# --- 옵션 파싱 ---
DRY_RUN=false
SKIP_DONE=true
DELAY=3
TARGET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)   DRY_RUN=true; shift ;;
    --skip-done) SKIP_DONE=true; shift ;;
    --force)     SKIP_DONE=false; shift ;;
    --delay)     DELAY="$2"; shift 2 ;;
    *)           TARGET="$1"; shift ;;
  esac
done

if [ -z "$TARGET" ]; then
  echo "사용법: $0 [옵션] /path/to/folder_or_file.sib"
  echo ""
  echo "옵션:"
  echo "  --dry-run    실제 변환 없이 대상 파일만 출력"
  echo "  --force      이미 .musicxml 있어도 다시 변환"
  echo "  --delay N    파일 간 대기 시간 (기본: 3초)"
  exit 1
fi

LOG_FILE="$(cd "$(dirname "$0")" && pwd)/sib2xml-batch.log"
echo "========================================" >> "$LOG_FILE"
echo "변환 시작: $(date)" >> "$LOG_FILE"
echo "대상: $TARGET" >> "$LOG_FILE"
echo "========================================" >> "$LOG_FILE"

# --- 파일 목록 수집 ---
FILES=()
if [ -f "$TARGET" ] && [[ "$TARGET" == *.sib ]]; then
  FILES+=("$TARGET")
elif [ -d "$TARGET" ]; then
  while IFS= read -r -d '' f; do
    FILES+=("$f")
  done < <(find "$TARGET" -name "*.sib" -print0 | sort -z)
else
  echo "❌ 유효한 .sib 파일 또는 폴더를 지정해주세요."
  exit 1
fi

TOTAL=${#FILES[@]}
if [ "$TOTAL" -eq 0 ]; then
  echo "❌ .sib 파일을 찾을 수 없습니다."
  exit 1
fi

# --- 건너뛸 파일 필터링 ---
TODO=()
SKIPPED=0
for f in "${FILES[@]}"; do
  BASENAME="$(basename "$f" .sib)"
  OUTPUT_DIR="$(dirname "$f")"
  OUTPUT_FILE="$OUTPUT_DIR/$BASENAME.musicxml"
  if [ "$SKIP_DONE" = true ] && [ -f "$OUTPUT_FILE" ]; then
    ((SKIPPED++))
  else
    TODO+=("$f")
  fi
done

TODO_COUNT=${#TODO[@]}

echo "============================================"
echo "  Sibelius .sib → MusicXML 일괄 변환"
echo "============================================"
echo "  전체 .sib 파일: $TOTAL 개"
echo "  이미 변환됨:    $SKIPPED 개 (건너뜀)"
echo "  변환 대상:      $TODO_COUNT 개"
echo "  파일 간 대기:   ${DELAY}초"
echo "  로그 파일:      $LOG_FILE"
echo "============================================"

if [ "$DRY_RUN" = true ]; then
  echo ""
  echo "[DRY RUN] 변환 대상 파일 목록:"
  for f in "${TODO[@]}"; do
    echo "  $f"
  done
  echo ""
  echo "실제 변환하려면 --dry-run을 제거하세요."
  exit 0
fi

if [ "$TODO_COUNT" -eq 0 ]; then
  echo "✅ 모든 파일이 이미 변환되었습니다."
  exit 0
fi

# --- 변환 함수 ---
convert_one() {
  local SIB_FILE="$1"
  local OUTPUT_DIR="$(dirname "$SIB_FILE")"
  local BASENAME="$(basename "$SIB_FILE" .sib)"
  local OUTPUT_FILE="$OUTPUT_DIR/$BASENAME.musicxml"

  osascript <<APPLESCRIPT 2>/dev/null
set sibFile to POSIX file "$SIB_FILE"

tell application "Sibelius"
    activate
    delay 1
    open sibFile
    delay 3
end tell

tell application "System Events"
    tell process "Sibelius"
        -- File > Export > MusicXML
        click menu item "MusicXML..." of menu "Export" of menu item "Export" of menu "File" of menu bar 1
        delay 2

        -- 저장 경로 이동
        keystroke "g" using {command down, shift down}
        delay 1
        keystroke "$OUTPUT_DIR"
        keystroke return
        delay 1

        -- 파일명 설정
        keystroke "a" using {command down}
        keystroke "$BASENAME.musicxml"
        delay 0.5

        -- 저장
        keystroke return
        delay 2

        -- 덮어쓰기 확인
        try
            click button "Replace" of sheet 1 of window 1
            delay 1
        end try
    end tell
end tell

tell application "Sibelius"
    close front document saving no
    delay 1
end tell

return "done"
APPLESCRIPT

  if [ -f "$OUTPUT_FILE" ]; then
    return 0
  else
    return 1
  fi
}

# --- 일괄 변환 실행 ---
SUCCESS=0
FAIL=0
IDX=0

echo ""
for f in "${TODO[@]}"; do
  ((IDX++))
  BASENAME="$(basename "$f" .sib)"
  DIRNAME="$(dirname "$f" | sed "s|$TARGET/||")"

  printf "[%d/%d] %s ... " "$IDX" "$TODO_COUNT" "$BASENAME"

  if convert_one "$f"; then
    echo "✅"
    echo "[OK]  $f" >> "$LOG_FILE"
    ((SUCCESS++))
  else
    echo "❌"
    echo "[FAIL] $f" >> "$LOG_FILE"
    ((FAIL++))
  fi

  # 마지막 파일이 아니면 대기
  if [ "$IDX" -lt "$TODO_COUNT" ]; then
    sleep "$DELAY"
  fi
done

# --- 결과 요약 ---
echo ""
echo "============================================"
echo "  변환 완료!"
echo "============================================"
echo "  성공: $SUCCESS 개"
echo "  실패: $FAIL 개"
echo "  건너뜀: $SKIPPED 개"
echo "  총합: $TOTAL 개"
echo "============================================"
echo ""
echo "변환 완료: $(date)" >> "$LOG_FILE"
echo "성공: $SUCCESS, 실패: $FAIL, 건너뜀: $SKIPPED" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

if [ "$FAIL" -gt 0 ]; then
  echo "⚠️  실패한 파일은 로그에서 확인: $LOG_FILE"
  echo "   grep 'FAIL' $LOG_FILE"
fi
