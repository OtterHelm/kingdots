import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type Watch = {
  id: string;
  goal: string;
  state: string;
  automatic: boolean;
  epoch: number;
  sessions: {
    backend: string;
    sessionId: string;
    project: string;
    source: string;
  }[];
  completionConditions: string[];
  allowedFollowUp: string;
  blockedReason: string | null;
  lastHealthyAt: string | null;
  finalReport: string | null;
  completionEvidence: { condition: string; reference: string; passed: true }[];
  observations: {
    backend: string;
    sessionId: string;
    state: string;
    summary: string;
    receivedAt: string;
    provenance: string;
    evidence: string[];
  }[];
};
const names: Record<string, string> = {
  "codex-cli": "Codex CLI",
  "codex-app": "Codex 앱",
  "claude-code": "Claude Code",
  "claude-app": "Claude 앱",
  "opencode-cli": "OpenCode",
};
const stages: Record<string, string> = {
  watching: "관찰 중",
  awaiting_decision: "Dots 판단 대기",
  awaiting_input: "사용자 입력 필요",
  paused: "관리 일시정지",
  released: "관리 해제",
  completed: "Dots 보고 완료",
};
const states: Record<string, string> = {
  running: "작업 중",
  idle: "응답 종료 · 완료 여부 판단 필요",
  question: "질문 대기",
  permission: "권한 확인 대기",
  failed: "오류",
  unknown: "현재 상태 확인 불가",
  user_intervened: "사용자 개입",
};
function initialToken() {
  const value = new URLSearchParams(location.hash.slice(1)).get("token");
  if (value) {
    sessionStorage.setItem("kingdots-token", value);
    history.replaceState(null, "", location.pathname);
  }
  return value ?? sessionStorage.getItem("kingdots-token") ?? "";
}
function App() {
  const [token, setToken] = useState(initialToken),
    [login, setLogin] = useState("");
  const [watches, setWatches] = useState<Watch[]>([]),
    [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null),
    [status, setStatus] = useState<any>(null),
    [caps, setCaps] = useState<any[]>([]),
    [reviews, setReviews] = useState<any[]>([]);
  const [tab, setTab] = useState("watches"),
    [modal, setModal] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
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
      const [all, info] = await Promise.all([api("/watches"), api("/status")]);
      setWatches(all);
      setStatus(info);
      if (tab === "dots") setReviews(await api("/relay/reviews"));
      if (selected) setDetail(await api("/watches/" + selected));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (!token) return;
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [token, selected, tab]);
  useEffect(() => {
    if (token && tab === "connections")
      void api("/capabilities")
        .then(setCaps)
        .catch((e) => setError(e.message));
  }, [token, tab]);
  async function control(action: string) {
    if (!selected) return;
    setBusy(true);
    try {
      await api(`/watches/${selected}/${action}`, {});
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function enroll(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const goal = String(data.get("goal")),
        allowedFollowUp = String(data.get("scope"));
      const watch = await api("/watches", {
        goal,
        allowedFollowUp,
        sessions: JSON.parse(String(data.get("sessions"))),
        completionConditions: String(data.get("conditions"))
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        authorization: {
          source: "direct_user_request",
          request: goal + "\n허용한 후속 지시: " + allowedFollowUp,
        },
      });
      setModal(false);
      setSelected(watch.id);
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
        <p>Dots가 기존 작업 세션을 관찰하고 관리해요.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sessionStorage.setItem("kingdots-token", login);
            setToken(login);
          }}
        >
          <label>
            로컬 접근 토큰
            <input
              type="password"
              autoComplete="off"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
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
  const watch: Watch | undefined = detail?.watch;
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">◌</span>
          <div>
            <strong>kingdots</strong>
            <small>DOTS SESSION OBSERVER</small>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <button
          className={tab === "watches" ? "nav active" : "nav"}
          onClick={() => setTab("watches")}
        >
          ▤ <span>기존 세션 감시</span>
          <b>{watches.length}</b>
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
          ◌ <span>Dots 후속 판단</span>
        </button>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>
              {tab === "watches"
                ? "기존 세션 관찰과 관리"
                : tab === "connections"
                  ? "연결과 지원"
                  : "Dots 후속 판단"}
            </h1>
            <p>판단과 지시는 Dots가 맡고, 원래 세션에서 작업을 이어가요.</p>
          </div>
          <button className="primary" onClick={() => setModal(true)}>
            ＋ 기존 세션 등록
          </button>
        </header>
        {error && (
          <div className="error">
            <span>{error}</span>
            <button onClick={() => setError("")}>닫기</button>
          </div>
        )}
        {tab === "watches" && (
          <>
            <div className="warning">
              새 AI 세션이나 worktree를 만들지 않아요. 앱의 실시간 관찰·제어
              연결과 Dots의 응답 종료 후 자동 관리는 실제 시험 전까지
              미검증이에요.
            </div>
            <div className="task-grid">
              <section className="task-list">
                <div className="section-title">
                  <h2>감시 대상</h2>
                  <span>{watches.length}개</span>
                </div>
                {watches.length === 0 ? (
                  <div className="empty">
                    <span>◌</span>
                    <h3>등록한 기존 세션이 없어요</h3>
                    <p>
                      관리할 세션 ID·목표·허용 범위를 Dots에 맡기세요.
                      <br />
                      등록만으로 밤새 자동 관리가 시작되지는 않아요.
                    </p>
                  </div>
                ) : (
                  watches.map((w) => (
                    <button
                      className={
                        selected === w.id ? "task-card selected" : "task-card"
                      }
                      key={w.id}
                      onClick={() => setSelected(w.id)}
                    >
                      <span className={"badge " + w.state}>
                        {stages[w.state]}
                      </span>
                      <h3>{w.goal}</h3>
                      <p>
                        {w.sessions.length}개 기존 세션 ·{" "}
                        {w.automatic ? "관리 등록됨" : "관리 중단됨"}
                      </p>
                    </button>
                  ))
                )}
              </section>
              <section className="details task-detail">
                {!watch ? (
                  <div className="empty">
                    <h3>감시 대상을 선택하세요</h3>
                  </div>
                ) : (
                  <>
                    <div className="section-title">
                      <h2>{watch.goal}</h2>
                      <span>{stages[watch.state]}</span>
                    </div>
                    {watch.blockedReason && (
                      <div className="warning">{watch.blockedReason}</div>
                    )}
                    <div className="controls">
                      {watch.automatic ? (
                        <>
                          <button
                            disabled={busy}
                            onClick={() => void control("pause")}
                          >
                            Dots 관리 일시정지
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => void control("release")}
                          >
                            관리 해제
                          </button>
                        </>
                      ) : watch.state !== "completed" ? (
                        <button
                          disabled={busy}
                          onClick={() => void control("resume")}
                        >
                          사용자 지시로 관리 재개
                        </button>
                      ) : null}
                      <button
                        disabled={busy}
                        onClick={() => void control("poll")}
                      >
                        관찰 연결 확인
                      </button>
                    </div>
                    <p className="muted">
                      관리 중단은 원래 작업 세션을 종료하거나 멈추지 않아요.
                    </p>
                    <h3 className="subheading">목표와 허용 범위</h3>
                    <p>{watch.allowedFollowUp}</p>
                    <ul>
                      {watch.completionConditions.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                    <h3 className="subheading">기존 세션의 최근 관찰</h3>
                    {watch.sessions.map((s) => {
                      const o = watch.observations.find(
                        (o) =>
                          o.backend === s.backend &&
                          o.sessionId === s.sessionId,
                      );
                      return (
                        <div
                          className="connection"
                          key={s.backend + ":" + s.sessionId}
                        >
                          <h3>
                            {names[s.backend]} · {s.sessionId}
                          </h3>
                          <p>{s.project}</p>
                          <p>
                            관찰 경로:{" "}
                            {s.source === "dots_host"
                              ? "Dots가 공식 호스트 도구로 수집"
                              : s.source === "app_host"
                                ? "설치된 공식 앱 도구로 로컬 중계"
                                : "로컬 어댑터의 읽기 전용 메타데이터"}
                          </p>
                          <strong>
                            {o ? states[o.state] : "관찰 기록 없음"}
                          </strong>
                          {o && (
                            <>
                              <p>{o.summary}</p>
                              <small>
                                {new Date(o.receivedAt).toLocaleString("ko-KR")}{" "}
                                ·{" "}
                                {o.provenance === "dots_host_reported"
                                  ? "Dots가 전달한 기록"
                                  : o.provenance === "app_host_verified"
                                    ? "로컬 앱 도구의 실제 응답"
                                    : "어댑터 메타데이터"}
                              </small>
                              <details>
                                <summary>관찰 근거</summary>
                                <pre>{o.evidence.join("\n")}</pre>
                              </details>
                            </>
                          )}
                        </div>
                      );
                    })}
                    <div className="facts">
                      <div>
                        <span>마지막 정상 관찰</span>
                        <b>
                          {watch.lastHealthyAt
                            ? new Date(watch.lastHealthyAt).toLocaleString(
                                "ko-KR",
                              )
                            : "확인되지 않음"}
                        </b>
                      </div>
                      <div>
                        <span>사용량</span>
                        <b>확인 불가 · 수치를 추정하지 않음</b>
                      </div>
                    </div>
                    <h3 className="subheading">Dots의 지시와 전달 결과</h3>
                    <div className="timeline">
                      {detail.commands?.map((c: any) => (
                        <div key={c.id}>
                          <span className="timeline-dot" />
                          <div>
                            <strong>{c.reason}</strong>
                            <small>
                              {c.status} ·{" "}
                              {c.result?.delivery ?? "전달 기록 없음"}
                            </small>
                            <details>
                              <summary>지시와 결과 보기</summary>
                              <pre>
                                {JSON.stringify(
                                  { prompt: c.prompt, result: c.result },
                                  null,
                                  2,
                                )}
                              </pre>
                            </details>
                          </div>
                        </div>
                      ))}
                    </div>
                    {watch.finalReport && (
                      <div className="report">
                        <h3>Dots의 최종 보고</h3>
                        <p>{watch.finalReport}</p>
                        <details>
                          <summary>보고 근거 · 호스트 전달 기록</summary>
                          <pre>
                            {JSON.stringify(watch.completionEvidence, null, 2)}
                          </pre>
                        </details>
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>
          </>
        )}
        {tab === "connections" && (
          <div className="connections">
            <section className="connection">
              <h2>기존 Codex 앱 연결</h2>
              <p>
                {status?.appHost?.available
                  ? "실행기 연결 문맥 있음 · 실제 세션 조회로 확인 필요"
                  : "연결 문맥 없음 · 기존 Codex 대화에서 kingdots를 시작하세요"}
              </p>
              <p>
                비공개 중계:{" "}
                {status?.relay?.configured ? "설정됨" : "설정되지 않음"} ·{" "}
                {status?.relay?.enabled ? "연결 허용" : "연결 꺼짐"}
              </p>
              <p>전송 상태: {status?.relay?.transport?.state ?? "기록 없음"}</p>
              <p>
                마지막 정상 연결:{" "}
                {status?.relay?.transport?.lastHealthyAt ?? "아직 없음"}
              </p>
              <p>
                확인되지 않은 조회 결과: {status?.relay?.unknownResults ?? 0}건
                · 자동 재전송하지 않아요.
              </p>
            </section>
            <p>
              로컬 어댑터의 조회와 Dots의 공식 앱 세션 접근은 별도로 검증해야
              해요. 기존 세션에 대한 제어권을 추정하지 않아요.
            </p>
            {caps.map((c) => (
              <section className="connection" key={c.id}>
                <div className="section-title">
                  <h2>{names[c.id]}</h2>
                  <span>{c.version ?? "직접 제어 연결 미검증"}</span>
                </div>
                {c.capabilities
                  .filter((f: any) =>
                    ["read_existing", "adopt_running"].includes(f.feature),
                  )
                  .map((f: any) => (
                    <div className="facts" key={f.feature}>
                      <strong>
                        {f.feature === "read_existing"
                          ? "기존 세션 읽기"
                          : "외부 실행 세션 인수"}{" "}
                        · {f.state}
                      </strong>
                      <p>{f.notes}</p>
                      {f.evidence && <small>{f.evidence}</small>}
                    </div>
                  ))}
              </section>
            ))}
          </div>
        )}
        {tab === "dots" && (
          <section className="connection dots-panel">
            <h2>Dots가 관리 주체예요</h2>
            <p>
              Dots가 기존 기록을 검토하고 개입 필요 여부를 판단해요. 현재 계정
              플러그인은 세션 조회와 지시 없는 판단 반환을 제공해요.
            </p>
            <div className="warning">
              이전 연결에서 조회·판단 반환·응답 종료 후 1회성 재조회가 제한된
              시험을 통과했어요. 통합 경로의 실제 Dots 재시험은 대기 중이며, 정기
              감시·안전한 지시·야간 자동 관리는 미검증이에요.
            </div>
            <div className="facts">
              <div>
                <span>관리 주체</span>
                <b>Dots</b>
              </div>
              <div>
                <span>신규 세션 생성</span>
                <b>제공하지 않음</b>
              </div>
              <div>
                <span>판단 반환 기록</span>
                <b>{status?.relay?.lastReviewAt ?? "아직 없음"}</b>
              </div>
              <div>
                <span>밤새 자동 관리 합격</span>
                <b>미검증</b>
              </div>
            </div>
            <p>
              API 키나 별도 판단용 모델을 사용하지 않아요. 연결 설치 또는 이벤트
              수신만으로 자동 관리 합격을 표시하지 않아요.
            </p>
            <h3>회수한 판단 기록 · {reviews.length}건</h3>
            <p className="muted">
              인증된 계정의 반환 기록이에요. 이 기록만으로 Dots 실행 주체나 자동
              관리 합격을 증명하지 않아요.
            </p>
            {reviews.map((r) => (
              <div className="connection" key={r.inspectionId}>
                <strong>지시 없이 계속 관찰</strong>
                <p>{r.reason}</p>
                <small>
                  {new Date(r.receivedAt).toLocaleString("ko-KR")} ·{" "}
                  {r.legacy
                    ? "이전 시험에서 가져온 이력 · 현재 감시와 연결되지 않음"
                    : "현재 연결에서 회수"}
                </small>
              </div>
            ))}
          </section>
        )}
      </main>
      {modal && (
        <div className="modal-backdrop">
          <section className="modal">
            <div className="section-title">
              <h2>기존 세션 감시 등록</h2>
              <button onClick={() => setModal(false)}>✕</button>
            </div>
            <p>
              이미 실행 중인 세션의 ID를 등록해요. 등록 과정은 원래 세션에
              지시를 보내거나 새 세션을 만들지 않아요.
            </p>
            <form onSubmit={enroll}>
              <label>
                관리 목표
                <textarea
                  name="goal"
                  placeholder="자는 동안 지정된 기존 세션의 작업을 관찰하고 목표 범위에서 후속 지시해줘."
                  required
                />
              </label>
              <label>
                관리할 기존 세션 목록
                <textarea
                  name="sessions"
                  rows={5}
                  placeholder={
                    '[{"backend":"codex-app","sessionId":"기존 세션 ID","project":"C:\\\\projects\\\\example","source":"app_host"}]'
                  }
                  required
                />
                <small>
                  Dots가 확인한 정확한 기존 세션 ID와 프로젝트를 JSON 배열로
                  입력해요.
                </small>
              </label>
              <label>
                허용하는 후속 지시
                <textarea
                  name="scope"
                  placeholder="기존 목표 범위의 질문 응답과 오류 보완. 새 세션·권한 변경·배포 금지."
                  required
                />
              </label>
              <label>
                완료 조건
                <textarea
                  name="conditions"
                  placeholder="필수 테스트 통과 근거 확인\n지정 산출물 확인 및 최종 보고"
                  required
                />
              </label>
              <div className="warning">
                Dots 연결이 확인되지 않았으면 감시 등록만으로 무인 관리가
                시작되지 않아요.
              </div>
              <button className="primary" disabled={busy}>
                {busy ? "등록 중…" : "기존 세션 등록"}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
