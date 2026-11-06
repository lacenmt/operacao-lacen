(() => {
  const cfg = window.APP_CONFIG || {};
  const ready = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("COLE_AQUI") &&
    cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes("COLE_AQUI");
  const $ = id => document.getElementById(id);
  let db, channel;
  const stationNames = {1:"Microscopia",2:"Pipetagem",3:"Biossegurança",4:"Gerenciamento de resíduos",5:"Missão, visão e valores",6:"Conhecimentos do LACEN",7:"Qualidade e controle"};
  const say = (id,t,k="") => { $(id).textContent=t; $(id).className="message "+k; };
  if (!ready || !window.supabase) { say("admin-login-message","Configure config.js com os dados do Supabase.","error"); return; }
  db = window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);

  $("admin-login-form").addEventListener("submit", async e => {
    e.preventDefault(); say("admin-login-message","Autenticando…");
    const {error} = await db.auth.signInWithPassword({email:$("admin-email").value,password:$("admin-password").value});
    if (error) { say("admin-login-message",error.message,"error"); return; }
    const {data:allowed,error:checkError} = await db.rpc("admin_is_allowed");
    if (checkError || allowed !== true) { await db.auth.signOut(); say("admin-login-message","Este usuário não está autorizado como administrador. Inclua o UUID dele na tabela admins.","error"); return; }
    $("admin-login-panel").classList.add("hidden"); $("dashboard").classList.remove("hidden");
    await refresh();
    channel = db.channel("lacen-results").on("postgres_changes",{event:"*",schema:"public",table:"station_results"},refresh).subscribe();
  });

  async function refresh() {
    const [{data:teams,error:e1},{data:stations,error:e2},{data:results,error:e3}] = await Promise.all([
      db.from("teams").select("id,name").order("id"),
      db.from("stations").select("id,title").order("id"),
      db.from("station_results").select("team_id,station_id,status,points,submitted_at").order("submitted_at",{ascending:false})
    ]);
    if (e1||e2||e3) { say("dashboard-message",(e1||e2||e3).message,"error"); return; }
    const ranking = (teams||[]).map(t => {
      const mine=(results||[]).filter(r=>r.team_id===t.id);
      return {id:t.id,name:t.name,count:mine.length,points:mine.reduce((s,r)=>s+Number(r.points||0),0)};
    }).sort((a,b)=>b.points-a.points || b.count-a.count || a.id-b.id);
    $("ranking-body").innerHTML="";
    ranking.forEach((r,i)=>{
      const tr=document.createElement("tr");
      [i+1,r.name,`${r.count}/7`,r.points].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.append(td);});
      $("ranking-body").append(tr);
    });
    $("results-body").innerHTML="";
    (results||[]).forEach(r=>{
      const tr=document.createElement("tr");
      const values=[`Equipe ${r.team_id}`,`${String(r.station_id).padStart(2,"0")} · ${stationNames[r.station_id]||"Estação"}`,r.status==="completed"?"Concluída":"Não concluída",r.points,new Date(r.submitted_at).toLocaleString("pt-BR")];
      values.forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.append(td);});
      $("results-body").append(tr);
    });
    const total=(results||[]).length, completed=(results||[]).filter(r=>r.status==="completed").length;
    $("stats").innerHTML="";
    [["Registros",total],["Estações concluídas",completed],["Equipes participantes",new Set((results||[]).map(r=>r.team_id)).size]].forEach(([label,value])=>{
      const card=document.createElement("div");card.className="stat";
      const n=document.createElement("strong");n.textContent=value;
      const l=document.createElement("span");l.textContent=label;card.append(n,l);$("stats").append(card);
    });
    say("dashboard-message","Dados atualizados.","success");
  }
  $("admin-logout").addEventListener("click",async()=>{
    if(channel) await db.removeChannel(channel);
    await db.auth.signOut(); $("dashboard").classList.add("hidden");$("admin-login-panel").classList.remove("hidden");
  });
})();
