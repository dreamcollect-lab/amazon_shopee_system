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
  categoryRulesLoaded: false,
  categoryRulesSaved: false,
  masterDirty: false,
  csvUploaded: false,
  artifactsLoaded: false,
  currentView: "upload",
  workflowRunning: false,
  runPollTimer: null,
  workflowDispatchTime: null,
  reviewAutoOpened: false
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

function translateRunStatus(status, conclusion = null) {
  if (status === "completed" && conclusion === "success") return "STEP1成功";
  if (status === "completed" && conclusion === "failure") return "STEP1失敗";
  if (status === "completed" && conclusion === "cancelled") return "キャンセル";
  if (status === "completed" && conclusion === "timed_out") return "タイムアウト";
  const labels = {
    queued: "待機中",
    requested: "要求済み",
    waiting: "待機中",
    pending: "待機中",
    in_progress: "STEP1実行中",
    completed: "完了"
  };
  return labels[status] || status || "-";
}

function translateRunConclusion(conclusion) {
  if (!conclusion) return "まだ完了していません";
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
  $("fileSizeText").textContent = `${file.size.toLocaleString()} bytes`;
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
  state.artifactsLoaded = false;
  state.workflowRunning = false;
  state.workflowDispatchTime = null;
  state.reviewAutoOpened = false;
  stopRunPolling();
  $("runIdText").textContent = "-";
  $("runStatusText").textContent = "-";
  $("runConclusionText").textContent = "-";
  $("runCreatedText").textContent = "-";
  $("runLink").href = "#";
  $("artifactList").innerHTML = "";
}

function resetWork() {
  resetAmazonCsvState();
  resetRunAndArtifactsState();
  updateWizard();
  setActiveView("upload");
  log("今回の作業をリセットしました。PATとマスターCSVの内容は保持しています。");
}

async function deleteCurrentCsv() {
  const path = state.currentAmazonPath || (state.selectedFile ? `input/working/${state.selectedFile.name}` : "");
  if (!path) {
    log("削除対象のAmazon CSVがありません。", "error");
    return;
  }
  const sha = await getContentSha(path);
  if (!sha) {
    log(`GitHub上に削除対象CSVが見つかりません: ${path}`, "error");
    resetAmazonCsvState();
    resetRunAndArtifactsState();
    updateWizard();
    return;
  }
  await githubFetch(`/contents/${encodeURIComponentPath(path)}`, {
    method: "DELETE",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      message: `Delete Amazon CSV ${path}`,
      sha,
      branch: CONFIG.branch
    })
  });
  resetAmazonCsvState();
  resetRunAndArtifactsState();
  updateWizard();
  setActiveView("upload");
  log(`Amazon CSVを削除しました: ${path}`);
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
  log("STEP1 workflow_dispatchを送信しました。数秒後に最新Runを取得してください。");
  state.artifactsLoaded = false;
  state.workflowRunning = true;
  state.workflowDispatchTime = Date.now();
  state.reviewAutoOpened = false;
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
  if (run?.status === "completed" && isRunAfterDispatch(run)) {
    state.workflowRunning = false;
    state.workflowDispatchTime = null;
    stopRunPolling();
    if (run.conclusion === "success" && !state.reviewAutoOpened) {
      state.reviewAutoOpened = true;
      setActiveView("review");
      log("STEP1成功を確認しました。Reviewへ移動しました。Artifacts取得を押してください。");
    }
  } else if (run) {
    state.workflowRunning = true;
  }
  updateWizard();
}

async function fetchLatestRun(options = {}) {
  if (!options.silent) log("最新Workflow Runを取得中です。");
  const data = await githubFetch(`/actions/workflows/${encodeURIComponent(CONFIG.workflow)}/runs?branch=${encodeURIComponent(CONFIG.branch)}&per_page=1`);
  const run = data.workflow_runs?.[0];
  if (!run) {
    log("Workflow Runが見つかりません。", "error");
    renderRun(null);
    return;
  }
  renderRun(run);
  log(`最新Runを取得しました: ${run.id} / ${translateRunStatus(run.status, run.conclusion)} / ${translateRunConclusion(run.conclusion)}`);
}

function artifactRank(name) {
  const order = ["01_SAFE_CSV", "02_CHECK_CSV", "03_OUT_DENY_CSV", "04_OUT_NG_CSV", "05_OUT_DUPLICATE_CSV", "06_OUT_PRICE_CSV", "99_ALL_RESULTS"];
  const index = order.indexOf(name);
  return index === -1 ? 99 : index;
}

async function loadArtifacts() {
  if (!state.latestRun) {
    await fetchLatestRun();
  }
  if (!state.latestRun) return;
  log(`Artifactsを取得中です: Run ${state.latestRun.id}`);
  const data = await githubFetch(`/actions/runs/${state.latestRun.id}/artifacts?per_page=100`);
  const artifacts = [...(data.artifacts || [])].sort((a, b) => artifactRank(a.name) - artifactRank(b.name));
  renderArtifacts(artifacts);
  state.artifactsLoaded = true;
  updateWizard();
  log(`${artifacts.length}件のArtifactを取得しました。`);
}

function renderArtifacts(artifacts) {
  const container = $("artifactList");
  container.innerHTML = "";
  if (!artifacts.length) {
    container.textContent = "Artifactsがありません。Run完了後に再取得してください。";
    return;
  }

  for (const artifact of artifacts) {
    const item = document.createElement("div");
    item.className = "artifact-item";
    const meta = document.createElement("div");
    meta.innerHTML = `<strong>${artifact.name}</strong><span>${artifact.size_in_bytes.toLocaleString()} bytes / ${artifact.expired ? "expired" : "available"}</span>`;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Download";
    button.disabled = artifact.expired;
    button.addEventListener("click", () => downloadArtifact(artifact));
    item.append(meta, button);
    container.appendChild(item);
  }
}

async function downloadArtifact(artifact) {
  const token = getToken();
  log(`Artifactをダウンロード中です: ${artifact.name}`);
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
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${artifact.name}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  log(`Artifactをダウンロードしました: ${artifact.name}`);
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
  $("resetWorkBtn").addEventListener("click", resetWork);
  $("loadMasterBtn").addEventListener("click", () => guard(loadMaster));
  $("saveMasterBtn").addEventListener("click", () => guard(saveMaster));
  $("saveMasterBtnMirror").addEventListener("click", () => guard(saveMaster));
  $("runWorkflowBtn").addEventListener("click", () => guard(runWorkflow));
  $("refreshRunBtn").addEventListener("click", () => guard(fetchLatestRun));
  $("loadArtifactsBtn").addEventListener("click", () => guard(loadArtifacts));
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
