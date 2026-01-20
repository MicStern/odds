const API_BASE = "https://odds-api.micstern.workers.dev";

function $(id) { return document.getElementById(id); }

function show(viewId) {
  const views = ["view-loading", "view-create", "view-join", "view-admin", "view-locked"];
  for (const v of views) $(v).classList.add("hidden");
  $(viewId).classList.remove("hidden");
}

function setText(id, txt) { $(id).textContent = txt; }

function getParams() {
  const url = new URL(window.location.href);
  return {
    s: url.searchParams.get("s"),
    a: url.searchParams.get("a")
  };
}

function buildLink(sessionId, adminToken) {
  const base = new URL(window.location.href);
  base.search = "";
  base.searchParams.set("s", sessionId);

  const shareLink = base.toString();

  const adminUrl = new URL(window.location.href);
  adminUrl.search = "";
  adminUrl.searchParams.set("s", sessionId);
  adminUrl.searchParams.set("a", adminToken);

  return { shareLink, adminLink: adminUrl.toString() };
}

function toWhatsAppLink(label, link) {
  const msg = `${label}\n${link}`;
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

// ---------- Create ----------
async function handleCreateSubmit(ev) {
  ev.preventDefault();

  const maxX = Number($("maxX").value);
  const creatorPick = Number($("creatorPick").value);
  const challenge = $("challenge").value.trim();
  const report = $("report").value.trim();

  if (!Number.isInteger(maxX) || maxX < 1) {
    alert("Maximalzahl X muss eine ganze Zahl >= 1 sein.");
    return;
  }
  if (!Number.isInteger(creatorPick) || creatorPick < 1 || creatorPick > maxX) {
    alert(`Deine Zahl muss zwischen 1 und ${maxX} liegen.`);
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
      body: JSON.stringify({ maxX, challenge, report, creatorPick })
    });

    const links = buildLink(out.sessionId, out.adminToken);

    $("create-result").classList.remove("hidden");
    $("share-link").value = links.shareLink;
    $("admin-link").value = links.adminLink;

    $("whatsapp-link").href = toWhatsAppLink("Odds (Challenger-Link):", links.shareLink);

  } catch (e) {
    alert(`Fehler: ${e.message}`);
  } finally {
    $("create-btn").disabled = false;
  }
}

async function copyValue(inputId) {
  const el = $(inputId);
  el.select();
  el.setSelectionRange(0, el.value.length);
  await navigator.clipboard.writeText(el.value);
}

// ---------- Join ----------
async function loadSession(sessionId) {
  return await apiJson(`/api/session/${encodeURIComponent(sessionId)}`, { method: "GET" });
}

async function handlePickSubmit(ev, sessionId, maxX) {
  ev.preventDefault();

  const pick = Number($("pick").value);
  if (!Number.isInteger(pick) || pick < 1 || pick > maxX) {
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

    const msg =
      out.outcome === "challenger_lost"
        ? `Gespeichert. Deine Zahl war ${out.pick}. Ergebnis: Du hast verloren (gleiche Zahl).`
        : `Gespeichert. Deine Zahl war ${out.pick}. Ergebnis: Du hast gewonnen (nicht dieselbe Zahl).`;

    $("join-status").classList.remove("hidden");
    $("join-status").textContent = msg;

    $("submit-btn").disabled = true;
    $("pick").disabled = true;

  } catch (e) {
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

// ---------- Admin ----------
async function loadAdmin(sessionId, token) {
  const q = new URLSearchParams({ token }).toString();
  return await apiJson(`/api/admin/${encodeURIComponent(sessionId)}?${q}`, { method: "GET" });
}

async function handleRematchSubmit(ev, sessionId, token, maxX) {
  ev.preventDefault();

  const creatorPick = Number($("rematchCreatorPick").value);
  if (!Number.isInteger(creatorPick) || creatorPick < 1 || creatorPick > maxX) {
    alert(`Deine Zahl fürs Rückspiel muss zwischen 1 und ${maxX} liegen.`);
    return;
  }

  $("rematch-btn").disabled = true;
  $("rematch-result").classList.add("hidden");

  try {
    const out = await apiJson(`/api/session/${encodeURIComponent(sessionId)}/rematch`, {
      method: "POST",
      body: JSON.stringify({ token, creatorPick })
    });

    const links = buildLink(out.sessionId, out.adminToken);

    $("rematch-result").classList.remove("hidden");
    $("rematch-share-link").value = links.shareLink;
    $("rematch-whatsapp-link").href = toWhatsAppLink("Odds (Rückspiel - Challenger-Link):", links.shareLink);

  } catch (e) {
    alert(`Fehler: ${e.message}`);
  } finally {
    $("rematch-btn").disabled = false;
  }
}

// ---------- Init ----------
async function init() {
  $("create-form").addEventListener("submit", handleCreateSubmit);

  $("copy-share-btn").addEventListener("click", () => copyValue("share-link"));
  $("copy-admin-btn").addEventListener("click", () => copyValue("admin-link"));

  $("copy-rematch-share-btn").addEventListener("click", () => copyValue("rematch-share-link"));

  const { s: sessionId, a: adminToken } = getParams();

  if (!sessionId) {
    show("view-create");
    return;
  }

  show("view-loading");

  try {
    if (adminToken) {
      // Admin view
      const data = await loadAdmin(sessionId, adminToken);

      show("view-admin");
      setText("admin-challenge", data.challenge);
      setText("admin-report", data.report);

      const statusEl = $("admin-status");
      if (!data.locked) {
        statusEl.textContent = "Noch nicht ausgelöst. Warte auf Challenger.";
      } else {
        const outcomeText =
          data.outcome === "challenger_lost"
            ? "Challenger hat verloren (gleiche Zahl)."
            : "Challenger hat gewonnen (nicht dieselbe Zahl).";

        statusEl.textContent =
          `Ausgelöst.\nChallenger-Zahl: ${data.challengerPick}\nCreator-Zahl: ${data.creatorPick}\nErgebnis: ${outcomeText}`;
      }

      $("rematchCreatorPick").min = "1";
      $("rematchCreatorPick").max = String(data.maxX);

      $("rematch-form").addEventListener("submit", (ev) =>
        handleRematchSubmit(ev, sessionId, adminToken, data.maxX)
      );

      return;
    }

    // Challenger view
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
