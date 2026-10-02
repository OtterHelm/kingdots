# kingdots 검색 노출과 홍보

조사일: **2026-10-03 (Asia/Seoul)**. 플랫폼 설명은 공식 문서에 근거하며 우선순위·문구·채널은 현재 kingdots 상태에 맞춘 제안입니다. 검색량이나 예상 유입을 측정한 결과는 아닙니다.

조사 당시 GitHub 상태는 공개 저장소, 설명 `kingdots`, Topics 없음, 홈페이지 없음, latest release 없음이었습니다. **2026-10-03 후속 작업에서 GitHub 설명과 Topics 9개를 적용하고 실제 설정을 다시 읽어 확인했습니다.** npm 설명·키워드·README 홈페이지·issue URL도 로컬 `package.json`에 반영했습니다. 패키지 게시와 커뮤니티 게시는 수행하지 않았습니다.

## GitHub 설명과 Topics가 첫 순서

GitHub 기본 저장소 검색은 이름·설명·Topics를 검색합니다. README 내용은 `in:readme`를 지정했을 때 검색하므로 README와 함께 설명·Topics도 준비해야 합니다. [GitHub 저장소 검색](https://docs.github.com/en/search-github/searching-on-github/searching-for-repositories)

GitHub와 패키지에 적용한 설명:

> Local MCP bridge for Dots to observe existing Codex coding sessions, record scoped follow-ups, and track delivery and completion evidence. Development preview.

GitHub에 적용한 Topics와 패키지 키워드:

```text
ai-agents, coding-agents, codex, mcp, session-management,
local-first, typescript, windows, oauth2
```

실제 목적·기술·지원 환경을 표현하는 태그를 선택합니다. Topics는 관련 저장소 탐색과 검색에 쓰이며 최대 20개, 소문자·숫자·하이픈 규칙을 따릅니다. [GitHub Topics](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics)

GitHub 홈페이지는 비워두고 실제 문서 사이트가 생기면 그 주소를 넣습니다. 패키지 `homepage`에는 현재 사용 가능한 저장소 README를 연결했습니다. 아직 배포되지 않은 사이트 주소를 넣지는 않습니다.

## README와 실제 데모

README는 하는 일, 왜 유용한지, 시작 방법과 도움·기여 경로를 설명해야 합니다. 이번 갱신은 설계 의도·기능·설치·배포·사용·기여 안내를 이 구조에 맞춰 보완합니다. [GitHub README 안내](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)

다음 보완은 실제 화면을 이용한 짧은 데모를 제안합니다. 기존 세션 등록 → 질문·관찰 확인 → 지시·전달 결과 → 완료 근거 확인을 보여줍니다. fixture 데모는 그렇게 표시하고 실제 Dots 자동 관리 성공과 구분합니다. 설치 전제 조건과 preview 표시도 함께 둡니다.

영문에는 `AI coding session management`, `Codex session monitoring`, `MCP bridge` 등 실제 사용 문제를 자연스럽게 설명하고 한국어 문서에도 같은 의미를 유지합니다. 이 표현은 검색어 후보이며 인기나 순위를 검증한 것은 아닙니다.

## 공유 이미지와 기여 경로

GitHub Social preview는 저장소 링크를 공유할 때 프로젝트를 알아보기 쉽게 하는 이미지입니다. 권장 크기는 1280×640, PNG/JPG/GIF 1MB 미만입니다. 검색 순위 상승으로 단정하지 않고 공유 시 전달력을 높이는 용도로 사용합니다. [GitHub Social preview](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview)

이미지에는 이름, 한 줄 설명, 실제 화면 또는 구성도와 preview 표시를 넣는 방향을 제안합니다. 미검증 자동 관리 성공을 표시하지 않습니다.

기여 안내와 재현하기 쉬운 issue 양식, 시작하기 좋은 실제 issue는 새 사용자의 참여 경로가 됩니다. GitHub는 README·라이선스·기여 안내 등으로 community profile을 확인하며 Open Source Guides는 명확한 문서·기여 경로·신속한 응답을 권장합니다. [Community profile](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/about-community-profiles-for-public-repositories), [커뮤니티 만들기](https://opensource.guide/building-community/)

## npm 검색은 배포 준비 후

후속 작업에서 `package.json`에 다음 메타데이터를 반영했습니다:

- `description`: 위 GitHub 설명과 일치하며 개발 프리뷰 표시 포함.
- `keywords`: 위 Topics와 같은 9개 용어.
- `homepage`: `https://github.com/OtterHelm/kingdots#readme`.
- `bugs.url`: `https://github.com/OtterHelm/kingdots/issues`.

npm 검색에는 이름·설명·README·키워드가 반영됩니다. 미게시 tarball의 파일 수정만으로 npm 검색 노출이 생기지는 않습니다. [npm package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/), [npm 검색 기준](https://docs.npmjs.com/searching-for-and-choosing-packages-to-download/)

배포 판단에는 최신 테스트·버전·설치 경로와 [검증 결과](verification-results.md)를 확인합니다. 새 연결의 실제 Dots 합격은 미검증입니다. npm 게시·GitHub Release 발행은 이번 조사에서 수행하지 않습니다.

## Google 검색용 문서 사이트

Google은 이해하기 쉬운 고유하고 최신인 글, 설명적인 제목, 관련 링크와 유용한 콘텐츠를 권장합니다. 색인이나 상위 순위를 보장하지 않으며 반영에는 시간이 걸릴 수 있습니다. [Google SEO 기본 가이드](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)

GitHub Pages 등 정적 문서 사이트를 후보로 제안합니다. 소개·설치·기존 세션 관리·OAuth 연결·설계·검증 한계를 공개 페이지로 설명합니다. 자신이 운영하고 소유권을 확인할 수 있는 사이트에는 Search Console과 sitemap을 검토할 수 있습니다. 로컬 인증 대시보드와 세션 기록은 공개 문서와 별개입니다. 먼저 README·설명·Topics를 완성하고 문서 사이트의 필요성을 판단합니다.

## 사용 문제를 중심으로 소개하기

초기 소개는 다음 순서가 적합합니다:

1. 코딩 세션이 질문이나 응답 종료에서 멈추는 문제.
2. 기존 세션·맥락을 유지하고 Dots에 판단을 맡기는 설계.
3. 동작하는 설치 경로와 실제 화면 데모.
4. 현재 검증 범위, 미검증 연결과 필요한 피드백·기여.

초기 대상은 Codex/MCP 개발자와 AI 코딩 도구 사용자입니다. 사용 사례·구현을 담은 기술 글이나 관련 커뮤니티 소개를 후보로 검토하고 게시 전 각 채널의 자기홍보 규칙을 확인합니다. 무관한 issue/PR에 반복 링크를 게시하거나 별 수를 인위적으로 늘리는 방식은 이 계획에 포함하지 않습니다.

Show HN은 직접 만든, 다른 사람이 실제로 사용해 볼 수 있는 작업을 대상으로 합니다. 사용할 수 있는 설치·데모를 마련한 뒤 적합성을 판단하고 미검증 자동 관리 기능을 완성품으로 소개하지 않습니다. [Show HN 공식 지침](https://news.ycombinator.com/showhn.html)

## 권장 순서

| 순서 | 작업                                             | 현재 상태                                    |
| ---- | ------------------------------------------------ | -------------------------------------------- |
| 1    | README·기여·설치·배포 문서                       | 로컬 작업에 반영                             |
| 2    | GitHub 설명·Topics                               | 실제 저장소 설정 반영·재조회 확인            |
| 3    | npm 메타데이터                                   | 로컬 manifest 반영, registry 미게시          |
| 4    | 실제 화면 데모·공유 이미지                       | 준비할 후속 작업                             |
| 5    | 검증 후 preview 패키지·필요하면 정적 문서 사이트 | 설치·연결 검증 상태에 맞춰 진행              |
| 6    | 대상 커뮤니티에 사례·기술 글                     | 사용할 수 있는 데모와 소개 자료 준비 후 판단 |

별 수 외에도 설치 성공, 반복 질문, 사용 사례, 재현 가능한 버그와 기여를
함께 평가합니다. 노출 효과는 추적 가능한 방문·referral·검색 지표를 확보한
뒤 판단하며 예상 상승 수치를 만들지 않습니다. 기능 사실은
[검증 결과](verification-results.md), [배포](deployment.md), [로드맵](roadmap.md)에 맞춰 갱신합니다.
