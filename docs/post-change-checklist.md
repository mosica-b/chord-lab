# 수정 후 체크리스트

## 현재 상태

- 브랜치: `main`
- 원격 상태: `main...origin/main` 동기화 완료
- 최근 배포 커밋: `5f4ab06 Fix dotted tempo notation import`
- GitHub 저장소: `mosica-b/chord-lab`
- 배포 대상: GitHub Pages (`https://mosica-b.github.io/chord-lab/`)
- 배포 확인: 라이브 `js/viewer-app.js`에 `embedMode` 분기 반영 확인

## 보존 기록 — 2026-07-14 점4분음표 템포 및 키 전환

- MusicXML의 `<beat-unit-dot />` 개수를 읽어 점음표 템포를 `♩.=43`처럼 표시한다. 점 없는 템포와 여러 템포 변경 표기는 그대로 유지한다.
- PDF 파서는 `q.`·`♩.`와 PDF 텍스트 추출 과정에서 분리될 수 있는 점을 보존하며, 중복 제거에도 점음표 여부를 포함한다.
- `js/app.encrypted`는 현재 `CHORD_LAB_MASTER_KEY_B64`로 다시 생성됐다. 키 원본은 프로젝트 루트의 Git 제외 파일 `.env.local`에만 보관하며, 절대 Git·문서·채팅에 기록하지 않는다.
- `js/app.legacy.encrypted`와 `js/auth.js`의 fallback은 키 전환 중 기존 키 사용자가 이전 번들을 열 수 있게 한다. 이 파일과 fallback 로직은 별도 키 전환 종료 판단 전까지 삭제하지 않는다.
- 캐시 버전: `index.html`의 `auth.js?v=37`, `js/auth.js`의 새 번들 `app.encrypted?v=58` 및 이전 번들 `app.legacy.encrypted?v=1`.
- Supabase Edge Function secret `CHORD_LAB_MASTER_KEY_B64`는 새 키로 교체됐다. GitHub Pages 배포와 secret 교체는 반드시 함께 진행한다.

### 이 변경의 확인 기록

- [x] MusicXML·PDF 파서 및 인증 로더 문법 검사
- [x] 새 키로 생성한 번들이 복호화되고 점음표 처리 코드가 포함됐는지 확인
- [x] 라이브 GitHub Pages 번들이 새 키로 복호화되는지 확인
- [x] 라이브 이전 번들 fallback 파일의 응답 확인
- [x] 커밋·푸시·GitHub Pages 배포 확인 (`5f4ab06`)
- [ ] 앱을 강력 새로고침한 뒤 제공된 악보를 불러와 템포 입력칸이 `♩.=43`인지 확인

### 이후 키 교체 시 순서

1. 새 키를 `.env.local`에 생성하고, 키를 화면이나 로그에 출력하지 않는다.
2. 새 키로 `app.encrypted`를 생성하고 새 cache 버전을 반영한다.
3. fallback과 새 번들을 포함한 코드를 먼저 배포하고 라이브 반영을 확인한다.
4. Supabase의 `CHORD_LAB_MASTER_KEY_B64`를 같은 새 키로 교체한다.
5. 새 키로 라이브 번들이 복호화되는지 확인한 뒤, fallback 제거 여부를 별도 판단한다.

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
