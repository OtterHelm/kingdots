# 로컬 CI/CD

kingdots는 **로컬 PC의 Windows GitHub Actions runner 한 개**에서 검증과 패키지 생성을 실행합니다. GitHub-hosted runner나 GitHub cache 저장소를 사용하지 않습니다.

kingdots 전용 runner는 다른 저장소의 runner와 별도로 등록하고 예약 작업을 사용합니다. portable PowerShell 7과 PC에 설치된 Node.js 24·npm을 실행 환경으로 사용합니다.

## 현재 연결

| 항목              | 설정                                                               |
| ----------------- | ------------------------------------------------------------------ |
| 저장소            | `OtterHelm/kingdots`                                               |
| runner            | `kingdots-local-win-x64`                                           |
| labels            | `self-hosted`, `Windows`, `X64`, `kingdots`                        |
| runner 폴더       | `C:\actions-runner-kingdots`                                       |
| Windows 예약 작업 | `kingdots Self-Hosted Runner`                                      |
| 실행 계정         | 현재 Windows 사용자, 관리자 권한 상승·저장된 로그인 암호 없이 실행 |
| 시작 방식         | 사용자 로그인 시 시작. 예약 작업으로 현재 실행도 시작 가능         |
| GitHub check      | `Checks` / `windows`, 한 job                                       |
| 자동 실행         | `main` push                                                        |
| 수동 실행         | `main`의 `workflow_dispatch`                                       |

컴퓨터와 해당 Windows 사용자 세션이 사용 가능해야 합니다. runner가 offline이면 실행은 대기하며 GitHub-hosted 환경으로 자동 전환하지 않습니다. 현재 운영은 서비스 계정이나 로그인 전 실행을 설정하지 않습니다.

공식 GitHub runner 배포 ZIP의 SHA256을 검증한 뒤 설치했습니다. 등록 토큰은 한 번의 등록에 사용하고 대화·저장소·명령 인수에 기록하지 않았습니다. runner 인증 파일은 별도 runner 폴더에 보관하며 폴더 접근은 현재 사용자·SYSTEM·Administrators로 제한했습니다.

## 실행 단계와 결과

[`scripts/ci.ps1`](../scripts/ci.ps1)이 같은 검사를 로컬과 GitHub job에서 수행합니다.

1. Git 커밋과 원본 파일 상태 확인.
2. `npm ci --include=dev`로 잠긴 의존성 설치.
3. 본 서비스와 중계 lockfile에 각각 `npm audit --json`을 실행합니다.
4. `npm run typecheck`.
5. `npm test`.
   기존 서비스 검사와 요청 기반 중계의 통제된 SQLite fixture 검사를 포함합니다. 실제 Dots·계정·세션에는 연결하지 않습니다.
6. `npm run build`.
7. `npm pack --ignore-scripts`로 패키지 생성.
8. 원본 상태가 바뀌지 않았는지와 패키지에 허용한 파일만 포함되는지 확인.
9. tarball, 단계별 로그, 종료 코드·시각·커밋·파일 상태·패키지 SHA256을 로컬에 보관.

### 공개 실행 로그와 runner 개인정보

2026-10-04 점검에서 Git 파일에는 없던 PC 이름·Windows 계정명·사용자 폴더
경로가 기존 공개 Actions 로그에 포함된 것을 확인했습니다. 비밀값 마스킹은
개인 경로를 자동으로 숨기는 보장이 아니며 첫 step 이전의 runner 정보도
검사해야 합니다. 원래 값과 로컬 로그 백업은 공개하지 않습니다.

새 self-hosted job은 저장소 변수 `KINGDOTS_RUNNER_PRIVACY_READY=true`가 있어야
실행됩니다. 그 전에 실행 PC의 `COMPUTERNAME`, `USERNAME`, `USERPROFILE`을
각각 저장소 암호화 Secret `KINGDOTS_RUNNER_MACHINE`, `KINGDOTS_RUNNER_USER`,
`KINGDOTS_RUNNER_HOME`에 등록하세요. workflow가 처음부터 이 Secret을 참조하도록
구성했습니다. 등록과 공개 로그의 영구 삭제는 소유자의 승인을 받아 수행합니다.
실제 새 job 로그에서 원래 식별값이 없는지 확인한 뒤에만 마스킹을 검증했다고
선언합니다. 다른 PC로 runner를 옮기면 값을 다시 확인해야 합니다.

변수가 없으면 원격 job은 건너뛰며, 이를 CI 검사 통과로 보고하지 않습니다.
로컬 `scripts/ci.ps1`은 별도로 실행할 수 있습니다. 기존 공개 로그는 소스
커밋을 삭제하거나 바꿔도 없어지지 않습니다. 삭제는 GitHub 로그에만 적용하고
기존 실행 결과·커밋·로컬 검증 기록은 보존합니다.

검사 실패는 job 실패로 남깁니다. 검사를 이미 수행한 뒤 `prepack`을 다시 호출하지 않습니다. AI 제공자 인증과 개인 Codex 설정은 검사 환경에서 분리합니다. 실제 작업 AI를 호출하던 임시 실행기는 제거했으며 회귀 fixture는 배포 패키지에 포함하지 않습니다.

현재 CD 범위는 **검증한 패키지를 로컬에 보관하는 것**입니다. 실행 중인 kingdots 서비스 교체, npm publish, GitHub Release 발행, 외부 배포는 자동 수행하지 않습니다.

GitHub job의 기본 보관 위치:

```text
%LOCALAPPDATA%\kingdots-ci\artifacts\<commit>\<runId>-<attempt>\
  receipt.json
  install.log
  dependency-audit.log
  relay-dependency-audit.log
  typecheck.log
  tests.log
  build.log
  package.log
  kingdots-<version>.tgz
```

`receipt.json`의 `passed`, `source.commit`, `source.fingerprint`, 각 단계의 `exitCode`, `package.sha256`을 확인합니다. 오래된 패키지나 다른 커밋의 성공 기록을 현재 작업의 합격으로 사용하지 않습니다. GitHub job은 해당 run의 최종 성공 상태도 함께 확인해야 합니다. 검사가 끝난 뒤 job이 취소되거나 후처리가 실패하면 로컬 검사 기록만으로 job 전체 성공을 선언하지 않습니다. 로컬 기록과 패키지는 GitHub artifact 저장소로 자동 업로드하지 않습니다.

## 직접 실행하기

저장소 루트에서 PowerShell 7로 실행합니다.

```powershell
.\scripts\ci.ps1
```

이미 의존성을 준비한 개발 체크아웃은 다음과 같이 실행할 수 있습니다. GitHub job은 항상 새 의존성 설치를 수행합니다.

```powershell
.\scripts\ci.ps1 -SkipInstall
```

직접 실행한 결과는 `.kingdots/ci-artifacts/<commit>/local-*/`에 보관합니다. 미커밋 상태에서의 실행은 `source.dirty: true`와 파일 fingerprint로 구분합니다. GitHub job은 깨끗한 `main` 체크아웃과 해당 workflow SHA가 일치해야 합니다.

## 실행 권한과 외부 PR

이 저장소는 공개되어 있으므로 외부 PR 코드를 개인 PC에서 자동 실행하지 않습니다. 현재 워크플로에는 `pull_request`·`pull_request_target` 트리거가 없으며 신뢰한 `main`의 push와 수동 실행만 허용합니다. 저장소의 fork PR 승인 정책도 `all_external_contributors`로 설정했습니다.

이 정책은 별도 workflow 추가를 포함한 외부 기여자의 실행에 승인을 요구합니다. 외부 PR의 workflow나 코드를 검토하지 않은 채 승인하거나 `main`에 반영하지 마세요. runner 접근은 저장소와 PC의 실제 신뢰 경계이며 GitHub 토큰의 읽기 권한만으로 PC 파일 접근을 격리하는 것은 아닙니다.

workflow 토큰은 `contents: read`만 사용하고 checkout 이후 Git 인증을 남기지 않습니다. 수정된 workflow를 개인 PC에서 실행하려면 변경 내용과 실행할 커밋을 검토해야 합니다.

## 상태 확인과 중단

```powershell
Get-ScheduledTask -TaskName 'kingdots Self-Hosted Runner'
Start-ScheduledTask -TaskName 'kingdots Self-Hosted Runner'
Stop-ScheduledTask -TaskName 'kingdots Self-Hosted Runner'
gh api repos/OtterHelm/kingdots/actions/runners --jq '.runners[] | {name, status, busy}'
gh run list --repo OtterHelm/kingdots --workflow checks.yml
```

runner가 연결되어도 실제 job 실행 성공과 같지 않습니다. 성공 근거는 해당 커밋의 GitHub run과 로컬 receipt로 확인합니다. 실행 중 중단하면 검사나 패키지가 완성되지 않을 수 있으므로 다음 실행에서 새 근거를 확인합니다. 다른 저장소의 예약 작업과 runner는 별도 관리합니다.

runner 진단 로그는 `C:\actions-runner-kingdots\_diag`에 있습니다. 인증 파일·원본 로그를 공개 저장소에 올리지 마세요. 결과 보관 폴더의 용량 관리는 소유자가 별도로 수행하며 파이프라인은 과거 결과를 자동 삭제하지 않습니다.

공식 기준: [runner 등록](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners), [GitHub Actions 보안](https://docs.github.com/en/actions/reference/security/secure-use), [fork PR 승인 정책 API](https://docs.github.com/en/rest/actions/permissions).
