# 수정 후 체크리스트

## 현재 상태

- 브랜치: `main`
- 원격 상태: `main...origin/main` 동기화 완료
- 최신 커밋: `c9e91dd Show lyrics intro loading state`
- GitHub 저장소: `mosica-b/chord-lab`
- 배포 워크플로: `Deploy to GitHub Pages`
- 배포 결과: 성공
- 배포 실행: https://github.com/mosica-b/chord-lab/actions/runs/27107622145

## 이번 수정 요약

- `index.html`
  - 곡 정보의 `가사 도입부` 라벨 옆에 `불러오는 중...` 상태 표시를 추가했다.
  - 입력칸 placeholder는 기존 문구를 유지한다.
  - `js/auth.js` 캐시 버전을 `v=36`으로 올렸다.
- `js/auth.js`
  - 로그인 후 암호화 번들이 로드되면 `ITunesSearch.fetchLyricsIntro`를 감싸서 가사 조회 중 상태 표시를 켜고 끈다.
  - `js/app.encrypted` 캐시 버전을 `v=57`로 올렸다.
- `js/app.js`
  - 다음 암호화 번들 재생성 시에도 같은 로딩 상태 로직이 들어가도록 원본 앱 코드에 반영했다.
  - 여러 가사 자동 조회 경로를 공통 함수로 정리했다.

## 중요한 메모

- 현재 프로덕션은 로그인 후 `js/app.encrypted`를 복호화해서 실행한다.
- 이번 작업에서는 로컬 환경에 `CHORD_LAB_MASTER_KEY_B64`가 없어 `js/app.encrypted`를 재생성하지 않았다.
- 그래서 현재 배포에서 즉시 동작하는 핵심 변경은 `js/auth.js`의 wrapper다.
- 다음에 암호화 키가 있는 환경에서 `python3 build.py`를 실행하면, `js/app.js`의 원본 변경도 `js/app.encrypted`에 포함된다.

## 수정 후 체크리스트

- [ ] 변경 파일 확인: `git status --short --branch`
- [ ] 의도한 파일만 diff 확인: `git diff -- <files>`
- [ ] 앱 JS 문법 체크: `node --check js/app.js`
- [ ] 공개 로더 문법 체크: `node --check js/auth.js`
- [ ] 암호화 앱을 바꿨다면 `CHORD_LAB_MASTER_KEY_B64`가 있는 환경에서 `python3 build.py` 실행
- [ ] `js/auth.js` 또는 `js/app.encrypted`를 바꿨다면 캐시 버전 쿼리 증가
- [ ] 로그인 전 화면 로드 확인
- [ ] 로그인 후 변경된 UI 동작 확인
- [ ] 사용자 입력값이 자동 조회 결과로 덮어써지지 않는지 확인
- [ ] 커밋 전 staged 파일 확인: `git status --short`
- [ ] 커밋: `git commit -m "<message>"`
- [ ] GitHub push: `git push origin main`
- [ ] GitHub Actions 배포 성공 확인
- [ ] 배포 후 브라우저 강력 새로고침 또는 캐시 버전 확인

## 이번 작업에서 완료된 확인

- [x] `node --check js/app.js`
- [x] `node --check js/auth.js`
- [x] `git push origin main`
- [x] GitHub Pages workflow 성공 확인
- [x] 로컬 브랜치와 `origin/main` 동기화 확인
