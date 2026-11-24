
(() => {
  const cfg = window.APP_CONFIG || {};
  const ready = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("COLE_AQUI") &&
    cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes("COLE_AQUI");

  const $ = id => document.getElementById(id);
  const loginPanel = $("login-panel");
  const teamPanel = $("team-panel");

  let db;
  let sessionToken = null;
  let currentTeam = null;
  let hintsRefreshTimer = null;

  function message(id, text, kind = "") {
    const el = $(id);
    el.textContent = text;
    el.className = "message " + kind;
  }

  function stationName(id) {
    return ({
      1: "Estação 01",
      2: "Estação 02",
      3: "Estação 03",
      4: "Estação 04",
      5: "Estação 05",
      6: "Estação 06",
      7: "Estação 07"
    })[id] || `Estação ${id}`;
  }

  function showTeam() {
    loginPanel.classList.add("hidden");
    teamPanel.classList.remove("hidden");

    $("team-title").textContent = `Equipe ${currentTeam}`;

    loadProgress();
    loadHints();

    if (hintsRefreshTimer) {
      clearInterval(hintsRefreshTimer);
    }

    hintsRefreshTimer = setInterval(loadHints, 2000);
  }

  async function loadProgress() {
    const { data, error } = await db.rpc(
      "team_get_progress",
      { p_session_token: sessionToken }
    );

    if (error) {
      message("code-message", error.message, "error");
      return;
    }

    const list = $("team-progress");
    list.innerHTML = "";

    const rows = data || [];

    $("progress-count").textContent = `${rows.length} de 7`;

    for (let i = 1; i <= 7; i++) {
      const result = rows.find(
        r => Number(r.station_id) === i
      );

      const item = document.createElement("div");
      item.className = "progress-item";

      const left = document.createElement("div");

      const title = document.createElement("strong");
      title.textContent =
        `${String(i).padStart(2, "0")} · ${stationName(i)}`;

      const sub = document.createElement("small");

      sub.textContent = result
        ? (
            result.status === "completed"
              ? "Estação concluída"
              : "Estação registrada como não concluída"
          )
        : "Aguardando código";

      left.append(title, sub);

      const badge = document.createElement("span");

      badge.className = "status " + (
        result
          ? (result.status === "completed" ? "ok" : "pending")
          : ""
      );

      badge.textContent = result
        ? `${result.points} pts`
        : "Pendente";

      item.append(left, badge);
      list.append(item);
    }
  }

  async function loadHints() {
    if (!sessionToken) return;

    const { data, error } = await db.rpc(
      "team_get_hints",
      { p_session_token: sessionToken }
    );

    if (error) {
      message(
        "hints-message",
        "Não foi possível carregar as dicas: " + error.message,
        "error"
      );
      return;
    }

    const rows = data || [];

    const usedCount = rows.filter(
      r => r.used === true
    ).length;

    $("hints-count").textContent =
      `${usedCount} de 2 utilizadas`;

    const list = $("team-hints");
    list.innerHTML = "";

    for (let i = 1; i <= 2; i++) {
      const result = rows.find(
        r => Number(r.hint_number) === i
      );

      const used = !!(result && result.used);

      const item = document.createElement("div");
      item.className = "progress-item";

      const left = document.createElement("div");

      const title = document.createElement("strong");
      title.textContent = `Dica ${i}`;

      const sub = document.createElement("small");

      sub.textContent = used
        ? (
            result.used_at
              ? `Utilizada em ${new Date(result.used_at).toLocaleString("pt-BR")}`
              : "Dica utilizada"
          )
        : "Ainda disponível";

      left.append(title, sub);

      const badge = document.createElement("span");

      badge.className = "status " + (
        used ? "ok" : "pending"
      );

      badge.textContent = used
        ? "Utilizada"
        : "Disponível";

      item.append(left, badge);
      list.append(item);
    }

    message(
      "hints-message",
      "Atualização automática a cada 15 segundos.",
      "success"
    );
  }

  if (!ready || !window.supabase) {
    message(
      "login-message",
      "Configure a URL e a chave anon no arquivo config.js antes de usar o sistema.",
      "error"
    );
    return;
  }

  db = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY
  );

  $("login-form").addEventListener("submit", async e => {
    e.preventDefault();

    message("login-message", "Verificando acesso…");

    const team = Number($("team-number").value);
    const pin = $("team-pin").value.trim();

    const { data, error } = await db.rpc(
      "team_login",
      {
        p_team_id: team,
        p_pin: pin
      }
    );

    if (error || !data) {
      message(
        "login-message",
        error?.message || "Equipe ou senha inválida.",
        "error"
      );
      return;
    }

    currentTeam = team;
    sessionToken = data;

    showTeam();
  });

  $("code-form").addEventListener("submit", async e => {
    e.preventDefault();

    const code = $("station-code").value
      .trim()
      .toUpperCase();

    message("code-message", "Validando código…");

    const { data, error } = await db.rpc(
      "team_submit_code",
      {
        p_session_token: sessionToken,
        p_code: code
      }
    );

    if (error) {
      message("code-message", error.message, "error");
      return;
    }

    if (!data || data.ok !== true) {
      message(
        "code-message",
        data?.message || "Não foi possível validar o código.",
        "error"
      );
      return;
    }

    message(
      "code-message",
      `${stationName(data.station_id)} registrada: ${
        data.status === "completed"
          ? "concluída"
          : "não concluída"
      } · ${data.points} pontos.`,
      "success"
    );

    $("station-code").value = "";

    await loadProgress();
  });

  $("logout-button").addEventListener("click", () => {
    if (hintsRefreshTimer) {
      clearInterval(hintsRefreshTimer);
    }

    hintsRefreshTimer = null;
    sessionToken = null;
    currentTeam = null;

    teamPanel.classList.add("hidden");
    loginPanel.classList.remove("hidden");

    $("team-pin").value = "";

    message("login-message", "Acesso encerrado.");
  });

})();
