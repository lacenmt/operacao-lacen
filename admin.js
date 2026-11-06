
(() => {
  const cfg = window.APP_CONFIG || {};

  const ready =
    cfg.SUPABASE_URL &&
    !cfg.SUPABASE_URL.includes("COLE_AQUI") &&
    cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_ANON_KEY.includes("COLE_AQUI");

  const $ = id => document.getElementById(id);

  let db;
  let refreshTimer;
  let channel;
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

  function say(message, kind = "") {
    const element = $("dashboard-message");

    if (!element) return;

    element.textContent = message;
    element.className = "message " + kind;
  }

  function setLastUpdated() {
    const element = $("last-updated");

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

    button.textContent = loading
      ? "ATUALIZANDO…"
      : "↻ Atualizar dados";

    button.style.opacity = loading ? ".65" : "1";
  }

  async function refresh() {
    if (isRefreshing || !db) return;

    isRefreshing = true;
    setRefreshLoading(true);

    try {
      const [
        { data: teams, error: teamsError },
        { data: results, error: resultsError }
      ] = await Promise.all([
        db.from("teams")
          .select("id,name")
          .order("id"),

        db.from("station_results")
          .select("team_id,station_id,status,points,submitted_at")
          .order("submitted_at", { ascending: false })
      ]);

      const error = teamsError || resultsError;

      if (error) {
        say(
          "Não foi possível carregar os dados: " + error.message,
          "error"
        );
        return;
      }

      const allTeams = teams || [];
      const allResults = results || [];

      // CALCULAR RANKING
      const ranking = allTeams.map(team => {
        const mine = allResults.filter(
          result => result.team_id === team.id
        );

        return {
          id: team.id,
          name: team.name,
          count: mine.length,
          points: mine.reduce(
            (sum, result) => sum + Number(result.points || 0),
            0
          )
        };
      }).sort((a, b) =>
        b.points - a.points ||
        b.count - a.count ||
        a.id - b.id
      );

      // MOSTRAR RANKING
      const rankingBody = $("ranking-body");

      if (rankingBody) {
        rankingBody.replaceChildren();

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

      // MOSTRAR RESULTADOS
      const resultsBody = $("results-body");

      if (resultsBody) {
        resultsBody.replaceChildren();

        allResults.forEach(result => {
          const row = document.createElement("tr");

          const values = [
            `Equipe ${result.team_id}`,

            `${String(result.station_id).padStart(2, "0")} · ${
              stationNames[result.station_id] || "Estação"
            }`,

            result.status === "completed"
              ? "Concluída"
              : "Não concluída",

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

      // ESTATÍSTICAS
      const completed = allResults.filter(
        result => result.status === "completed"
      ).length;

      const participants = new Set(
        allResults.map(result => result.team_id)
      ).size;

      const stats = $("stats");

      if (stats) {
        stats.replaceChildren();

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
      say("Dados atualizados.", "success");

    } catch (error) {
      say(
        error?.message ||
        "Não foi possível atualizar os dados.",
        "error"
      );

    } finally {
      isRefreshing = false;
      setRefreshLoading(false);
    }
  }

  async function start() {
    if (!ready || !window.supabase) {
      say(
        "Configure config.js com os dados do Supabase.",
        "error"
      );
      return;
    }

    db = window.supabase.createClient(
      cfg.SUPABASE_URL,
      cfg.SUPABASE_ANON_KEY
    );

    // BOTÃO DE ATUALIZAÇÃO MANUAL
    $("admin-refresh")?.addEventListener(
      "click",
      refresh
    );

    // PRIMEIRA CONSULTA
    await refresh();

    // ATUALIZAÇÃO EM TEMPO REAL
    channel = db
      .channel("lacen-public-dashboard")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "station_results"
        },
        () => refresh()
      )
      .subscribe();

    // ATUALIZAÇÃO AUTOMÁTICA A CADA 15 SEGUNDOS
    refreshTimer = setInterval(
      refresh,
      15000
    );
  }

  window.addEventListener("beforeunload", () => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }

    if (channel && db) {
      db.removeChannel(channel);
    }
  });

  start();

})();
