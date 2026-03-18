#!/bin/bash
# Sibelius .sib → MusicXML 단일 파일 변환 테스트
# 사용법: ./sib2xml-test.sh /path/to/file.sib
#
# 결과: 같은 폴더에 .musicxml 파일 생성
# Sibelius 정식 버전이 설치된 Mac에서 실행

if [ -z "$1" ]; then
  echo "사용법: $0 /path/to/file.sib"
  echo "예시: $0 ~/Music/Hymn1.sib"
  exit 1
fi

SIB_FILE="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
OUTPUT_DIR="$(dirname "$SIB_FILE")"
BASENAME="$(basename "$SIB_FILE" .sib)"
OUTPUT_FILE="$OUTPUT_DIR/$BASENAME.musicxml"

if [ ! -f "$SIB_FILE" ]; then
  echo "❌ 파일을 찾을 수 없습니다: $SIB_FILE"
  exit 1
fi

echo "🎵 변환 시작: $BASENAME.sib"
echo "   입력: $SIB_FILE"
echo "   출력: $OUTPUT_FILE"

osascript <<APPLESCRIPT
set sibFile to POSIX file "$SIB_FILE"
set outputFile to "$OUTPUT_FILE"

tell application "Sibelius"
    activate
    delay 2
    open sibFile
    delay 3
end tell

-- MusicXML 내보내기: File > Export > MusicXML
tell application "System Events"
    tell process "Sibelius"
        -- Cmd+Shift+E 또는 메뉴로 Export
        -- File > Export > MusicXML
        click menu item "MusicXML..." of menu "Export" of menu item "Export" of menu "File" of menu bar 1
        delay 2

        -- 저장 다이얼로그에서 파일명 입력
        keystroke "g" using {command down, shift down}
        delay 1
        keystroke "$OUTPUT_DIR"
        keystroke return
        delay 1

        -- 파일명 설정
        keystroke "a" using {command down}
        keystroke "$BASENAME.musicxml"
        delay 0.5

        -- 저장 클릭
        keystroke return
        delay 2

        -- 이미 존재하면 덮어쓰기
        try
            click button "Replace" of sheet 1 of window 1
            delay 1
        end try
    end tell
end tell

-- 파일 닫기
tell application "Sibelius"
    close front document saving no
    delay 1
end tell

return "done"
APPLESCRIPT

if [ -f "$OUTPUT_FILE" ]; then
  SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
  echo "✅ 변환 완료! ($SIZE)"
  echo "   $OUTPUT_FILE"
else
  echo ""
  echo "⚠️  자동 내보내기가 안 될 경우 수동으로:"
  echo "   1. Sibelius에서 파일이 열린 상태에서"
  echo "   2. File > Export > MusicXML 선택"
  echo "   3. 저장 위치와 파일명 확인 후 저장"
  echo ""
  echo "메뉴 구조가 Sibelius 버전마다 다를 수 있습니다."
  echo "메뉴 경로를 확인 후 스크립트를 수정해주세요."
fi
