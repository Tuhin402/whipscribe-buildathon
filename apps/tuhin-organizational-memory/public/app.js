const state = { config: null, dashboard: null, workflowTimers: new Map() };
const $ = (selector) => document.querySelector(selector);

window.addEventListener("DOMContentLoaded", boot);

async function boot() {
  try {
    state.config = await fetchJson("/api/config");
    applyConfig(state.config);
    bindEvents();
    await refreshAll();
  } catch (error) {
    showToast(`Startup failed: ${error.message}`);
  }
}

function bindEvents() {
  $("#fileInput").addEventListener("change", () => {
    const file = $("#fileInput").files?.[0];
    $("#fileName").textContent = file ? file.name : "Choose audio or video";
  });
  $("#uploadForm").addEventListener("submit", handleUpload);
  $("#urlForm").addEventListener("submit", handleUrlSubmit);
  $("#resetDemo").addEventListener("click", resetDemo);
  $("#refreshButton").addEventListener("click", refreshAll);
  $("#jobsRefresh").addEventListener("click", loadWorkflows);
  $("#providerRefresh").addEventListener("click", loadProvider);
  $("#searchButton").addEventListener("click", runSearch);
  $("#searchInput").addEventListener("keydown", (event) => { if (event.key === "Enter") runSearch(); });
  document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.tab)));
}

function applyConfig(config) {
  $("#modeBadge").textContent = config.demoMode || !config.liveConfigured ? "DEMO MODE" : "LIVE API";
  $("#resetDemo").hidden = !config.demoMode;
}

async function refreshAll() {
  await Promise.all([loadDashboard(), loadProvider(), loadWorkflows()]);
}

async function loadDashboard() {
  state.dashboard = await fetchJson("/api/dashboard");
  renderMetrics(state.dashboard.stats);
  renderDrift(state.dashboard.data.drift, state.dashboard.data.decisions);
  renderPromises(state.dashboard.data.promises);
  renderMeetings(state.dashboard.data.meetings);
}

function renderMetrics(stats) {
  $("#metricMeetings").textContent = stats.meetings;
  $("#metricDecisions").textContent = stats.decisions;
  $("#metricDrift").textContent = stats.drift;
  $("#metricPromises").textContent = stats.openPromises;
}

function renderDrift(items, decisions) {
  const map = new Map(decisions.map((d) => [d.id, d]));
  const root = $("#driftList");
  if (!items.length) { root.innerHTML = `<div class="empty">No decision drift detected yet.</div>`; return; }
  root.innerHTML = items.map((item) => {
    const previous = item.previous || map.get(item.previousDecisionId);
    const next = item.next || map.get(item.newDecisionId);
    const evidenceMeeting = next?.meetingId || previous?.meetingId || "";
    const evidenceTime = next?.timestampStart ?? previous?.timestampStart ?? 0;
    return `<article class="drift-card"><div class="card-top"><div><div class="card-kicker">Decision ${escapeHtml(item.type)}</div><div class="card-title">${escapeHtml(previous?.title || "Decision")}</div></div><span class="status-pill superseded">Changed</span></div><div class="change-flow"><div class="decision-pill"><strong>Previous</strong><span>${escapeHtml(previous?.decision || "Unknown")}</span></div><div class="arrow">→</div><div class="decision-pill"><strong>Current</strong><span>${escapeHtml(next?.decision || "Unknown")}</span></div></div><p class="card-copy">${escapeHtml(item.explanation)}</p><div class="evidence"><code>${escapeHtml((next?.evidence || item.evidence || ["—"])[0])}</code><button data-open-meeting="${escapeHtmlAttr(evidenceMeeting)}" data-time="${Number(evidenceTime)}">Open evidence →</button></div></article>`;
  }).join("");
}

function renderPromises(items) {
  const root = $("#promiseList");
  if (!items.length) { root.innerHTML = `<div class="empty">No commitments have been extracted yet.</div>`; return; }
  root.innerHTML = items.map((p) => `<article class="promise-card"><div><div class="promise-owner">${escapeHtml(p.owner)} → ${escapeHtml(p.recipient || "team")}</div><div class="meeting-meta">${escapeHtml(p.dueDate ? `Due ${p.dueDate}` : "No due date recorded")}</div><div class="meeting-summary">${escapeHtml(p.commitment)}</div><div class="evidence"><code>${escapeHtml((p.evidence || ["—"])[0])}</code>${p.completionEvidence?.length ? `<code>${escapeHtml(p.completionEvidence[0])}</code>` : ""}</div></div><span class="status-pill ${p.status === "completed" ? "completed" : "open"}">${p.status === "completed" ? "Completed" : "Open"}</span></article>`).join("");
}

function renderMeetings(meetings) {
  const root = $("#meetingList");
  if (!meetings.length) { root.innerHTML = `<div class="empty">No meetings yet.</div>`; return; }
  root.innerHTML = meetings.slice().reverse().map((meeting) => `<article class="meeting-card" data-meeting-id="${escapeHtmlAttr(meeting.id)}"><div class="card-top"><div><h3>${escapeHtml(meeting.title)}</h3><div class="meeting-meta">${escapeHtml(formatDate(meeting.date))} · ${formatDuration(meeting.duration_seconds)} · ${escapeHtml(meeting.source)}</div></div><span class="status-pill completed">${escapeHtml(meeting.status || "done")}</span></div><p class="meeting-summary">${escapeHtml(meeting.summary || "Evidence available from the transcript.")}</p></article>`).join("");
  root.querySelectorAll(".meeting-card").forEach((card) => card.addEventListener("click", () => openMeeting(card.dataset.meetingId)));
}

async function openMeeting(id) {
  const data = await fetchJson(`/api/meeting/${encodeURIComponent(id)}`);
  const block = document.createElement("div");
  block.className = "modal-backdrop";
  block.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Meeting evidence"><button class="modal-close" aria-label="Close">×</button><p class="eyebrow">MEETING EVIDENCE</p><h2>${escapeHtml(data.meeting.title)}</h2><p class="modal-meta">${escapeHtml(formatDate(data.meeting.date))} · ${formatDuration(data.meeting.duration_seconds)} · ${escapeHtml(data.meeting.source)}</p><div id="audioBox" class="audio-box"><span class="clip-note">Loading playback availability…</span></div><div class="modal-section"><div class="modal-label">DECISIONS</div><pre>${escapeHtml(data.decisions.length ? data.decisions.map((d) => `${d.title}: ${d.decision} @ ${formatTime(d.timestampStart)} · confidence ${Math.round((d.confidence || 0) * 100)}%`).join("\n") : "No decisions extracted.")}</pre></div><div class="modal-section"><div class="modal-label">PROMISES</div><pre>${escapeHtml(data.promises.length ? data.promises.map((p) => `${p.owner} → ${p.commitment} (${p.status})`).join("\n") : "No commitments extracted.")}</pre></div><div class="modal-section"><div class="modal-label">CLIP DISCOVERY</div><p class="clip-note">Ask WhipScribe for high-signal sentences. In Demo Mode the candidates come from the local seed.</p><div class="clip-actions"><button id="findHooks" class="ghost-btn">Find hooks</button><button id="findQuestions" class="ghost-btn">Find questions</button></div><div id="momentList" class="moment-list"></div></div><div class="modal-section"><div class="modal-label">TRANSCRIPT EVIDENCE</div><pre>${escapeHtml((data.meeting.transcript || []).map((s) => `${formatTime(s.start)} — ${s.speaker}: ${s.text}`).join("\n") || "No transcript segments available.")}</pre></div></div>`;
  document.body.appendChild(block);
  block.querySelector(".modal-close").addEventListener("click", () => block.remove());
  block.addEventListener("click", (event) => { if (event.target === block) block.remove(); });
  await loadAudio(block, id);
  block.querySelector("#findHooks").addEventListener("click", () => loadMoments(block, id, "hook"));
  block.querySelector("#findQuestions").addEventListener("click", () => loadMoments(block, id, "question"));
}

async function loadAudio(block, id) {
  const box = block.querySelector("#audioBox");
  if (state.config.demoMode || state.config.liveConfigured === false) { box.innerHTML = `<span class="clip-note">Playback is available only for live WhipScribe jobs.</span>`; return; }
  try {
    const audio = await fetchJson(`/api/meeting/${encodeURIComponent(id)}/audio-url`);
    box.innerHTML = `<audio controls preload="none" src="${escapeHtmlAttr(audio.url)}"></audio><div class="clip-note">Playback URL expires after a short window; reopen the evidence to refresh it.</div>`;
  } catch (error) {
    box.innerHTML = `<span class="clip-note">Playback unavailable: ${escapeHtml(error.message)}</span>`;
  }
}

async function loadMoments(block, id, kind) {
  const root = block.querySelector("#momentList");
  root.innerHTML = `<div class="empty">Looking for ${escapeHtml(kind)} moments…</div>`;
  try {
    const data = await fetchJson(`/api/meeting/${encodeURIComponent(id)}/moments?kind=${encodeURIComponent(kind)}&limit=8`);
    const sentences = data.sentences || data.matches || [];
    if (!sentences.length) { root.innerHTML = `<div class="empty">No moments returned.</div>`; return; }
    root.innerHTML = sentences.map((item) => `<div class="moment-row"><strong>${formatTime(item.start_s ?? item.start ?? 0)}</strong><p>${escapeHtml(item.text)}</p><button class="tiny-btn" data-clip-start="${Number(item.start_s ?? item.start ?? 0)}" data-clip-end="${Number(item.end_s ?? item.end ?? ((item.start_s ?? item.start ?? 0) + 20))}">Make clip</button></div>`).join("");
    root.querySelectorAll("[data-clip-start]").forEach((button) => button.addEventListener("click", () => createClip(id, button.dataset.clipStart, button.dataset.clipEnd, root)));
  } catch (error) {
    root.innerHTML = `<div class="empty">${escapeHtml(error.message)}${error.status === 409 ? `<br>Try again in a few seconds while WhipScribe prepares the clip index.` : ""}</div>`;
  }
}

async function createClip(meetingId, startS, endS, root) {
  try {
    const response = await fetchJson(`/api/meeting/${encodeURIComponent(meetingId)}/clip`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startS: Number(startS), endS: Math.max(Number(startS) + 3, Number(endS)), title: "DecisionTrace evidence", captionStyle: "rounded-white" }) });
    root.insertAdjacentHTML("afterbegin", `<div class="status-card">Clip job <strong>${escapeHtml(response.clip_id || "submitted")}</strong> is rendering. Refresh its status from the provider when the workflow finishes.</div>`);
  } catch (error) {
    root.insertAdjacentHTML("afterbegin", `<div class="status-card error">${escapeHtml(error.message)}</div>`);
  }
}

async function handleUpload(event) {
  event.preventDefault();
  const file = $("#fileInput").files?.[0];
  if (!file) return;
  const status = $("#uploadStatus");
  setStatus(status, false, `<strong>Submitting ${escapeHtml(file.name)}</strong><br>Creating a tracked workflow…`);
  const form = new FormData();
  form.append("file", file); form.append("diarize", "true"); form.append("word_timestamps", "true");
  try {
    const body = await fetchJson("/api/transcribe", { method: "POST", body: form });
    setStatus(status, false, `<strong>Workflow queued.</strong><br>Tracking ${escapeHtml(body.workflow)}. You can keep using the page while transcription runs.`);
    pollWorkflow(body.workflow, status);
  } catch (error) { setStatus(status, true, `<strong>${escapeHtml(error.code || "TRANSCRIPTION_UNAVAILABLE")}</strong><br>${escapeHtml(error.message)}`); }
}

async function handleUrlSubmit(event) {
  event.preventDefault();
  const url = $("#urlInput").value.trim();
  if (!url) return;
  const status = $("#uploadStatus");
  setStatus(status, false, `<strong>Submitting URL</strong><br>WhipScribe will fetch the media and create a tracked workflow.`);
  try {
    const body = await fetchJson("/api/transcribe-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
    setStatus(status, false, `<strong>Workflow queued.</strong><br>Tracking ${escapeHtml(body.workflow)}.`);
    pollWorkflow(body.workflow, status);
  } catch (error) { setStatus(status, true, `<strong>${escapeHtml(error.code || "TRANSCRIPTION_UNAVAILABLE")}</strong><br>${escapeHtml(error.message)}`); }
}

function pollWorkflow(id, statusElement) {
  if (state.workflowTimers.has(id)) clearInterval(state.workflowTimers.get(id));
  const timer = setInterval(async () => {
    try {
      const result = await fetchJson(`/api/workflows/${encodeURIComponent(id)}`);
      const item = result.item;
      const progress = Math.round((item.progress || 0) * 100);
      setStatus(statusElement, item.status === "failed" || item.status === "locked", `<strong>${escapeHtml(item.message)}</strong><br>Workflow ${escapeHtml(id)} · ${progress}%`);
      await loadWorkflows();
      if (["done", "failed", "locked", "no_speech"].includes(item.status)) {
        clearInterval(timer); state.workflowTimers.delete(id);
        await loadDashboard();
        if (item.status === "done" && item.meetingId) showToast("Decision memory created.");
      }
    } catch (error) { setStatus(statusElement, true, `<strong>Workflow status error</strong><br>${escapeHtml(error.message)}`); clearInterval(timer); }
  }, 2000);
  state.workflowTimers.set(id, timer);
}

async function loadWorkflows() {
  try {
    const data = await fetchJson("/api/workflows?limit=8");
    const root = $("#workflowList");
    if (!data.items.length) { root.innerHTML = `<div class="empty">No workflows yet.</div>`; return; }
    root.innerHTML = data.items.map((item) => `<div class="workflow-row"><div><strong>${escapeHtml(item.filename || item.sourceUrl || item.kind)}</strong><small>${escapeHtml(item.message || item.status)} · ${escapeHtml(formatDate(item.updatedAt || item.createdAt))}</small><div class="progress"><i style="width:${Math.round((item.progress || 0) * 100)}%"></i></div></div><span class="status-pill ${item.status === "done" ? "completed" : item.status === "failed" || item.status === "locked" ? "superseded" : "open"}">${escapeHtml(item.status)}</span></div>`).join("");
  } catch (error) { $("#workflowList").innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`; }
}

async function loadProvider() {
  const root = $("#providerStatus");
  if (state.config.demoMode || !state.config.liveConfigured) { root.innerHTML = `<strong>Demo / offline mode.</strong><br>No API key is configured. Seeded evidence and local workflows remain reviewable.`; return; }
  try {
    const data = await fetchJson("/api/provider/me");
    const me = data.me;
    root.innerHTML = `<strong>${escapeHtml(me.tier || "unknown")} tier</strong><br>${escapeHtml(me.email || "No email reported")} · ${escapeHtml(String(me.retentionDays ?? "—"))} day audio retention`;
  } catch (error) { root.innerHTML = `<strong>Provider check failed.</strong><br>${escapeHtml(error.message)}`; }
}

async function resetDemo() { await fetchJson("/api/demo/reset", { method: "POST" }); await refreshAll(); showToast("Demo memory reset."); }
async function runSearch() { const q = $("#searchInput").value.trim(); if (!q) return; const result = await fetchJson("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q }) }); const root = $("#searchResults"); root.hidden = false; if (!result.local.length) { root.innerHTML = `<div class="empty">No local evidence matched “${escapeHtml(q)}”.</div>`; return; } root.innerHTML = result.local.map((item) => `<article class="search-card"><strong>${escapeHtml(item.meetingTitle)}</strong><p>${escapeHtml(item.speaker)} · ${formatTime(item.start)}</p><p>${escapeHtml(item.text)}</p><div class="evidence"><code>${escapeHtml(item.evidence)}</code><button data-open-meeting="${escapeHtmlAttr(item.meetingId)}" data-time="${Number(item.start)}">Open meeting →</button></div></article>`).join(""); }

document.addEventListener("click", (event) => { const button = event.target.closest("[data-open-meeting]"); if (button) openMeeting(button.dataset.openMeeting); });

function switchTab(tab) { document.querySelectorAll(".tab").forEach((button) => { const active = button.dataset.tab === tab; button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active)); }); $("#uploadForm").hidden = tab !== "file"; $("#urlForm").hidden = tab !== "url"; }
function setStatus(element, error, html) { element.hidden = false; element.className = `status-card${error ? " error" : ""}`; element.innerHTML = html; }
async function fetchJson(url, options = {}) { const response = await fetch(url, options); const body = await response.json().catch(() => ({})); if (!response.ok) { const error = new Error(body.message || body.error || `HTTP ${response.status}`); error.status = response.status; error.code = body.error; throw error; } return body; }
function formatDate(value) { try { return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); } catch { return value; } }
function formatTime(seconds) { const total = Math.max(0, Math.floor(Number(seconds) || 0)); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`; }
function formatDuration(seconds) { const total = Math.max(0, Math.floor(Number(seconds) || 0)); const hours = Math.floor(total / 3600); const minutes = Math.floor((total % 3600) / 60); return hours ? `${hours}h ${minutes}m` : `${minutes}m`; }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function escapeHtmlAttr(value) { return escapeHtml(value).replaceAll("`", "&#096;"); }
function showToast(message) { const toast = $("#toast"); toast.textContent = message; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 2400); }
