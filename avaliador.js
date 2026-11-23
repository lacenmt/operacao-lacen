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
  let currentTeams = [];
  let currentHints = [];

  const stationNames = {
    1: "Microscopia",
    2: "Pipetagem",
    3: "Biossegurança",
    4: "Gerenciamento de resíduos",
    5: "Balança",
    6: "Missão, Visão e Valores",
    7: "A/P de Coliformes"
  };

  const teamColors = {
    1: { name: "Rosa", emoji: "🌸" },
    2: { name: "Azul", emoji: "🔵" },
    3: { name: "Verde", emoji: "🟢" },
    4: { name: "Preto", emoji: "⚫" },
    5: { name: "Vermelho", emoji: "🔴" },
    6: { name: "Branco", emoji: "⚪" },
    7: { name: "Amarelo", emoji: "🟡" }
  };

  function say(message, kind = "") {
    const element = $("dashboard-message");
    if (!element) return;
    element.textContent = message;
    element.className = "message " + kind;
  }

  function sayHints(message, kind = "") {
    const element = $("hints-message");
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
    button.textContent = loading ? "ATUALIZANDO…" : "↻ Atualizar dados";
    button.style.opacity = loading ? ".65" : "1";
  }

  function renderHints() {
    const container = $("hints-teams");
    const totalUsed = currentHints.length;
    const totalAllowed = currentTeams.length * 2;
    const totalAvailable = Math.max(0, totalAllowed - totalUsed);

    if ($("hints-used")) $("hints-used").textContent = totalUsed;
    if ($("hints-available")) $("hints-available").textContent = totalAvailable;

    if (!container) return;
    container.replaceChildren();

    currentTeams.forEach(team => {
      const teamHints = currentHints.filter(h => Number(h.team_id) === Number(team.id));
      const usedSlots = new Set(teamHints.map(h => Number(h.hint_number)));
      const color = teamColors[team.id] || { name: "Equipe", emoji: "🏷️" };

      const card = document.createElement("article");
      card.className = "hint-team-card";

      const heading = document.createElement("div");
      heading.className = "hint-team-heading";

      const name = document.createElement("strong");
      name.textContent = `${color.emoji} ${team.name}`;

      const colorLabel = document.createElement("span");
      colorLabel.className = "hint-color";
      colorLabel.textContent = color.name;

      heading.append(name, colorLabel);

      const count = document.createElement("div");
      count.className = "hint-count";
      count.textContent = `${usedSlots.size}/2 dicas utilizadas`;

      const slots = document.createElement("div");
      slots.className = "hint-slots";

      [1, 2].forEach(number => {
        const label = document.createElement("label");
        label.className = "hint-slot";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = usedSlots.has(number);
        checkbox.dataset.teamId = team.id;
        checkbox.dataset.hintNumber = number;
        checkbox.setAttribute("aria-label", `Dica ${number} da equipe ${team.name}`);

        // Quando as duas dicas já foram usadas, não há outra marcação disponível.
        checkbox.disabled = !checkbox.checked && usedSlots.size >= 2;

        const text = document.createElement("span");
        text.textContent = `Dica ${number}`;

        label.append(checkbox, text);
        slots.append(label);
      });

      card.append(heading, count, slots);
      container.append(card);
    });
  }

  async function loadHints() {
    const { data, error } = await db
      .from("team_hints")
      .select("team_id,hint_number,used_at")
      .order("team_id")
      .order("hint_number");

    if (error) throw error;
    currentHints = data || [];
    renderHints();
  }

  async function handleHintChange(checkbox) {
    const teamId = Number(checkbox.dataset.teamId);
    const hintNumber = Number(checkbox.dataset.hintNumber);
    const shouldUse = checkbox.checked;

    checkbox.disabled = true;
    sayHints("Salvando alteração…");

    try {
      if (shouldUse) {
        // Consulta novamente antes de inserir para manter a interface sincronizada.
        const { data: existing, error: readError } = await db
          .from("team_hints")
          .select("hint_number")
          .eq("team_id", teamId);

        if (readError) throw readError;

        const alreadyUsed = new Set((existing || []).map(item => Number(item.hint_number)));
        if (alreadyUsed.has(hintNumber)) {
          await loadHints();
          sayHints("Essa dica já estava marcada.", "success");
          return;
        }
        if (alreadyUsed.size >= 2) {
          await loadHints();
          sayHints("Essa equipe já utilizou as duas dicas permitidas.", "error");
          return;
        }

        const { error } = await db
          .from("team_hints")
          .insert({ team_id: teamId, hint_number: hintNumber });

        if (error) throw error;
      } else {
        const { error } = await db
          .from("team_hints")
          .delete()
          .eq("team_id", teamId)
          .eq("hint_number", hintNumber);

        if (error) throw error;
      }

      await loadHints();
      sayHints("Controle de dicas atualizado e salvo.", "success");
    } catch (error) {
      await loadHints().catch(() => {});
      sayHints(
        error?.message || "Não foi possível salvar a alteração. Confira as permissões da tabela team_hints.",
        "error"
      );
    }
  }

  async function refresh() {
    if (isRefreshing || !db) return;

    isRefreshing = true;
    setRefreshLoading(true);

    try {
      const [
        { data: teams, error: teamsError },
        { data: results, error: resultsError },
        { data: hints, error: hintsError }
      ] = await Promise.all([
        db.from("teams").select("id,name").order("id"),
        db.from("station_results")
          .select("team_id,station_id,status,points,submitted_at")
          .order("submitted_at", { ascending: false }),
        db.from("team_hints")
          .select("team_id,hint_number,used_at")
          .order("team_id")
          .order("hint_number")
      ]);

      const error = teamsError || resultsError || hintsError;
      if (error) {
        say("Não foi possível carregar os dados: " + error.message, "error");
        return;
      }

      const allTeams = teams || [];
      const allResults = results || [];
      currentTeams = allTeams;
      currentHints = hints || [];
      renderHints();

      const teamNameById = Object.fromEntries(
        allTeams.map(team => [team.id, team.name])
      );

      // CALCULAR RANKING
      const ranking = allTeams.map(team => {
        const mine = allResults.filter(result => result.team_id === team.id);
        return {
          id: team.id,
          name: team.name,
          count: mine.length,
          points: mine.reduce((sum, result) => sum + Number(result.points || 0), 0)
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
          [index + 1, item.name, `${item.count}/7`, item.points].forEach(value => {
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
            teamNameById[result.team_id] || `Equipe ${result.team_id}`,
            `${String(result.station_id).padStart(2, "0")} · ${stationNames[result.station_id] || "Estação"}`,
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

      // ESTATÍSTICAS
      const completed = allResults.filter(result => result.status === "completed").length;
      const participants = new Set(allResults.map(result => result.team_id)).size;
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
      say(error?.message || "Não foi possível atualizar os dados.", "error");
    } finally {
      isRefreshing = false;
      setRefreshLoading(false);
    }
  }

  async function start() {
    if (!ready || !window.supabase) {
      say("Configure config.js com os dados do Supabase.", "error");
      return;
    }

    db = window.supabase.createClient(
      cfg.SUPABASE_URL,
      cfg.SUPABASE_ANON_KEY
    );

    $("admin-refresh")?.addEventListener("click", refresh);

    $("hints-teams")?.addEventListener("change", event => {
      const checkbox = event.target;
      if (checkbox instanceof HTMLInputElement &&
          checkbox.matches('input[type="checkbox"][data-team-id][data-hint-number]')) {
        handleHintChange(checkbox);
      }
    });

    await refresh();

    channel = db
      .channel("lacen-public-dashboard")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "station_results"
      }, () => refresh())
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "team_hints"
      }, () => refresh())
      .subscribe();

    refreshTimer = setInterval(refresh, 15000);
  }

  window.addEventListener("beforeunload", () => {
    if (refreshTimer) clearInterval(refreshTimer);
    if (channel && db) db.removeChannel(channel);
  });

  start();
})();
