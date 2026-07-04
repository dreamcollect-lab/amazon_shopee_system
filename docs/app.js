const CONFIG = {
  owner: "dreamcollect-lab",
  repo: "amazon_shopee_system",
  branch: "main",
  workflow: "run_step1.yml",
  tokenKey: "amazonShopeeGithubPat"
};

const state = {
  token: "",
  selectedFile: null,
  currentAmazonPath: null,
  selectedMaster: "category_rules.csv",
  masterSha: null,
  latestRun: null,
  latestArtifacts: [],
  categoryRulesLoaded: false,
  categoryRulesSaved: false,
  masterDirty: false,
  csvUploaded: false,
  artifactsLoaded: false,
  currentView: "upload",
  workflowRunning: false,
  runPollTimer: null,
  workflowDispatchTime: null,
  reviewAutoOpened: false,
  lastRunLogKey: "",
  completedRunId: null,
  previousRunId: null
};

const VIEW_TITLES = {
  upload: "Amazon CSVアップロード",
  rules: "category_rules.csv編集",
  save: "マスター保存",
  run: "STEP1実行",
  review: "Review",
  improve: "Rule改善・再実行"
};

const $ = (id) => document.getElementById(id);

function apiUrl(path) {
  return `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}${path}`;
}

function log(message, type = "info") {
  const stamp = new Date().toLocaleString("ja-JP");
  $("messageLog").textContent = `[${stamp}] ${message}\n` + $("messageLog").textContent;
  if (type === "error") console.error(message);
}

function getToken() {
  const token = $("tokenInput").value.trim() || state.token;
  if (!token) throw new Error("PATが未保存です。初回のみPATを貼り付けてPATを保存してください。");
  return token;
}

async function githubFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Authorization": `Bearer ${token}`,
    ...(options.headers || {})
  };

  const response = await fetch(apiUrl(path), {
    ...options,
    headers
  });

  if (!response.ok) {
    let detail = "";
    try {
      const data = await response.json();
      detail = data.message ? `: ${data.message}` : "";
    } catch {
      detail = `: HTTP ${response.status}`;
    }
    throw new Error(`GitHub APIエラー ${response.status}${detail}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

function updateTokenState() {
  const saved = Boolean(localStorage.getItem(CONFIG.tokenKey));
  $("tokenState").textContent = saved ? "保存済み" : "未保存";
  $("tokenState").classList.toggle("ok", saved);
  $("tokenInput").classList.toggle("needs-input", !saved);
  document.querySelector(".settings-panel")?.classList.toggle("needs-token", !saved);
}

function updateCategoryRulesState() {
  const stateEl = $("categoryRulesState");
  if (!state.categoryRulesLoaded) {
    stateEl.textContent = "category_rules未取得";
    stateEl.classList.remove("ok");
    return;
  }
  if (!state.categoryRulesSaved) {
    stateEl.textContent = "category_rules未保存";
    stateEl.classList.remove("ok");
    return;
  }
  stateEl.textContent = "category_rules確認済み";
  stateEl.classList.add("ok");
}

function isStep1Ready() {
  return state.csvUploaded && state.categoryRulesLoaded && state.categoryRulesSaved;
}

function isRunActive(run) {
  return Boolean(run && run.status && run.status !== "completed");
}

function isRunAfterDispatch(run) {
  if (!state.workflowDispatchTime || !run?.created_at) return true;
  return new Date(run.created_at).getTime() >= state.workflowDispatchTime - 30000;
}

function selectWorkflowRun(runs) {
  const list = runs || [];
  if (!state.workflowDispatchTime) return list[0] || null;
  return list.find((run) => run.id !== state.previousRunId && isRunAfterDispatch(run)) || null;
}

function translateRunStatus(status, conclusion = null) {
  if (status === "completed" && conclusion === "success") return "成功";
  if (status === "completed" && conclusion === "failure") return "失敗";
  if (status === "completed" && conclusion === "cancelled") return "キャンセル";
  if (status === "completed" && conclusion === "timed_out") return "タイムアウト";
  const labels = {
    queued: "待機中",
    requested: "要求済み",
    waiting: "待機中",
    pending: "待機中",
    in_progress: "実行中",
    completed: "完了"
  };
  return labels[status] || status || "-";
}

function translateRunConclusion(conclusion) {
  if (!conclusion || conclusion === "-") return "未完了";
  const labels = {
    success: "成功",
    failure: "失敗",
    cancelled: "キャンセル",
    skipped: "スキップ",
    timed_out: "タイムアウト",
    action_required: "対応が必要",
    neutral: "中立"
  };
  return labels[conclusion] || conclusion;
}

function updateRunNotice() {
  const ready = isStep1Ready();
  const running = state.workflowRunning || isRunActive(state.latestRun);
  $("runPreflightNotice")?.classList.toggle("hidden", ready || running);
  $("runRunningNotice")?.classList.toggle("hidden", !running);
}

function setActiveView(view) {
  state.currentView = view;
  document.querySelectorAll(".work-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.view === view);
  });
  document.querySelectorAll(".flow-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === view);
  });
  $("workTitle").textContent = VIEW_TITLES[view] || "現在の作業";
  $("workState").textContent = "作業中";
  updateWizard();
}

function updateWizard() {
  const steps = {
    stepUpload: Boolean(state.selectedFile && state.csvUploaded),
    stepRules: state.categoryRulesLoaded,
    stepSave: state.categoryRulesLoaded && state.categoryRulesSaved,
    stepRun: Boolean(state.latestRun),
    stepResults: state.artifactsLoaded,
    stepImprove: false
  };

  Object.entries(steps).forEach(([id, done]) => {
    const el = $(id);
    if (!el) return;
    el.classList.toggle("done", done);
    el.classList.toggle("active", el.dataset.view === state.currentView);
    const mark = el.querySelector(".flow-mark");
    if (!mark) return;
    if (el.dataset.view === state.currentView) mark.textContent = "▶";
    else mark.textContent = done ? "✔" : "□";
  });

  $("saveCategoryState").textContent = state.categoryRulesLoaded
    ? (state.categoryRulesSaved ? "確認・保存済み" : "未保存")
    : "未取得";
  $("saveCsvState").textContent = state.csvUploaded ? "アップロード済み" : "未アップロード";
  updateRunNotice();
}

function saveToken() {
  const token = $("tokenInput").value.trim();
  if (!token) {
    log("保存するPATが入力されていません。", "error");
    return;
  }
  localStorage.setItem(CONFIG.tokenKey, token);
  state.token = token;
  updateTokenState();
  log("PATをLocalStorageへ保存しました。");
}

function loadToken() {
  const token = localStorage.getItem(CONFIG.tokenKey) || "";
  $("tokenInput").value = token;
  state.token = token;
  updateTokenState();
  log(token ? "保存済みPATを自動読込しました。" : "PATは未保存です。初回のみ貼り付けてPATを保存してください。");
}

function clearToken() {
  localStorage.removeItem(CONFIG.tokenKey);
  $("tokenInput").value = "";
  state.token = "";
  updateTokenState();
  log("保存済みPATを削除しました。");
}

function normalizeAt(value) {
  return value.normalize("NFKC");
}

function parseAmazonFilename(fileName) {
  const stem = normalizeAt(fileName.replace(/\.csv$/i, "")).trim().toLowerCase();
  const stemWithoutDate = stem.replace(/_[0-9]{4,8}$/u, "").replace(/^[_\s]+|[_\s]+$/g, "");
  let category = stemWithoutDate;
  let price = "なし";

  if (stemWithoutDate.includes("@")) {
    const parts = stemWithoutDate.split("@");
    category = parts.shift().replace(/^[_\s]+|[_\s]+$/g, "");
    price = parts.join("@") || "形式確認";
  }

  return {
    category: category || "unknown",
    price
  };
}

function setSelectedFile(file) {
  state.selectedFile = file;
  state.csvUploaded = false;
  state.currentAmazonPath = null;
  state.workflowRunning = false;
  resetRunAndArtifactsState();
  const parsed = parseAmazonFilename(file.name);
  $("fileState").textContent = "選択済み";
  $("fileState").classList.add("ok");
  $("fileNameText").textContent = file.name;
  $("categoryText").textContent = parsed.category;
  $("priceText").textContent = parsed.price;
  $("fileSizeText").textContent = formatKb(file.size);
  log(`CSVを選択しました: ${file.name}`);
  updateWizard();
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function getContentSha(path) {
  try {
    const data = await githubFetch(`/contents/${encodeURIComponentPath(path)}?ref=${encodeURIComponent(CONFIG.branch)}`);
    return data.sha || null;
  } catch (error) {
    if (String(error.message).includes("404")) return null;
    throw error;
  }
}

function encodeURIComponentPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function uploadCsv() {
  if (!state.selectedFile) {
    log("Amazon CSVが選択されていません。", "error");
    return;
  }
  if (!state.selectedFile.name.toLowerCase().endsWith(".csv")) {
    log("CSVファイルを選択してください。", "error");
    return;
  }

  const path = `input/working/${state.selectedFile.name}`;
  log(`アップロード準備中: ${path}`);
  const buffer = await state.selectedFile.arrayBuffer();
  const content = arrayBufferToBase64(buffer);
  const sha = await getContentSha(path);
  const body = {
    message: `Upload Amazon CSV ${state.selectedFile.name}`,
    content,
    branch: CONFIG.branch
  };
  if (sha) body.sha = sha;

  await githubFetch(`/contents/${encodeURIComponentPath(path)}`, {
    method: "PUT",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(body)
  });
  state.csvUploaded = true;
  state.currentAmazonPath = path;
  state.artifactsLoaded = false;
  state.workflowRunning = false;
  $("fileState").textContent = "アップロード済み";
  $("fileState").classList.add("ok");
  updateWizard();
  log(`Amazon CSVをアップロードしました: ${path}`);
  setActiveView("rules");
}

function resetAmazonCsvState() {
  state.selectedFile = null;
  state.currentAmazonPath = null;
  state.csvUploaded = false;
  $("csvInput").value = "";
  $("fileState").textContent = "未選択";
  $("fileState").classList.remove("ok");
  $("fileNameText").textContent = "-";
  $("categoryText").textContent = "-";
  $("priceText").textContent = "-";
  $("fileSizeText").textContent = "-";
}

function resetRunAndArtifactsState() {
  state.latestRun = null;
  state.latestArtifacts = [];
  state.artifactsLoaded = false;
  state.workflowRunning = false;
  state.workflowDispatchTime = null;
  state.reviewAutoOpened = false;
  state.lastRunLogKey = "";
  state.completedRunId = null;
  state.previousRunId = null;
  stopRunPolling();
  $("runIdText").textContent = "-";
  $("runStatusText").textContent = "-";
  $("runConclusionText").textContent = "-";
  $("runCreatedText").textContent = "-";
  $("runLink").href = "#";
  $("artifactList").innerHTML = "";
}

function resetWork() {
  resetRunAndArtifactsState();
  updateWizard();
  log("今回の作業状態をリセットしました。Amazon CSV、PAT、マスターCSVは保持しています。");
}

async function deleteCurrentCsv() {
  const files = await listWorkingCsvFiles();
  if (!files.length) {
    log("input/working に削除対象のAmazon CSVがありません。", "error");
    resetAmazonCsvState();
    resetRunAndArtifactsState();
    updateWizard();
    setActiveView("upload");
    return;
  }
  for (const file of files) {
    await githubFetch(`/contents/${encodeURIComponentPath(file.path)}`, {
      method: "DELETE",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        message: `Clear Amazon CSV ${file.path}`,
        sha: file.sha,
        branch: CONFIG.branch
      })
    });
  }
  resetAmazonCsvState();
  resetRunAndArtifactsState();
  updateWizard();
  setActiveView("upload");
  log(`今回のCSVをクリアしました: ${files.map((file) => file.path).join(", ")}`);
}

async function listWorkingCsvFiles() {
  try {
    const data = await githubFetch(`/contents/${encodeURIComponentPath("input/working")}?ref=${encodeURIComponent(CONFIG.branch)}`);
    return (Array.isArray(data) ? data : [])
      .filter((item) => item.type === "file" && item.name.toLowerCase().endsWith(".csv"))
      .map((item) => ({path: item.path, sha: item.sha}));
  } catch (error) {
    if (String(error.message).includes("404")) return [];
    throw error;
  }
}

async function loadMaster() {
  const path = `input/${state.selectedMaster}`;
  log(`マスターCSVを取得中: ${path}`);
  const data = await githubFetch(`/contents/${encodeURIComponentPath(path)}?ref=${encodeURIComponent(CONFIG.branch)}`);
  state.masterSha = data.sha;
  const text = new TextDecoder("utf-8").decode(Uint8Array.from(atob(data.content.replace(/\s/g, "")), c => c.charCodeAt(0)));
  $("masterEditor").value = text;
  state.masterDirty = false;
  state.artifactsLoaded = false;
  state.workflowRunning = false;
  if (state.selectedMaster === "category_rules.csv") {
    state.categoryRulesLoaded = true;
    state.categoryRulesSaved = true;
    updateCategoryRulesState();
  }
  updateWizard();
  log(`マスターCSVを取得しました: ${path}`);
}

function textToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function saveMaster() {
  const path = `input/${state.selectedMaster}`;
  if (!state.masterSha) {
    throw new Error("保存前にマスターCSVを取得してください。");
  }
  const content = textToBase64($("masterEditor").value);
  const result = await githubFetch(`/contents/${encodeURIComponentPath(path)}`, {
    method: "PUT",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      message: `Update ${state.selectedMaster}`,
      content,
      sha: state.masterSha,
      branch: CONFIG.branch
    })
  });
  state.masterSha = result?.content?.sha || null;
  state.masterDirty = false;
  state.workflowRunning = false;
  if (state.selectedMaster === "category_rules.csv") {
    state.categoryRulesLoaded = true;
    state.categoryRulesSaved = true;
    updateCategoryRulesState();
  }
  updateWizard();
  log(`マスターCSVを更新しました: ${path}`);
  if (state.selectedMaster === "category_rules.csv") setActiveView("save");
}

async function runWorkflow() {
  if (!state.csvUploaded) {
    const message = "STEP1実行前に、Amazon CSVを選択してinput/workingへアップロードしてください。";
    alert(message);
    log(message, "error");
    return;
  }
  if (!state.categoryRulesLoaded || !state.categoryRulesSaved) {
    const message = "STEP1実行前に、category_rules.csvを取得し、対象カテゴリのAllow/Denyルールを確認・保存してください。";
    alert(message);
    log(message, "error");
    return;
  }
  log("STEP1 workflowを実行します。");
  await githubFetch(`/actions/workflows/${encodeURIComponent(CONFIG.workflow)}/dispatches`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ref: CONFIG.branch})
  });
  log("STEP1 workflow_dispatchを送信しました。完了まで自動で確認します。");
  state.artifactsLoaded = false;
  state.workflowRunning = true;
  state.workflowDispatchTime = Date.now();
  state.reviewAutoOpened = false;
  state.lastRunLogKey = "";
  state.completedRunId = null;
  state.previousRunId = state.latestRun?.id || null;
  setActiveView("run");
  startRunPolling();
  setTimeout(fetchLatestRun, 3000);
}

function startRunPolling() {
  stopRunPolling();
  state.runPollTimer = setInterval(() => {
    guard(() => fetchLatestRun({silent: true}));
  }, 7000);
}

function stopRunPolling() {
  if (!state.runPollTimer) return;
  clearInterval(state.runPollTimer);
  state.runPollTimer = null;
}

function renderRun(run) {
  state.latestRun = run;
  $("runIdText").textContent = run?.id || "-";
  $("runStatusText").textContent = translateRunStatus(run?.status, run?.conclusion);
  $("runConclusionText").textContent = translateRunConclusion(run?.conclusion);
  $("runCreatedText").textContent = run?.created_at ? new Date(run.created_at).toLocaleString("ja-JP") : "-";
  $("runLink").href = run?.html_url || "#";
  $("runLink").classList.toggle("attention-link", run?.status === "completed" && run?.conclusion === "failure");
  state.workflowRunning = Boolean(run && run.status !== "completed");
  updateWizard();
}

async function fetchLatestRun(options = {}) {
  if (!options.silent) log("管理者操作によりWorkflow状態を再確認しています。");
  const data = await githubFetch(`/actions/workflows/${encodeURIComponent(CONFIG.workflow)}/runs?branch=${encodeURIComponent(CONFIG.branch)}&per_page=10`);
  const run = selectWorkflowRun(data.workflow_runs);
  if (!run) {
    if (state.workflowDispatchTime) {
      if (!options.silent) log("新しいWorkflow Runの開始待ちです。");
      return;
    }
    log("Workflow Runが見つかりません。", "error");
    renderRun(null);
    return;
  }
  renderRun(run);
  if (run.status === "completed") {
    await handleCompletedRun(run);
    return;
  }
  const logKey = `${run.id}:${run.status}:${run.conclusion || "-"}`;
  const shouldLog = !options.silent || logKey !== state.lastRunLogKey;
  if (shouldLog) {
    log(`最新Runを取得しました: ${run.id} / ${translateRunStatus(run.status, run.conclusion)} / ${translateRunConclusion(run.conclusion)}`);
    state.lastRunLogKey = logKey;
  }
}

async function handleCompletedRun(run) {
  if (state.completedRunId === run.id) return;
  state.completedRunId = run.id;
  state.workflowRunning = false;
  state.workflowDispatchTime = null;
  stopRunPolling();

  if (run.conclusion === "success") {
    log(`STEP1成功を確認しました: Run ${run.id}`);
    await loadArtifacts({silent: true});
    state.reviewAutoOpened = true;
    setActiveView("review");
    log("Reviewへ移動しました。ダウンロード一覧を確認してください。");
    return;
  }

  if (run.conclusion === "failure") {
    log(`STEP1失敗を確認しました: Run ${run.id}`, "error");
    setActiveView("run");
    return;
  }

  log(`STEP1が完了しました: ${translateRunConclusion(run.conclusion)}`);
}

function artifactRank(name) {
  const order = ["01_SAFE_CSV", "02_CHECK_CSV", "03_OUT_DENY_CSV", "04_OUT_NG_CSV", "05_OUT_DUPLICATE_CSV", "06_OUT_PRICE_CSV"];
  const index = order.indexOf(name);
  return index === -1 ? 99 : index;
}

function isReviewArtifact(artifact) {
  return ["01_SAFE_CSV", "02_CHECK_CSV", "03_OUT_DENY_CSV", "04_OUT_NG_CSV", "05_OUT_DUPLICATE_CSV", "06_OUT_PRICE_CSV"].includes(artifact.name);
}

async function loadArtifacts(options = {}) {
  if (!state.latestRun) {
    await fetchLatestRun();
  }
  if (!state.latestRun) return;
  if (!options.silent) log(`Artifactsを取得中です: Run ${state.latestRun.id}`);
  const data = await githubFetch(`/actions/runs/${state.latestRun.id}/artifacts?per_page=100`);
  const artifacts = [...(data.artifacts || [])].filter(isReviewArtifact).sort((a, b) => artifactRank(a.name) - artifactRank(b.name));
  state.latestArtifacts = artifacts;
  renderArtifacts(artifacts);
  state.artifactsLoaded = true;
  updateWizard();
  log(`${artifacts.length}件のArtifactを取得しました。`);
}

function renderArtifacts(artifacts) {
  const container = $("artifactList");
  container.innerHTML = "";
  if (!artifacts.length) {
    container.textContent = "Review用Artifactsがまだ表示できません。STEP1成功後に自動表示されます。";
    return;
  }

  const rows = [
    {artifactName: "01_SAFE_CSV", label: "SAFE.csv", mode: "csv"},
    {artifactName: "02_CHECK_CSV", label: "CHECK.csv", mode: "csv"},
    {artifactName: "03_OUT_DENY_CSV", label: "OUT_DENY.csv", mode: "csv"}
  ];

  rows.forEach((row) => {
    const artifact = artifacts.find((item) => item.name === row.artifactName);
    container.appendChild(createArtifactRow({
      label: row.label,
      note: artifact ? `内部Artifact: ${artifact.name} / ${formatKb(artifact.size_in_bytes)}` : "未生成",
      disabled: !artifact || artifact.expired,
      onClick: () => downloadArtifactCsv(artifact, row.label)
    }));
  });

  const otherArtifacts = ["04_OUT_NG_CSV", "05_OUT_DUPLICATE_CSV", "06_OUT_PRICE_CSV"]
    .map((name) => artifacts.find((item) => item.name === name))
    .filter(Boolean);
  container.appendChild(createArtifactRow({
    label: "その他.zip",
    note: `OUT_NG / OUT_DUPLICATE / OUT_PRICE / ${formatKb(otherArtifacts.reduce((sum, artifact) => sum + artifact.size_in_bytes, 0))}`,
    disabled: !otherArtifacts.length || otherArtifacts.some((artifact) => artifact.expired),
    onClick: () => downloadOtherArtifactsZip(otherArtifacts)
  }));
}

function formatKb(bytes = 0) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function createArtifactRow({label, note, disabled, onClick}) {
  const item = document.createElement("div");
  item.className = "artifact-item";
  const meta = document.createElement("div");
  meta.innerHTML = `<strong>${label}</strong><span>${note}</span>`;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Download";
  button.disabled = disabled;
  button.addEventListener("click", onClick);
  item.append(meta, button);
  return item;
}

async function fetchArtifactBlob(artifact) {
  const token = getToken();
  const response = await fetch(artifact.archive_download_url, {
    headers: {
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Authorization": `Bearer ${token}`
    }
  });
  if (!response.ok) {
    throw new Error(`Artifactダウンロードに失敗しました: HTTP ${response.status}`);
  }
  return response.blob();
}

async function downloadArtifactCsv(artifact, fileName) {
  log(`CSVを準備中です: ${fileName}`);
  const zipBlob = await fetchArtifactBlob(artifact);
  const entries = await extractZipEntries(zipBlob);
  const csvEntry = entries.find((entry) => entry.name.toLowerCase().endsWith(".csv")) || entries[0];
  if (!csvEntry) throw new Error(`${artifact.name} の中にCSVが見つかりません。`);
  downloadBlob(csvEntry.blob, fileName);
  log(`CSVをダウンロードしました: ${fileName}`);
}

async function downloadOtherArtifactsZip(artifacts) {
  log("その他.zipを準備中です。");
  const files = [];
  for (const artifact of artifacts) {
    const zipBlob = await fetchArtifactBlob(artifact);
    const entries = await extractZipEntries(zipBlob);
    const csvEntry = entries.find((entry) => entry.name.toLowerCase().endsWith(".csv")) || entries[0];
    if (!csvEntry) continue;
    files.push({
      name: displayNameForOtherArtifact(artifact.name),
      blob: csvEntry.blob
    });
  }
  if (!files.length) throw new Error("その他.zipにまとめるCSVが見つかりません。");
  const zipBlob = await createStoredZip(files);
  downloadBlob(zipBlob, "その他.zip");
  log("その他.zipをダウンロードしました。");
}

function displayNameForOtherArtifact(name) {
  const names = {
    "04_OUT_NG_CSV": "OUT_NG.csv",
    "05_OUT_DUPLICATE_CSV": "OUT_DUPLICATE.csv",
    "06_OUT_PRICE_CSV": "OUT_PRICE.csv"
  };
  return names[name] || `${name}.csv`;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function extractZipEntries(zipBlob) {
  const buffer = await zipBlob.arrayBuffer();
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const entries = [];
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("ZIPの末尾情報が見つかりません。");

  const entryCount = view.getUint16(eocdOffset + 10, true);
  let centralOffset = view.getUint32(eocdOffset + 16, true);
  for (let i = 0; i < entryCount; i += 1) {
    if (view.getUint32(centralOffset, true) !== 0x02014b50) break;
    const method = view.getUint16(centralOffset + 10, true);
    const compressedSize = view.getUint32(centralOffset + 20, true);
    const fileNameLength = view.getUint16(centralOffset + 28, true);
    const extraLength = view.getUint16(centralOffset + 30, true);
    const commentLength = view.getUint16(centralOffset + 32, true);
    const localOffset = view.getUint32(centralOffset + 42, true);
    const nameBytes = bytes.slice(centralOffset + 46, centralOffset + 46 + fileNameLength);
    const name = new TextDecoder("utf-8").decode(nameBytes);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    if (!name.endsWith("/")) {
      entries.push({
        name,
        blob: await inflateZipData(compressed, method)
      });
    }
    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateZipData(bytes, method) {
  if (method === 0) return new Blob([bytes]);
  if (method !== 8) throw new Error(`未対応のZIP圧縮形式です: ${method}`);
  if (!("DecompressionStream" in window)) {
    throw new Error("このブラウザはArtifact ZIPの展開に対応していません。ChromeまたはEdgeで開いてください。");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).blob();
}

async function createStoredZip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(data);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const local = new DataView(localHeader.buffer);
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(10, dosTime(), true);
    local.setUint16(12, dosDate(), true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);
    chunks.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const dir = new DataView(centralHeader.buffer);
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(12, dosTime(), true);
    dir.setUint16(14, dosDate(), true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, data.length, true);
    dir.setUint32(24, data.length, true);
    dir.setUint16(28, nameBytes.length, true);
    dir.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    central.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralOffset = offset;
  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  const eocd = new Uint8Array(22);
  const end = new DataView(eocd.buffer);
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, centralOffset, true);
  return new Blob([...chunks, ...central, eocd], {type: "application/zip"});
}

function dosTime() {
  const now = new Date();
  return (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
}

function dosDate() {
  const now = new Date();
  return ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function bindEvents() {
  $("ownerText").textContent = CONFIG.owner;
  $("repoText").textContent = CONFIG.repo;
  $("branchText").textContent = CONFIG.branch;
  $("workflowText").textContent = CONFIG.workflow;

  $("saveTokenBtn").addEventListener("click", saveToken);
  $("clearTokenBtn").addEventListener("click", clearToken);
  $("uploadCsvBtn").addEventListener("click", () => guard(uploadCsv));
  $("deleteCsvBtn").addEventListener("click", () => guard(deleteCurrentCsv));
  $("loadMasterBtn").addEventListener("click", () => guard(loadMaster));
  $("saveMasterBtn").addEventListener("click", () => guard(saveMaster));
  $("saveMasterBtnMirror").addEventListener("click", () => guard(saveMaster));
  $("runWorkflowBtn").addEventListener("click", () => guard(runWorkflow));
  $("refreshRunBtn").addEventListener("click", () => guard(fetchLatestRun));
  $("clearLogBtn").addEventListener("click", () => $("messageLog").textContent = "");
  document.querySelectorAll(".flow-item").forEach((item) => {
    item.addEventListener("click", () => setActiveView(item.dataset.view));
  });
  document.querySelectorAll(".flow-jump").forEach((item) => {
    item.addEventListener("click", () => setActiveView(item.dataset.view));
  });
  $("masterEditor").addEventListener("input", () => {
    state.masterDirty = true;
    if (state.selectedMaster === "category_rules.csv") {
      state.categoryRulesSaved = false;
      state.workflowRunning = false;
      updateCategoryRulesState();
      updateWizard();
    }
  });

  $("csvInput").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) setSelectedFile(file);
  });

  const dropZone = $("dropZone");
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("dragover");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragover");
    const file = event.dataTransfer.files?.[0];
    if (file) {
      $("csvInput").files = event.dataTransfer.files;
      setSelectedFile(file);
    }
  });

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      state.selectedMaster = tab.dataset.master;
      state.masterSha = null;
      state.masterDirty = false;
      $("masterEditor").value = "";
      log(`編集対象を切り替えました: ${state.selectedMaster}`);
      setActiveView("rules");
      updateWizard();
    });
  });
}

async function guard(fn) {
  try {
    await fn();
  } catch (error) {
    log(error.message || String(error), "error");
  }
}

bindEvents();
loadToken();
updateCategoryRulesState();
setActiveView("upload");
updateWizard();
