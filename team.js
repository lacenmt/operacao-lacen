(() => {
  const cfg = window.APP_CONFIG || {};
  const ready = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("COLE_AQUI") &&
    cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes("COLE_AQUI");
  const $ = id => document.getElementById(id);
  const loginPanel = $("login-panel"), teamPanel = $("team-panel");
  let db, sessionToken = null, currentTeam = null;

  function message(id, text, kind="") {
    const el = $(id); el.textContent = text; el.className = "message " + kind;
  }
  function stationName(id) {
    return ({1:"Microscopia",2:"Pipetagem",3:"Biossegurança",4:"Gerenciamento de resíduos",
      5:"Missão, visão e valores",6:"Conhecimentos do LACEN",7:"Qualidade e controle"})[id] || `Estação ${id}`;
  }
  function showTeam() {
    loginPanel.classList.add("hidden"); teamPanel.classList.remove("hidden");
    $("team-title").textContent = `Equipe ${currentTeam}`;
    loadProgress();
  }
  async function loadProgress() {
    const {data, error} = await db.rpc("team_get_progress", {p_session_token: sessionToken});
    if (error) { message("code-message", error.message, "error"); return; }
    const list = $("team-progress"); list.innerHTML = "";
    const rows = data || [];
    $("progress-count").textContent = `${rows.length} de 7`;
    for (let i=1;i<=7;i++) {
      const result = rows.find(r => Number(r.station_id) === i);
      const item = document.createElement("div");
      item.className = "progress-item";
      const left = document.createElement("div");
      const title = document.createElement("strong"); title.textContent = `${String(i).padStart(2,"0")} · ${stationName(i)}`;
      const sub = document.createElement("small"); sub.textContent = result ? (result.status === "completed" ? "Estação concluída" : "Estação registrada como não concluída") : "Aguardando código";
      left.append(title,sub);
      const badge = document.createElement("span");
      badge.className = "status " + (result ? (result.status === "completed" ? "ok" : "pending") : "");
      badge.textContent = result ? `${result.points} pts` : "Pendente";
      item.append(left,badge); list.append(item);
    }
  }
  if (!ready || !window.supabase) {
    message("login-message", "Configure a URL e a chave anon no arquivo config.js antes de usar o sistema.", "error");
    return;
  }
  db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  $("login-form").addEventListener("submit", async e => {
    e.preventDefault(); message("login-message","Verificando acesso…");
    const team = Number($("team-number").value), pin = $("team-pin").value.trim();
    const {data,error} = await db.rpc("team_login", {p_team_id:team,p_pin:pin});
    if (error || !data) { message("login-message", error?.message || "Equipe ou senha inválida.", "error"); return; }
    currentTeam = team; sessionToken = data; showTeam();
  });
  $("code-form").addEventListener("submit", async e => {
    e.preventDefault();
    const code = $("station-code").value.trim().toUpperCase();
    message("code-message","Validando código…");
    const {data,error} = await db.rpc("team_submit_code", {p_session_token:sessionToken,p_code:code});
    if (error) { message("code-message",error.message,"error"); return; }
    if (!data || data.ok !== true) { message("code-message",data?.message || "Não foi possível validar o código.","error"); return; }
    message("code-message",`${stationName(data.station_id)} registrada: ${data.status === "completed" ? "concluída" : "não concluída"} · ${data.points} pontos.`,"success");
    $("station-code").value = ""; await loadProgress();
  });
  $("logout-button").addEventListener("click", () => {
    sessionToken = null; currentTeam = null; teamPanel.classList.add("hidden"); loginPanel.classList.remove("hidden");
    $("team-pin").value = ""; message("login-message","Acesso encerrado.");
  });
})();
