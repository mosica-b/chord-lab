# 수정 후 체크리스트

## 현재 상태

- 브랜치: `main`
- 원격 상태: `main...origin/main` 동기화 완료
- 최근 배포 커밋: `1198e2f Restore embed notation attention`
- GitHub 저장소: `mosica-b/chord-lab`
- 배포 대상: GitHub Pages (`https://mosica-b.github.io/chord-lab/`)
- 배포 확인: 라이브 `js/viewer-app.js`에 `embedMode` 분기 반영 확인

## 이번 수정 요약

- `js/viewer-app.js`
  - `embed=1` 코드 뷰어에서는 상단 표기 아코디언을 자동으로 열었다가 닫지 않도록 했다.
  - `embed=1`에서도 `startNotationAttention()`은 실행해 표기 선택 영역의 흔들림/하이라이트 안내를 유지했다.
  - 일반 `viewer.html`에서는 기존처럼 초기 자동 펼침, 1초 뒤 접힘, 이후 흔들림/하이라이트 안내가 유지된다.

## 중요한 메모

- `/Volumes/web/pdf_view/viewer/shell.html`은 코드 클릭 시 GitHub Pages의 `viewer.html?...&embed=1`을 iframe으로 연다.
- PDF 열람 뷰어 연결부는 수정하지 않았고, Chord Viewer 쪽 embed 동작만 조정했다.
- 이 영역을 수정할 때는 "자동 펼침/닫힘 제거"와 "표기 영역 흔들림/하이라이트 유지"를 별도 동작으로 검증해야 한다.
- PDF 뷰어의 `코드표기` 패널과 Chord Viewer iframe 내부의 `topAccordion`은 서로 다른 UI다.

## 수정 후 체크리스트

- [ ] 변경 파일 확인: `git status --short --branch`
- [ ] 의도한 파일만 diff 확인: `git diff -- <files>`
- [ ] Chord Viewer 문법 체크: `node --check js/viewer-app.js`
- [ ] Embed URL 확인: `viewer.html?chords=C&type=guitar-diagram&embed=1`
- [ ] Embed에서는 상단 표기 아코디언이 자동으로 열렸다 닫히지 않는지 확인
- [ ] Embed에서는 표기 선택 영역 흔들림/하이라이트가 유지되는지 확인
- [ ] Embed에서 표기 아코디언 수동 열기, 표기 전환, 수동 닫기가 정상인지 확인
- [ ] 일반 URL 확인: `viewer.html?chords=C&type=guitar-diagram`
- [ ] 일반 뷰어에서는 기존 초기 펼침/접힘/하이라이트 안내가 유지되는지 확인
- [ ] 배포 후 라이브 파일 캐시 우회 확인: `curl -fsSL 'https://mosica-b.github.io/chord-lab/js/viewer-app.js?deploy-check=<commit>'`
- [ ] 커밋 전 staged 파일 확인: `git status --short`
- [ ] 커밋: `git commit -m "<message>"`
- [ ] GitHub push: `git push origin main`
- [ ] 배포 후 브라우저 강력 새로고침 또는 캐시 버전 확인

## 이번 작업에서 완료된 확인

- [x] `node --check js/viewer-app.js`
- [x] Embed URL에서 아코디언 닫힘 상태 유지 확인
- [x] Embed URL에서 `notation-attention` 하이라이트 복구 확인
- [x] Embed URL에서 수동 열기, 표기 전환, 수동 닫기 확인
- [x] 일반 URL에서 기존 초기 펼침/접힘 동작 유지 확인
- [x] 일반 URL에서 접힘 후 흔들림/하이라이트 안내 유지 확인
- [x] `git push origin main`
- [x] 라이브 GitHub Pages `js/viewer-app.js` 반영 확인
- [x] 로컬 브랜치와 `origin/main` 동기화 확인
