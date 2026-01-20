// Set this after you deploy the Worker:
const API_BASE = "https://YOUR_WORKER_SUBDOMAIN.workers.dev";

function $(id) { return document.getElementById(id); }

function show(viewId) {
  const views = ["view-loading", "view-create", "view-join", "view-locked"];
  for (const v of views) $(v).classList.add("hidden");
  $(viewId).classList.remove("hidden");
}

function setText(id, txt) { $(id).textContent = txt; }

function getSessionIdFromUrl() {
  const url = new URL(window.location.href);
  return url.searchParams.get("s");
}

function buildShareLink(sessionId) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("s", sessionId);
  return url.toString();
}

function toWhatsAppLink(text, link) {
  const msg = `${text}\n${link}`;
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

async function apiJson(path, opts) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts && opts.headers ? opts.headers : {})
    }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data && data.error ? data.error : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// ---------- Create flow ----------
async function handleCreateSubmit(ev) {
  ev.preventDefault();

  const maxX = Number($("maxX").value);
  const challenge = $("challenge").value.trim();
  const report = $("report").value.trim();

  if (!Number.isFinite(maxX) || maxX < 1) {
    alert("Maximalzahl X muss >= 1 sein.");
    return;
  }
  if (!challenge || !report) {
    alert("Challenge und Spielbericht dürfen nicht leer sein.");
    return;
  }

  $("create-btn").disabled = true;

  try {
    const out = await apiJson("/api/create", {
      method: "POST",
      body: JSON.stringify({ maxX, challenge, report })
    });

    const share = buildShareLink(out.sessionId);

    $("create-result").classList.remove("hidden");
    $("share-link").value = share;

    $("whatsapp-link").href = toWhatsAppLink("Odds Session:", share);

  } catch (e) {
    alert(`Fehler: ${e.message}`);
  } finally {
    $("create-btn").disabled = false;
  }
}

// ---------- Join flow ----------
async function loadSession(sessionId) {
  const data = await apiJson(`/api/session/${encodeURIComponent(sessionId)}`, {
    method: "GET"
  });
  return data;
}

async function handlePickSubmit(ev, sessionId, maxX) {
  ev.preventDefault();

  const pick = Number($("pick").value);
  if (!Number.isFinite(pick) || pick < 1 || pick > maxX) {
    alert(`Zahl muss zwischen 1 und ${maxX} liegen.`);
    return;
  }

  $("submit-btn").disabled = true;
  $("join-status").classList.add("hidden");
  $("join-status").textContent = "";

  try {
    const out = await apiJson(`/api/session/${encodeURIComponent(sessionId)}/submit`, {
      method: "POST",
      body: JSON.stringify({ pick })
    });

    $("join-status").classList.remove("hidden");
    $("join-status").textContent = `Gespeichert. Deine Zahl war: ${out.pick}. Session ist jetzt gesperrt.`;
    $("submit-btn").disabled = true;
    $("pick").disabled = true;

  } catch (e) {
    // If session is locked, show locked view
    if (String(e.message).toLowerCase().includes("locked")) {
      show("view-locked");
      setText("locked-text", "Diese Session wurde bereits ausgelöst und ist gesperrt.");
    } else {
      $("join-status").classList.remove("hidden");
      $("join-status").textContent = `Fehler: ${e.message}`;
      $("submit-btn").disabled = false;
    }
  }
}

async function init() {
  $("create-form").addEventListener("submit", handleCreateSubmit);

  const sessionId = getSessionIdFromUrl();

  if (!sessionId) {
    show("view-create");
    return;
  }

  show("view-loading");

  try {
    const session = await loadSession(sessionId);

    if (session.locked) {
      show("view-locked");
      setText("locked-text", "Diese Session wurde bereits ausgelöst und ist gesperrt.");
      return;
    }

    show("view-join");

    setText("join-challenge", session.challenge);
    setText("join-report", session.report);
    setText("join-maxX", String(session.maxX));

    // Ensure input respects max
    $("pick").min = "1";
    $("pick").max = String(session.maxX);

    $("submit-form").addEventListener("submit", (ev) =>
      handlePickSubmit(ev, sessionId, session.maxX)
    );

  } catch (e) {
    show("view-locked");
    setText("locked-text", `Session nicht gefunden oder abgelaufen. (${e.message})`);
  }
}

init();
