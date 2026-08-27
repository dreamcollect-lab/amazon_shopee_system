const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const appPath = path.join(repoRoot, "docs", "app.js");
const appSource = fs.readFileSync(appPath, "utf8");
const initializationStart = appSource.lastIndexOf("\nbindEvents();");

function makeElement() {
  return {
    value: "",
    textContent: "",
    innerHTML: "",
    className: "",
    href: "",
    disabled: false,
    checked: false,
    open: false,
    dataset: {},
    children: [],
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; }
    },
    addEventListener() {},
    append(...items) { this.children.push(...items); },
    appendChild(item) { this.children.push(item); return item; },
    querySelector() { return null; },
    focus() {},
    select() {}
  };
}

function createHarness({runs = [], runById = {}, confirmResult = true, workingFiles = [], sharedIgnoredRuns = []} = {}) {
  const elements = new Map();
  const storage = new Map();
  const fetchCalls = [];
  const confirmMessages = [];
  const alertMessages = [];
  let intervalSequence = 0;

  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement());
      return elements.get(id);
    },
    querySelector() { return makeElement(); },
    querySelectorAll() { return []; },
    createElement() { return makeElement(); },
    body: makeElement()
  };

  async function fetchMock(url, options = {}) {
    const urlText = String(url);
    fetchCalls.push({url: urlText, options});
    let data = {};
    if (/\/actions\/runs\/\d+$/.test(urlText)) {
      const runId = urlText.match(/\/actions\/runs\/(\d+)$/)[1];
      data = runById[runId] || runs.find((run) => String(run.id) === runId) || {};
    } else if (urlText.includes("/actions/workflows/") && urlText.includes("/runs?")) {
      data = {workflow_runs: runs};
    } else if (urlText.includes("/contents/input/working?")) {
      data = workingFiles;
    } else if (urlText.includes("/commits?")) {
      data = [];
    } else if (urlText.includes("ignored_workflow_runs.json")) {
      data = {version: 1, runs: sharedIgnoredRuns};
    }
    return {
      ok: true,
      status: 200,
      async json() { return data; },
      async blob() { return new Blob([]); }
    };
  }

  const context = {
    console: {error() {}},
    document,
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); }
    },
    fetch: fetchMock,
    confirm(message) { confirmMessages.push(String(message)); return confirmResult; },
    alert(message) { alertMessages.push(String(message)); },
    setInterval() { intervalSequence += 1; return intervalSequence; },
    clearInterval() {},
    setTimeout() {},
    window: {},
    navigator: {clipboard: {async writeText() {}}},
    Blob,
    Response,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    DataView,
    URL,
    atob,
    btoa
  };
  vm.createContext(context);
  vm.runInContext(
    appSource.slice(0, initializationStart) + `
      ;globalThis.__ghostRunTest = {
        CONFIG, state, INVALID_PAT_MESSAGE,
        isWaitingRun, isRunActive, isRunIgnoredForLock, isRunHiddenFromPrimaryDisplay, isRunLocking, isStep1Running,
        createIgnoredRunAudit, revokeIgnoredRunAudit, reconcileIgnoredRunAudits, loadIgnoredRunAudits, loadSharedIgnoredRunAudits,
        selectWorkflowRun, renderRun, emergencyIgnoreRun, cancelEmergencyRunIgnore,
        handleCompletedRun, createGithubHeaders, saveToken, parseAmazonFilename,
        deleteCurrentCsv, resetRunAndArtifactsState, fetchLatestRun
      };
    `,
    context
  );
  document.getElementById("tokenInput").value = "github_pat_test_token";
  return {
    app: context.__ghostRunTest,
    context,
    elements,
    storage,
    fetchCalls,
    confirmMessages,
    alertMessages
  };
}

function makeRun(id, status, conclusion = null) {
  return {
    id,
    status,
    conclusion,
    path: ".github/workflows/run_step1.yml",
    head_branch: "main",
    created_at: "2026-08-26T15:07:11Z",
    html_url: `https://github.com/example/actions/runs/${id}`
  };
}

test("通常のqueued RunはCSVクリアを禁止する", async () => {
  const run = makeRun(101, "queued");
  const harness = createHarness({runs: [run], workingFiles: [{name: "blocked.csv", type: "file"}]});
  harness.app.state.workflowRuns = [run];
  harness.app.renderRun(run);
  await harness.app.deleteCurrentCsv();
  assert.equal(harness.app.isRunLocking(run), true);
  assert.equal(harness.app.isStep1Running(), true);
  assert.equal(harness.elements.get("deleteCsvBtn").disabled, true);
  assert.equal(harness.confirmMessages.length, 0);
  assert.equal(harness.fetchCalls.some((call) => call.options.method === "DELETE"), false);
});

test("in_progress RunはCSVクリアを禁止する", async () => {
  const run = makeRun(102, "in_progress");
  const harness = createHarness({runs: [run], workingFiles: [{name: "blocked.csv", type: "file"}]});
  harness.app.state.workflowRuns = [run];
  harness.app.renderRun(run);
  await harness.app.deleteCurrentCsv();
  assert.equal(harness.app.isRunLocking(run), true);
  assert.equal(harness.app.isStep1Running(), true);
  assert.equal(harness.confirmMessages.length, 0);
  assert.equal(harness.fetchCalls.some((call) => call.options.method === "DELETE"), false);
});

test("queuedだけでは緊急解除されず、確認チェックが必須", async () => {
  const run = makeRun(103, "queued");
  const harness = createHarness({runs: [run], runById: {103: run}});
  harness.app.state.workflowRuns = [run];
  harness.app.renderRun(run);
  harness.elements.get("emergencyRunIdInput").value = "103";
  harness.elements.get("emergencyRunReason").value = "ghost queued";
  await assert.rejects(
    () => harness.app.emergencyIgnoreRun(),
    /通常キャンセルまたはforce-cancelが拒否されたことを確認してください/
  );
  assert.equal(harness.app.state.ignoredRunAudits.length, 0);
});

test("確認情報が欠けたLocalStorage記録ではqueued Runを除外しない", () => {
  const run = makeRun(113, "queued");
  const harness = createHarness();
  harness.storage.set(harness.app.CONFIG.ignoredRunsKey, JSON.stringify([{
    run_id: "113",
    workflow: "run_step1.yml",
    created_at: run.created_at,
    ignored_at: "2026-08-27T01:00:00Z",
    reason: "ghost"
  }]));
  harness.app.loadIgnoredRunAudits();
  assert.equal(harness.app.state.ignoredRunAudits.length, 0);
  assert.equal(harness.app.isRunIgnoredForLock(run), false);
  assert.equal(harness.app.isRunLocking(run), true);
});

test("管理者の明示操作後だけ対象Runを監査付きで除外する", async () => {
  const run = makeRun(104, "queued");
  const harness = createHarness({runs: [run], runById: {104: run}});
  harness.app.state.workflowRuns = [run];
  harness.app.renderRun(run);
  harness.elements.get("emergencyRunIdInput").value = "104";
  harness.elements.get("emergencyRunReason").value = "GitHub障害時のghost queued";
  harness.elements.get("emergencyCancelFailureConfirmed").checked = true;
  await harness.app.emergencyIgnoreRun();

  assert.equal(harness.app.state.ignoredRunAudits.length, 1);
  const audit = harness.app.state.ignoredRunAudits[0];
  assert.deepEqual(
    [audit.run_id, audit.workflow, audit.created_at, Boolean(audit.ignored_at), audit.reason],
    ["104", "run_step1.yml", run.created_at, true, "GitHub障害時のghost queued"]
  );
  assert.equal(harness.app.isRunIgnoredForLock(run), true);
  assert.equal(harness.app.isRunHiddenFromPrimaryDisplay(run), true);
  assert.equal(harness.app.isStep1Running(), false);
  assert.equal(harness.app.state.latestRun, null);
  assert.equal(harness.elements.get("runIdText").textContent, "-");
  assert.match(harness.confirmMessages[0], /GitHub上のRunは削除・キャンセルされていません/);
  assert.match(harness.storage.get(harness.app.CONFIG.ignoredRunsKey), /"run_id":"104"/);
});

test("除外していない別Runがactiveなら引き続きロックする", () => {
  const ignoredRun = makeRun(105, "queued");
  const otherRun = makeRun(106, "in_progress");
  const harness = createHarness();
  harness.app.state.ignoredRunAudits = [harness.app.createIgnoredRunAudit(ignoredRun, "ghost")];
  harness.app.state.workflowRuns = [ignoredRun, otherRun];
  const selected = harness.app.selectWorkflowRun(harness.app.state.workflowRuns);
  harness.app.renderRun(selected);
  assert.equal(selected.id, 106);
  assert.equal(harness.app.isStep1Running(), true);
});

test("解除済みRunがin_progressへ変化したら無視を自動解除して再ロックする", () => {
  const queued = makeRun(107, "queued");
  const running = makeRun(107, "in_progress");
  const harness = createHarness();
  harness.app.state.ignoredRunAudits = [harness.app.createIgnoredRunAudit(queued, "ghost")];
  harness.app.reconcileIgnoredRunAudits([running]);
  assert.ok(harness.app.state.ignoredRunAudits[0].reactivated_at);
  assert.equal(harness.app.state.ignoredRunAudits[0].reactivated_status, "in_progress");
  assert.equal(harness.app.isRunIgnoredForLock(running), false);
  assert.equal(harness.app.isRunLocking(running), true);
});

test("completed/cancelled/failureはactive判定から外れ通常終了する", async () => {
  const cancelled = makeRun(108, "completed", "cancelled");
  const harness = createHarness();
  harness.app.state.ignoredRunAudits = [
    harness.app.createIgnoredRunAudit(makeRun(108, "queued"), "ghost")
  ];
  harness.app.reconcileIgnoredRunAudits([cancelled]);
  harness.app.state.workflowRuns = [cancelled];
  harness.app.renderRun(cancelled);
  await harness.app.handleCompletedRun(cancelled);
  assert.equal(harness.app.isRunActive(cancelled), false);
  assert.equal(harness.app.isStep1Running(), false);
  assert.equal(harness.app.state.ignoredRunAudits.length, 1);
  assert.ok(harness.app.state.ignoredRunAudits[0].completed_observed_at);
  assert.match(harness.elements.get("messageLog").textContent, /STEP1が完了しました: キャンセル/);

  const failed = makeRun(109, "completed", "failure");
  assert.equal(harness.app.isRunActive(failed), false);
  assert.equal(harness.app.isRunLocking(failed), false);
});

test("解除取り消しでqueued Runを再ロックする", async () => {
  const run = makeRun(110, "queued");
  const harness = createHarness({runs: [run]});
  harness.app.state.ignoredRunAudits = [harness.app.createIgnoredRunAudit(run, "誤解除")];
  harness.app.state.workflowRuns = [run];
  await harness.app.cancelEmergencyRunIgnore("110");
  assert.ok(harness.app.state.ignoredRunAudits[0].revoked_at);
  assert.equal(harness.app.isRunIgnoredForLock(run), false);
  assert.equal(harness.app.isStep1Running(), true);
});

test("PATはログへ出ず、GitHub共通header修正を維持する", () => {
  const harness = createHarness();
  const invalidToken = "github_pat_secret\u65e5\u672c\u8a9e";
  harness.elements.get("tokenInput").value = invalidToken;
  assert.throws(
    () => harness.app.createGithubHeaders(),
    (error) => error.message === harness.app.INVALID_PAT_MESSAGE && !error.message.includes(invalidToken)
  );

  const validToken = "github_pat_test_header";
  harness.elements.get("tokenInput").value = ` \r\n${validToken}\r\n `;
  harness.app.saveToken();
  const headers = harness.app.createGithubHeaders({"Content-Type": "application/json"});
  assert.equal(headers.Authorization, `Bearer ${validToken}`);
  assert.ok(Object.values(headers).every((value) => /^[\x20-\x7e]*$/.test(value)));
  assert.doesNotMatch(harness.elements.get("messageLog").textContent, new RegExp(validToken));
  assert.equal((appSource.match(/"Authorization": `Bearer \$\{token\}`/g) || []).length, 1);
  assert.match(appSource, /fetchArtifactBlob[\s\S]*headers: createGithubHeaders\(\)/);

  const html = fs.readFileSync(path.join(repoRoot, "docs", "index.html"), "utf8");
  assert.match(html, /id="tokenInput" type="password"/);
});

test("解除済みghostではなく新しいdispatch Runを監視する", () => {
  const ghost = makeRun(111, "queued");
  const nextRun = {...makeRun(112, "queued"), created_at: "2026-08-27T01:00:00Z"};
  const harness = createHarness();
  harness.app.state.ignoredRunAudits = [harness.app.createIgnoredRunAudit(ghost, "ghost")];
  harness.app.state.workflowDispatchTime = new Date("2026-08-27T01:00:10Z").getTime();
  harness.app.state.runDetectDeadline = Date.now() + 60000;
  harness.app.state.previousRunId = ghost.id;
  const selected = harness.app.selectWorkflowRun([nextRun, ghost]);
  assert.equal(selected.id, nextRun.id);
});

test("CSVクリア後の監視では解除済みRunを通常画面と通常ログへ戻さない", async () => {
  const ghost = makeRun(114, "queued");
  const completed = {...makeRun(115, "completed", "success"), created_at: "2026-08-27T01:00:00Z"};
  const harness = createHarness({runs: [completed, ghost]});
  harness.app.state.ignoredRunAudits = [harness.app.createIgnoredRunAudit(ghost, "ghost")];
  harness.app.resetRunAndArtifactsState();

  await harness.app.fetchLatestRun({silent: true});

  assert.equal(harness.app.state.latestRun, null);
  assert.equal(harness.elements.get("runIdText").textContent, "-");
  assert.doesNotMatch(harness.elements.get("messageLog")?.textContent || "", /114/);
  assert.equal(harness.app.isStep1Running(), false);
});

test("別ブラウザでも全端末共通台帳から解除済みRunを通常表示しない", async () => {
  const ghost = makeRun(116, "queued");
  const sharedAudit = {
    run_id: "116",
    workflow: "run_step1.yml",
    created_at: ghost.created_at,
    ignored_at: "2026-08-27T08:14:52Z",
    reason: "GitHub障害時のghost queued",
    cancel_failure_confirmed: true,
    last_status: "queued",
    last_conclusion: null
  };
  const harness = createHarness({runs: [ghost], sharedIgnoredRuns: [sharedAudit]});

  harness.app.loadIgnoredRunAudits();
  assert.equal(harness.app.state.ignoredRunAudits.length, 0);
  await harness.app.loadSharedIgnoredRunAudits();

  assert.equal(harness.app.state.ignoredRunAudits.length, 1);
  assert.equal(harness.app.state.ignoredRunAudits[0].shared, true);
  assert.equal(harness.app.selectWorkflowRun([ghost]), null);
  harness.app.renderRun(harness.app.selectWorkflowRun([ghost]));
  assert.equal(harness.elements.get("runIdText").textContent, "-");
  assert.equal(harness.app.isStep1Running(), false);
});

test("CSVクリア確認には対象ファイル名を表示し、拒否時はDELETEしない", async () => {
  const file = {
    name: "target-category.csv",
    path: "input/working/target-category.csv",
    sha: "abc123",
    size: 100,
    type: "file"
  };
  const harness = createHarness({confirmResult: false, workingFiles: [file]});
  await harness.app.deleteCurrentCsv();
  assert.match(harness.confirmMessages[0], /target-category\.csv/);
  assert.equal(harness.fetchCalls.some((call) => call.options.method === "DELETE"), false);
});

test("CSVファイル名解析順序は従来どおり日付除去後にcategoryと価格を判定する", () => {
  const harness = createHarness();
  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.app.parseAmazonFilename("drippot@1000_20260827.csv"))),
    {category: "drippot", price: "1000"}
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.app.parseAmazonFilename("coffee_20260827.csv"))),
    {category: "coffee", price: "なし"}
  );
});

test("緊急解除UIは必須警告を表示し、特定Run IDをハードコードしない", () => {
  const html = fs.readFileSync(path.join(repoRoot, "docs", "index.html"), "utf8");
  for (const message of [
    "異常Runを緊急解除",
    "GitHub上のRunは削除・キャンセルされていません",
    "このRunだけをWeb UIの業務ロック対象から除外します",
    "別の実行中Runが存在する場合、CSVはクリアできません",
    "解除を取り消す"
  ]) {
    assert.match(`${html}\n${appSource}`, new RegExp(message));
  }
  assert.doesNotMatch(appSource, /actions\/runs\/[^`"']+\/(?:cancel|force-cancel)/);
  assert.doesNotMatch(appSource, /32984118188/);
});
