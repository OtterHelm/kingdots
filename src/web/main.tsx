import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type Task = {
  id: string;
  goal: string;
  project: string;
  state: string;
  backend: string;
  sessionId: string | null;
  worktree: string | null;
  epoch: number;
  automatic: boolean;
  blockedReason: string | null;
  recentAction: string;
  nextAction: string;
  lastHealthyAt: string | null;
  checklist: { id: string; label: string; done: boolean }[];
  evidence: {
    id: string;
    label: string;
    passed: boolean;
    exitCode: number | null;
    stdout: string;
    stderr: string;
  }[];
  usage: { tokens: number | null; costUsd: number | null; costKind: string };
  finalReport: string | null;
};
type Capability = {
  id: string;
  name: string;
  version: string | null;
  installed: boolean;
  executionBlockedReason?: string;
  capabilities: {
    feature: string;
    state: string;
    notes: string;
    testedAt: string | null;
    evidence: string | null;
  }[];
};
const names: Record<string, string> = {
  "codex-cli": "Codex CLI",
  "codex-app": "Codex 앱",
  "claude-code": "Claude Code",
  "claude-app": "Claude 앱",
  "opencode-cli": "OpenCode",
};
const states: Record<string, string> = {
  preparing: "준비",
  running: "실행",
  verifying: "검증",
  awaiting_decision: "Dots 판단 대기",
  awaiting_input: "입력 대기",
  paused: "일시정지",
  released: "관리 해제",
  failed: "실패",
  completed: "완료",
};
const features: Record<string, string> = {
  read_existing: "기존 세션 읽기",
  create: "새 실행",
  receive: "결과 수신",
  steer: "실행 중 지시",
  interrupt: "중단",
  resume: "이어가기",
  adopt_running: "외부 실행 인수",
  usage: "사용량",
};
const supports: Record<string, string> = {
  untested: "미검증",
  supported: "지원",
  limited: "제한적 지원",
  unsupported: "지원 불가",
};
function initialToken() {
  const token = new URLSearchParams(location.hash.slice(1)).get("token");
  if (token) {
    sessionStorage.setItem("kingdots-token", token);
    history.replaceState(null, "", location.pathname);
  }
  return token ?? sessionStorage.getItem("kingdots-token") ?? "";
}
function App() {
  const [token, setToken] = useState(initialToken);
  const [loginValue, setLoginValue] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [caps, setCaps] = useState<Capability[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("tasks");
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  async function api(path: string, body?: unknown) {
    const response = await fetch("/api" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error ?? "연결 오류");
    return value;
  }
  async function refresh() {
    try {
      const [all, info] = await Promise.all([api("/tasks"), api("/status")]);
      setTasks(all);
      setStatus(info);
      if (selected) setDetail(await api("/tasks/" + selected));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (!token) return;
    void refresh();
    const timer = setInterval(() => void refresh(), 2500);
    return () => clearInterval(timer);
  }, [token, selected]);
  useEffect(() => {
    if (token && tab === "connections")
      void api("/capabilities")
        .then(setCaps)
        .catch((e) => setError(e.message));
  }, [token, tab]);
  async function action(name: string, body: Record<string, unknown> = {}) {
    if (!selected || !detail) return;
    setBusy(true);
    try {
      await api(`/tasks/${selected}/${name}`, {
        commandId: crypto.randomUUID(),
        reason:
          name === "send" ? "사용자의 후속 지시" : "사용자가 요청한 " + name,
        epoch: detail.task.epoch,
        ...body,
      });
      setPrompt("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const goal = String(form.get("goal"));
      const argv = JSON.parse(String(form.get("argv")));
      const duration = form.get("duration")
        ? Number(form.get("duration")) * 60000
        : undefined;
      const backend = String(form.get("backend"));
      const task = await api("/tasks", {
        goal,
        project: form.get("project"),
        backend,
        allowedBackends: [backend],
        checks: [{ id: "tests", label: "지정 테스트 통과", argv }],
        artifacts: String(form.get("artifacts") ?? "")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        limits: duration ? { durationMs: duration } : {},
        authorization: { source: "direct_user_request", request: goal },
      });
      setModal(false);
      setSelected(task.id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!token)
    return (
      <main className="login">
        <div className="logo large">◌</div>
        <h1>kingdots</h1>
        <p>여러 AI의 작업을 한곳에서 관리하세요.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sessionStorage.setItem("kingdots-token", loginValue);
            setToken(loginValue);
          }}
        >
          <label>
            로컬 접근 토큰
            <input
              type="password"
              autoComplete="off"
              value={loginValue}
              onChange={(e) => setLoginValue(e.target.value)}
              required
            />
          </label>
          <button className="primary">연결</button>
        </form>
        <p className="muted">
          <code>kingdots open</code>으로 인증된 화면을 열 수 있어요.
        </p>
      </main>
    );
  const active = tasks.filter((t) =>
    ["preparing", "running", "verifying"].includes(t.state),
  ).length;
  const waiting = tasks.filter((t) =>
    ["awaiting_decision", "awaiting_input", "failed"].includes(t.state),
  ).length;
  const task: Task | undefined = detail?.task;
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">◌</span>
          <div>
            <strong>kingdots</strong>
            <small>LOCAL EXECUTION</small>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <button
          className={tab === "tasks" ? "nav active" : "nav"}
          onClick={() => setTab("tasks")}
        >
          ▤ <span>작업 관리</span>
          <b>{tasks.length}</b>
        </button>
        <button
          className={tab === "connections" ? "nav active" : "nav"}
          onClick={() => setTab("connections")}
        >
          ⌁ <span>연결과 지원</span>
        </button>
        <button
          className={tab === "dots" ? "nav active" : "nav"}
          onClick={() => setTab("dots")}
        >
          ◎ <span>Dots 연결</span>
        </button>
        <div className="sidebar-bottom">
          <span className="online-dot" />
          로컬 서비스 연결됨<small>Windows 우선 · v0.1.0</small>
        </div>
      </aside>
      <main className="workspace">
        <header>
          <div>
            <span className="eyebrow">YOUR AGENTS, IN ONE PLACE</span>
            <h1>
              {tab === "tasks"
                ? "맡긴 작업"
                : tab === "connections"
                  ? "연결과 지원"
                  : "Dots 연결"}
            </h1>
            <p>지시는 Dots가, 실행과 근거는 kingdots가 관리해요.</p>
          </div>
          <button className="primary" onClick={() => setModal(true)}>
            ＋ 작업 맡기기
          </button>
        </header>
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => setError("")}>닫기</button>
          </div>
        )}
        {tab === "tasks" && (
          <>
            <div className="metrics">
              <div>
                <span>관리 작업</span>
                <strong>
                  {tasks.filter((t) => t.automatic).length}
                  <small>개</small>
                </strong>
              </div>
              <div>
                <span>진행 중</span>
                <strong>
                  {active}
                  <small>개</small>
                </strong>
              </div>
              <div>
                <span>판단 · 입력 대기</span>
                <strong>
                  {waiting}
                  <small>개</small>
                </strong>
              </div>
              <div>
                <span>검증 완료</span>
                <strong>
                  {tasks.filter((t) => t.state === "completed").length}
                  <small>개</small>
                </strong>
              </div>
            </div>
            <div className="task-grid">
              <section className="task-list">
                <div className="section-title">
                  <h2>작업 목록</h2>
                  <span>{tasks.length}개 · 병렬 수 고정 제한 없음</span>
                </div>
                {tasks.length === 0 ? (
                  <div className="empty">
                    <span>◌</span>
                    <h3>첫 작업을 맡겨보세요</h3>
                    <p>
                      프로젝트와 목표, 완료 조건을 지정하면
                      <br />
                      분리된 작업 폴더에서 실행해요.
                    </p>
                    <button onClick={() => setModal(true)}>작업 추가 →</button>
                  </div>
                ) : (
                  tasks.map((t) => (
                    <button
                      key={t.id}
                      className={
                        "task-card " + (selected === t.id ? "selected" : "")
                      }
                      onClick={() => {
                        setSelected(t.id);
                        setDetail(null);
                        setConfirmed(false);
                      }}
                    >
                      <div className="card-top">
                        <span className="provider">{names[t.backend]}</span>
                        <span className={"badge " + t.state}>
                          {states[t.state]}
                        </span>
                      </div>
                      <h3>{t.goal}</h3>
                      <p className="path">{t.project}</p>
                      <div className="card-footer">
                        <span>
                          {t.checklist.filter((c) => c.done).length}/
                          {t.checklist.length} 확인 조건
                        </span>
                        <span>
                          {t.automatic ? "자동 관리" : "자동 관리 꺼짐"}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </section>
              <section className="details">
                {!task ? (
                  <div className="empty">
                    <span>↗</span>
                    <h3>작업의 흐름을 확인하세요</h3>
                    <p>
                      목록에서 작업을 선택하면 지시 내역과
                      <br />
                      검증 근거를 볼 수 있어요.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="section-title">
                      <h2>작업 상세</h2>
                      <span className={"badge " + task.state}>
                        {states[task.state]}
                      </span>
                    </div>
                    <h2 className="goal">{task.goal}</h2>
                    <div className="flow">
                      <div>
                        <i />
                        <span>방금 한 일</span>
                        <p>{task.recentAction}</p>
                      </div>
                      <div>
                        <i />
                        <span>다음 작업</span>
                        <p>{task.nextAction}</p>
                      </div>
                    </div>
                    {task.blockedReason && (
                      <div className="warning">{task.blockedReason}</div>
                    )}
                    <div className="controls">
                      <button
                        disabled={busy || task.state === "completed"}
                        onClick={() => void action("pause")}
                      >
                        Ⅱ 일시정지
                      </button>
                      <button
                        disabled={busy || task.state === "completed"}
                        onClick={() => void action("release")}
                      >
                        자동 관리 해제
                      </button>
                      {!task.automatic && task.state !== "completed" && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            void action("resume", {
                              confirmPreviousWorkerStopped: confirmed,
                            })
                          }
                        >
                          관리 재개
                        </button>
                      )}
                    </div>
                    {!task.automatic && task.state !== "completed" && (
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={confirmed}
                          onChange={(e) => setConfirmed(e.target.checked)}
                        />
                        이전 실행 프로세스가 중단된 것을 직접 확인했어요
                      </label>
                    )}
                    <h3 className="subheading">완료 조건</h3>
                    {detail.evidenceValid === false &&
                      task.evidence.length > 0 && (
                        <p className="warning">
                          현재 파일 기준으로 검증이 유효하지 않아요. 재검증이
                          필요해요.
                        </p>
                      )}
                    <ul className="checklist">
                      {task.checklist.map((c) => (
                        <li key={c.id}>
                          <span className={c.done ? "check done" : "check"}>
                            {c.done ? "✓" : "○"}
                          </span>
                          {c.label}
                        </li>
                      ))}
                    </ul>
                    <div className="facts">
                      <div>
                        <span>연결된 AI 세션</span>
                        <code>{task.sessionId ?? "아직 연결되지 않음"}</code>
                      </div>
                      <div>
                        <span>작업 폴더</span>
                        <code>{task.worktree ?? "준비 중"}</code>
                      </div>
                      <div>
                        <span>마지막 정상 확인</span>
                        <b>
                          {task.lastHealthyAt
                            ? new Date(task.lastHealthyAt).toLocaleString(
                                "ko-KR",
                              )
                            : "아직 확인되지 않음"}
                        </b>
                      </div>
                      <div>
                        <span>작업 AI 사용량</span>
                        <b>
                          {task.usage.tokens === null
                            ? "확인 불가"
                            : task.usage.tokens.toLocaleString() + " 토큰"}
                          {task.usage.costUsd !== null
                            ? ` · $${task.usage.costUsd.toFixed(4)} (${task.usage.costKind === "provider_estimate" ? "도구 제공 추정" : "보고값"})`
                            : ""}
                        </b>
                      </div>
                      <div>
                        <span>Dots 사용량</span>
                        <b>확인 불가 · 작업별 수치 미제공</b>
                      </div>
                    </div>
                    {detail.approvals?.map((a: any) => (
                      <div className="permission" key={a.id}>
                        <h3>사용자 권한 확인 필요</h3>
                        <pre>{a.description}</pre>
                        <button
                          onClick={() => {
                            void api("/approvals/" + a.id, { accept: true })
                              .then(refresh)
                              .catch((e) => setError(e.message));
                          }}
                        >
                          이번 요청 허용
                        </button>
                        <button
                          onClick={() => {
                            void api("/approvals/" + a.id, { accept: false })
                              .then(refresh)
                              .catch((e) => setError(e.message));
                          }}
                        >
                          거절
                        </button>
                      </div>
                    ))}
                    <h3 className="subheading">지시와 결과</h3>
                    <div className="timeline">
                      {detail.commands?.map((c: any) => (
                        <div key={c.id}>
                          <span className="timeline-dot" />
                          <div>
                            <strong>{c.reason}</strong>
                            <small>
                              {c.action} · {c.status} ·{" "}
                              {new Date(c.createdAt).toLocaleTimeString(
                                "ko-KR",
                              )}
                            </small>
                            {c.prompt && (
                              <details>
                                <summary>보낸 지시</summary>
                                <pre>{c.prompt}</pre>
                              </details>
                            )}
                            {c.result && (
                              <details>
                                <summary>결과 보기</summary>
                                <pre>{JSON.stringify(c.result, null, 2)}</pre>
                              </details>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {task.evidence.map((e) => (
                      <details key={e.id} className="evidence">
                        <summary>
                          {e.passed ? "✓" : "!"} {e.label} · 종료 코드{" "}
                          {e.exitCode ?? "없음"}
                        </summary>
                        <pre>{e.stdout + "\n" + e.stderr}</pre>
                      </details>
                    ))}
                    {task.finalReport && (
                      <div className="report">
                        <h3>완료 보고</h3>
                        <p>{task.finalReport}</p>
                      </div>
                    )}
                    {task.automatic && task.state !== "completed" && (
                      <form
                        className="followup"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void action(
                            task.state === "running" ? "steer" : "send",
                            { prompt },
                          );
                        }}
                      >
                        <label>
                          사용자의 후속 지시
                          <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="현재 목표 안에서 추가할 내용을 적어주세요."
                            required
                          />
                        </label>
                        <button className="primary" disabled={busy}>
                          {task.state === "running"
                            ? "실행 중 지시"
                            : "지시 보내기"}
                        </button>
                        <button
                          type="button"
                          disabled={
                            busy ||
                            task.state === "running" ||
                            task.state === "verifying"
                          }
                          onClick={() => void action("verify")}
                        >
                          재검증
                        </button>
                      </form>
                    )}
                  </>
                )}
              </section>
            </div>
          </>
        )}
        {tab === "connections" && (
          <div className="connections">
            {caps.length === 0 ? (
              <p>설치 버전과 연결 기능을 확인하고 있어요.</p>
            ) : (
              caps.map((c) => (
                <section className="connection" key={c.id}>
                  <div className="section-title">
                    <h2>{names[c.id]}</h2>
                    <span>{c.version ?? "제어 연결 미검증"}</span>
                  </div>
                  <p>기능마다 실제 연결 시험 결과를 표시해요.</p>
                  {c.executionBlockedReason && (
                    <p className="permission">
                      API 과금 금지: 구독 또는 로컬 모델 연결을 확인할 때까지
                      실행을 막아요. 기존 세션 조회는 가능해요.
                    </p>
                  )}
                  <div className="cap-grid">
                    {c.capabilities.map((f) => (
                      <div key={f.feature}>
                        <strong>{features[f.feature]}</strong>
                        <span className={"support " + f.state}>
                          {supports[f.state]}
                        </span>
                        <small>{f.notes}</small>
                        {f.evidence && <small>{f.evidence}</small>}
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        )}
        {tab === "dots" && (
          <section className="connection dots-panel">
            <h2>Dots 연결과 후속 판단</h2>
            <p>
              API 키 없이 로컬 MCP로 연결해요. Dots의 자동 후속 판단은 실제 시험
              전까지 미검증이에요. 공식 터널 설정은 중단한 상태예요.
            </p>
            <div className="facts">
              <div>
                <span>콜백 연결 검증</span>
                <b>
                  {status?.connection?.subscriptionVerifiedAt
                    ? "검증됨"
                    : "미검증"}
                </b>
              </div>
              <div>
                <span>이벤트 수신 확인</span>
                <b>
                  {status?.connection?.lastWebhookAcceptedAt ?? "아직 없음"}
                </b>
              </div>
              <div>
                <span>Dots 후속 판단 기록</span>
                <b>{status?.connection?.lastDotsDecisionAt ?? "아직 없음"}</b>
              </div>
              <div>
                <span>응답 종료 후 자동 관리 합격</span>
                <b>실제 시나리오 검증 필요</b>
              </div>
            </div>
            <ol>
              <li>
                <code>kingdots install-plugin</code>으로 로컬 MCP 플러그인을
                설치해요.
              </li>
              <li>
                앱에서 플러그인을 다시 불러오고, Dots 프로필에 이 컴퓨터를
                연결해요.
              </li>
              <li>
                로컬 도구 접근과 지원되는 이벤트 또는 예약 확인을 시험해요.
              </li>
              <li>
                최초 응답이 끝난 뒤 Dots의 후속 지시와 최종 보고까지 확인해요.
              </li>
            </ol>
            <div className="warning">
              로컬 작업은 컴퓨터가 켜져 있고 앱·서비스가 연결되어 있어야 해요.
              이벤트 수신만으로 자동 관리 합격을 표시하지 않아요.
            </div>
          </section>
        )}
      </main>
      {modal && (
        <div className="modal-backdrop">
          <section className="modal">
            <div className="section-title">
              <h2>새 작업 맡기기</h2>
              <button onClick={() => setModal(false)}>✕</button>
            </div>
            <p>원본은 보존하고 별도 worktree에서 작업해요.</p>
            <p>
              API 과금은 차단해요. Codex의 기존 ChatGPT 로그인과 구독 사용량을
              사용해요.
            </p>
            <form onSubmit={create}>
              <label>
                프로젝트 폴더
                <input
                  name="project"
                  placeholder="C:\\projects\\my-project"
                  required
                />
              </label>
              <label>
                목표
                <textarea
                  name="goal"
                  placeholder="실패한 테스트를 고치고 검증까지 끝내줘."
                  required
                />
              </label>
              <label>
                실행 AI
                <select name="backend">
                  <option value="codex-cli">Codex CLI</option>
                  <option value="claude-code" disabled>
                    Claude Code · 과금 없는 실행 미검증
                  </option>
                  <option value="opencode-cli" disabled>
                    OpenCode · 과금 없는 실행 미검증
                  </option>
                </select>
              </label>
              <label>
                완료 테스트의 실행 인수
                <input
                  name="argv"
                  defaultValue={'["node", "--test"]'}
                  required
                />
                <small>프로젝트에서 쓰는 테스트 명령을 배열로 지정해요.</small>
              </label>
              <details>
                <summary>선택 사항</summary>
                <label>
                  필수 산출물
                  <textarea
                    name="artifacts"
                    placeholder="작업 폴더 기준 경로, 한 줄에 하나"
                  />
                </label>
                <label>
                  시간 한도 (분)
                  <input
                    name="duration"
                    type="number"
                    min="1"
                    placeholder="생략하면 숫자 한도 없음"
                  />
                </label>
              </details>
              <div className="warning">
                자격증명·권한 확대 등 확인이 필요한 작업은 별도로 대기해요.
              </div>
              <button className="primary" disabled={busy}>
                {busy ? "작업 준비 중…" : "작업 시작"}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
