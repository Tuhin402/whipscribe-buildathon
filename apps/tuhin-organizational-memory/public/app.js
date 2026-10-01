const state = {
  dashboard: null,
  meetings: new Map()
};

const $ = (selector) => document.querySelector(selector);

document.addEventListener("DOMContentLoaded", async () => {
  const config = await fetchJson("/api/config");
  $("#modeBadge").textContent = config.demoMode || !config.liveConfigured ? "DEMO MODE" : "LIVE API";
  $("#resetDemo").hidden = !config.demoMode;

  $("#fileInput").addEventListener("change", () => {
    const file = $("#fileInput").files?.[0];
    $("#fileName").textContent = file ? file.name : "Choose audio or video";
  });

  $("#uploadForm").addEventListener("submit", handleUpload);
  $("#resetDemo").addEventListener("click", resetDemo);
  $("#searchButton").addEventListener("click", runSearch);
  $("#searchInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") runSearch();
  });

  await loadDashboard();
});

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

  if (!items.length) {
    root.innerHTML = `<div class="empty">No decision drift detected yet.</div>`;
    return;
  }

  root.innerHTML = items.map((item) => {
    const previous = item.previous || map.get(item.previousDecisionId);
    const next = item.next || map.get(item.newDecisionId);

    return `
      <article class="drift-card">
        <div class="card-top">
          <div>
            <div class="card-kicker">Decision ${escapeHtml(item.type)}</div>
            <div class="card-title">${escapeHtml(previous?.title || "Decision")}</div>
          </div>
          <span class="status-pill superseded">Changed</span>
        </div>

        <div class="change-flow">
          <div class="decision-pill">
            <strong>Previous</strong>
            <span>${escapeHtml(previous?.decision || "Unknown")}</span>
          </div>
          <div class="arrow">→</div>
          <div class="decision-pill">
            <strong>Current</strong>
            <span>${escapeHtml(next?.decision || "Unknown")}</span>
          </div>
        </div>

        <p class="card-copy">${escapeHtml(item.explanation)}</p>

        <div class="evidence">
          <code>${escapeHtml((next?.evidence || item.evidence || ["—"])[0])}</code>
          <button onclick="openMeetingFromEvidence('${escapeHtmlAttr(next?.meetingId || previous?.meetingId || "")}', ${Number(next?.timestampStart || previous?.timestampStart || 0)})">
            Open evidence →
          </button>
        </div>
      </article>
    `;
  }).join("");
}

function renderPromises(items) {
  const root = $("#promiseList");
  if (!items.length) {
    root.innerHTML = `<div class="empty">No commitments have been extracted yet.</div>`;
    return;
  }

  root.innerHTML = items.map((p) => `
    <article class="promise-card">
      <div>
        <div class="promise-owner">${escapeHtml(p.owner)} → ${escapeHtml(p.recipient || "team")}</div>
        <div class="meeting-meta">${escapeHtml(p.dueDate ? `Due ${p.dueDate}` : "No due date recorded")}</div>
        <div class="meeting-summary">${escapeHtml(p.commitment)}</div>
        <div class="evidence">
          <code>${escapeHtml((p.evidence || ["—"])[0])}</code>
          ${p.completionEvidence?.length ? `<code>${escapeHtml(p.completionEvidence[0])}</code>` : ""}
        </div>
      </div>
      <span class="status-pill ${p.status === "completed" ? "completed" : "open"}">
        ${p.status === "completed" ? "Completed" : "Open"}
      </span>
    </article>
  `).join("");
}

function renderMeetings(meetings) {
  const root = $("#meetingList");
  if (!meetings.length) {
    root.innerHTML = `<div class="empty">No meetings yet.</div>`;
    return;
  }

  root.innerHTML = meetings.slice().reverse().map((m) => `
    <article class="meeting-card" onclick="openMeeting('${escapeHtmlAttr(m.id)}')">
      <div class="card-top">
        <div>
          <h3>${escapeHtml(m.title)}</h3>
          <div class="meeting-meta">${escapeHtml(formatDate(m.date))} · ${formatDuration(m.duration_seconds)} · ${escapeHtml(m.source)}</div>
        </div>
        <span class="status-pill completed">${escapeHtml(m.status || "done")}</span>
      </div>
      <p class="meeting-summary">${escapeHtml(m.summary || "Evidence available from the transcript.")}</p>
    </article>
  `).join("");
}

async function openMeeting(id) {
  const data = await fetchJson(`/api/meeting/${encodeURIComponent(id)}`);
  state.meetings.set(id, data);

  const text = data.meeting.transcript.slice(0, 7).map((s) => {
    return `${formatTime(s.start)} — ${s.speaker}: ${s.text}`;
  }).join("\n");

  const decisions = data.decisions.map((d) =>
    `${d.title}: ${d.decision} @ ${formatTime(d.timestampStart)}`
  ).join("\n");

  const promises = data.promises.map((p) =>
    `${p.owner} → ${p.commitment} (${p.status})`
  ).join("\n");

  const block = document.createElement("div");
  block.className = "modal-backdrop";
  block.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="Meeting evidence">
      <button class="modal-close" aria-label="Close">×</button>
      <p class="eyebrow">MEETING EVIDENCE</p>
      <h2>${escapeHtml(data.meeting.title)}</h2>
      <p class="modal-meta">${escapeHtml(formatDate(data.meeting.date))} · ${formatDuration(data.meeting.duration_seconds)}</p>

      <div class="modal-section">
        <div class="modal-label">DECISIONS</div>
        <pre>${escapeHtml(decisions || "No decisions extracted.")}</pre>
      </div>

      <div class="modal-section">
        <div class="modal-label">PROMISES</div>
        <pre>${escapeHtml(promises || "No commitments extracted.")}</pre>
      </div>

      <div class="modal-section">
        <div class="modal-label">TRANSCRIPT EVIDENCE</div>
        <pre>${escapeHtml(text || "No transcript segments available.")}</pre>
      </div>
    </div>
  `;

  document.body.appendChild(block);
  injectModalStyles();

  block.querySelector(".modal-close").addEventListener("click", () => block.remove());
  block.addEventListener("click", (event) => {
    if (event.target === block) block.remove();
  });
}

window.openMeeting = openMeeting;
window.openMeetingFromEvidence = (meetingId, seconds) => {
  openMeeting(meetingId).then(() => {
    showToast(`Evidence timestamp: ${formatTime(seconds)}`);
  });
};

async function handleUpload(event) {
  event.preventDefault();
  const file = $("#fileInput").files?.[0];
  if (!file) return;

  const status = $("#uploadStatus");
  status.hidden = false;
  status.className = "status-card";
  status.innerHTML = `<strong>Processing ${escapeHtml(file.name)}</strong><br>Preparing the WhipScribe transcription job…`;

  const form = new FormData();
  form.append("file", file);
  form.append("diarize", "true");
  form.append("word_timestamps", "true");

  try {
    const response = await fetch("/api/transcribe", {
      method: "POST",
      body: form
    });
    const body = await response.json();

    if (!response.ok) {
      status.className = "status-card error";
      status.innerHTML = `<strong>${escapeHtml(body.error || "Transcription unavailable")}</strong><br>${escapeHtml(body.message || "See the README for the current API configuration.")}`;
      return;
    }

    status.innerHTML = `<strong>Memory created.</strong><br>${body.decisions.length} decisions, ${body.promises.length} commitments, ${body.drift.length} drift events.`;
    await loadDashboard();
  } catch (error) {
    status.className = "status-card error";
    status.innerHTML = `<strong>Request failed.</strong><br>${escapeHtml(error.message)}`;
  }
}

async function resetDemo() {
  await fetchJson("/api/demo/reset", { method: "POST" });
  await loadDashboard();
  showToast("Demo memory reset.");
}

async function runSearch() {
  const q = $("#searchInput").value.trim();
  if (!q) return;

  const result = await fetchJson("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q })
  });

  const root = $("#searchResults");
  root.hidden = false;

  const items = result.local || [];
  if (!items.length) {
    root.innerHTML = `<div class="empty">No local evidence matched “${escapeHtml(q)}”.</div>`;
    return;
  }

  root.innerHTML = items.map((item) => `
    <article class="search-card">
      <strong>${escapeHtml(item.meetingTitle)}</strong>
      <p>${escapeHtml(item.speaker)} · ${formatTime(item.start)}</p>
      <p>${escapeHtml(item.text)}</p>
      <div class="evidence"><code>${escapeHtml(item.evidence)}</code></div>
    </article>
  `).join("");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || body.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric"
    });
  } catch {
    return value;
  }
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const secs = String(total % 60).padStart(2, "0");
  return `${minutes}:${secs}`;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeHtmlAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

function injectModalStyles() {
  if ($("#modalStyles")) return;
  const style = document.createElement("style");
  style.id = "modalStyles";
  style.textContent = `
    .modal-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:20px;background:rgba(13,24,18,.44)}
    .modal{position:relative;width:min(920px,94vw);max-height:88vh;overflow:auto;padding:25px;border-radius:20px;background:#fff;border:1px solid #dfe5e1;box-shadow:0 28px 80px rgba(0,0,0,.2)}
    .modal h2{margin:0;font-size:30px;letter-spacing:-.035em}
    .modal-meta{margin:5px 0 0;color:#667168}
    .modal-close{position:absolute;top:14px;right:14px;width:36px;height:36px;border:1px solid #e1e6e2;border-radius:50%;background:#fff;font-size:24px;line-height:1}
    .modal-section{margin-top:20px;padding-top:16px;border-top:1px solid #e5e9e6}
    .modal-label{font-size:11px;font-weight:850;color:#176b47;letter-spacing:.12em}
    .modal pre{margin:9px 0 0;padding:13px;border-radius:11px;background:#f7f9f7;color:#4e5b52;font:12px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap}
  `;
  document.head.appendChild(style);
}
