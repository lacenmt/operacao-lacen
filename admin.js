
(() => {
  const cfg = window.APP_CONFIG || {};
  const ready =
    cfg.SUPABASE_URL &&
    !cfg.SUPABASE_URL.includes("COLE_AQUI") &&
    cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_ANON_KEY.includes("COLE_AQUI");

  const $ = id => document.getElementById(id);
  let db, channel, refreshTimer;
  let isRefreshing = false;

  const stationNames = {
    1: "Microscopia",
    2: "Pipetagem",
    3: "Biossegurança",
    4: "Gerenciamento de resíduos",
    5: "Missão, visão e valores",
    6: "Conhecimentos do LACEN",
    7: "Qualidade e controle"
  };

  const say = (id, message, kind = "") => {
    const element = $(id);
    if (!element) return;
    element.textContent = message;
    element.className = "message " + kind;
  };

  function showDashboard() {
    $("admin-login-panel")?.classList.add("hidden");
    $("dashboard")?.classList.remove("hidden");
  }

  function showLogin() {
    $("dashboard")?.classList.add("hidden");
    $("admin-login-panel")?.classList.remove("hidden");
  }

  function prepareRefreshControls() {
    if ($("admin-refresh-controls")) return;

    const dashboard = $("dashboard");
    if (!dashboard) return;

    const controls = document.createElement("div");
    controls.id = "admin-refresh-controls";
    controls.style.cssText =
      "display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:12px 0 18px;";

    const button = document.createElement("button");
    button.id = "admin-refresh";
    button.type = "button";
    button.textContent = "↻ ATUALIZAR DADOS";
    button.style.cssText =
      "cursor:pointer;padding:10px 16px;border:0;border-radius:8px;font-weight:700;";
    button.addEventListener("click", () => refresh());

    const updated = document.createElement("span");
    updated.id = "admin-last-updated";
    updated.textContent = "Aguardando atualização…";
    updated.style.cssText = "font-size:13px;opacity:.8;";

    controls.append(button, updated);

    const message = $("dashboard-message");
    if (message?.parentNode) {
      message.parentNode.insertBefore(controls, message);
    } else {
      dashboard.prepend(controls);
    }
  }

  function setLastUpdated() {
    const element = $("admin-last-updated");
    if (element) {
      element.textContent =
        "Última atualização: " +
        new Date().toLocaleTimeString("pt-BR");
    }
  }

  function setRefreshLoading(loading) {
    const button = $("admin-refresh");
    if (!button) return;
    button.disabled = loading;
    button.textContent = loading ? "ATUALIZANDO…" : "↻ ATUALIZAR DADOS";
    button.style.opacity = loading ? ".65" : "1";
  }

  async function isAdminAuthorized() {
    const { data, error } = await db.rpc("admin_is_allowed");
    return !error && data === true;
  }

  async function openDashboard() {
    if (!(await isAdminAuthorized())) {
      await db.auth.signOut();
      showLogin();
      say(
        "admin-login-message",
        "Este usuário não está autorizado como administrador. Inclua o UUID dele na tabela admins.",
        "error"
      );
      return false;
    }

    showDashboard();
    prepareRefreshControls();
    await refresh();

    if (channel) await db.removeChannel(channel);
    channel = db
      .channel("lacen-results")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "station_results" },
        () => refresh()
      )
      .subscribe();

    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => refresh(), 15000);
    return true;
  }

  async function refresh() {
    if (isRefreshing || !db) return;
    isRefreshing = true;
    setRefreshLoading(true);

    try {
      const [
        { data: teams, error: e1 },
        { data: stations, error: e2 },
        { data: results, error: e3 }
      ] = await Promise.all([
        db.from("teams").select("id,name").order("id"),
        db.from("stations").select("id,title").order("id"),
        db
          .from("station_results")
          .select("team_id,station_id,status,points,submitted_at")
          .order("submitted_at", { ascending: false })
      ]);

      const error = e1 || e2 || e3;
      if (error) {
        say("dashboard-message", error.message, "error");
        return;
      }

      const allTeams = teams || [];
      const allResults = results || [];

      const ranking = allTeams
        .map(team => {
          const mine = allResults.filter(result => result.team_id === team.id);
          return {
            id: team.id,
            name: team.name,
            count: mine.length,
            points: mine.reduce(
              (sum, result) => sum + Number(result.points || 0),
              0
            )
          };
        })
        .sort(
          (a, b) =>
            b.points - a.points || b.count - a.count || a.id - b.id
        );

      const rankingBody = $("ranking-body");
      if (rankingBody) {
        rankingBody.innerHTML = "";
        ranking.forEach((item, index) => {
          const row = document.createElement("tr");
          [
            index + 1,
            item.name,
            `${item.count}/7`,
            item.points
          ].forEach(value => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.append(cell);
          });
          rankingBody.append(row);
        });
      }

      const resultsBody = $("results-body");
      if (resultsBody) {
        resultsBody.innerHTML = "";
        allResults.forEach(result => {
          const row = document.createElement("tr");
          const values = [
            `Equipe ${result.team_id}`,
            `${String(result.station_id).padStart(2, "0")} · ${
              stationNames[result.station_id] || "Estação"
            }`,
            result.status === "completed" ? "Concluída" : "Não concluída",
            result.points,
            result.submitted_at
              ? new Date(result.submitted_at).toLocaleString("pt-BR")
              : "—"
          ];

          values.forEach(value => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.append(cell);
          });
          resultsBody.append(row);
        });
      }

      const completed = allResults.filter(
        result => result.status === "completed"
      ).length;
      const participants = new Set(
        allResults.map(result => result.team_id)
      ).size;

      const stats = $("stats");
      if (stats) {
        stats.innerHTML = "";
        [
          ["Registros", allResults.length],
          ["Estações concluídas", completed],
          ["Equipes participantes", participants]
        ].forEach(([label, value]) => {
          const card = document.createElement("div");
          card.className = "stat";

          const number = document.createElement("strong");
          number.textContent = value;

          const caption = document.createElement("span");
          caption.textContent = label;

          card.append(number, caption);
          stats.append(card);
        });
      }

      setLastUpdated();
      say("dashboard-message", "Dados atualizados.", "success");
    } catch (error) {
      say(
        "dashboard-message",
        error?.message || "Não foi possível atualizar os dados.",
        "error"
      );
    } finally {
      isRefreshing = false;
      setRefreshLoading(false);
    }
  }

  async function logout() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
    if (channel) {
      await db.removeChannel(channel);
      channel = null;
    }
    await db.auth.signOut();
    showLogin();
  }

  if (!ready || !window.supabase) {
    say(
      "admin-login-message",
      "Configure config.js com os dados do Supabase.",
      "error"
    );
    return;
  }

  db = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  const loginForm = $("admin-login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async event => {
      event.preventDefault();
      say("admin-login-message", "Autenticando…");

      const { error } = await db.auth.signInWithPassword({
        email: $("admin-email").value,
        password: $("admin-password").value
      });

      if (error) {
        say("admin-login-message", error.message, "error");
        return;
      }

      await openDashboard();
    });
  }

  $("admin-logout")?.addEventListener("click", logout);

  (async () => {
    const { data, error } = await db.auth.getSession();

    if (error || !data?.session) {
      showLogin();
      return;
    }

    await openDashboard();
  })();

  db.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || !session) {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
      if (channel) {
        db.removeChannel(channel);
        channel = null;
      }
      showLogin();
    }
  });
})();
