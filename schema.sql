-- OPERAÇÃO LACEN | Banco de dados inicial
-- Execute no SQL Editor do projeto Supabase recém-criado.

create extension if not exists pgcrypto;

create table if not exists public.teams (
  id integer primary key check (id between 1 and 7),
  name text not null unique,
  pin_hash text not null
);

create table if not exists public.stations (
  id integer primary key check (id between 1 and 7),
  title text not null
);

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.code_keys (
  id bigint generated always as identity primary key,
  station_id integer not null references public.stations(id),
  outcome text not null check (outcome in ('completed','not_completed')),
  code_hash text not null,
  unique(station_id,outcome)
);

create table if not exists public.team_sessions (
  token uuid primary key default gen_random_uuid(),
  team_id integer not null references public.teams(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '4 hours'
);

create table if not exists public.station_results (
  id bigint generated always as identity primary key,
  team_id integer not null references public.teams(id),
  station_id integer not null references public.stations(id),
  status text not null check (status in ('completed','not_completed')),
  points integer not null default 0,
  submitted_at timestamptz not null default now(),
  unique(team_id,station_id)
);

insert into public.teams(id,name,pin_hash) values
 (1,'Equipe 1',crypt('731842',gen_salt('bf'))),
 (2,'Equipe 2',crypt('284619',gen_salt('bf'))),
 (3,'Equipe 3',crypt('965173',gen_salt('bf'))),
 (4,'Equipe 4',crypt('417528',gen_salt('bf'))),
 (5,'Equipe 5',crypt('852396',gen_salt('bf'))),
 (6,'Equipe 6',crypt('693741',gen_salt('bf'))),
 (7,'Equipe 7',crypt('528164',gen_salt('bf')))
on conflict (id) do nothing;

insert into public.stations(id,title) values
 (1,'Microscopia'),
 (2,'Pipetagem'),
 (3,'Biossegurança'),
 (4,'Gerenciamento de resíduos'),
 (5,'Missão, visão e valores'),
 (6,'Conhecimentos do LACEN'),
 (7,'Qualidade e controle')
on conflict (id) do update set title=excluded.title;

-- Códigos são armazenados como hashes: não ficam legíveis nas tabelas públicas.
insert into public.code_keys(station_id,outcome,code_hash) values
 (1,'completed',crypt('LA1847',gen_salt('bf'))),(1,'not_completed',crypt('LA5923',gen_salt('bf'))),
 (2,'completed',crypt('PI7361',gen_salt('bf'))),(2,'not_completed',crypt('PI2485',gen_salt('bf'))),
 (3,'completed',crypt('BI4196',gen_salt('bf'))),(3,'not_completed',crypt('BI8532',gen_salt('bf'))),
 (4,'completed',crypt('RE6258',gen_salt('bf'))),(4,'not_completed',crypt('RE3714',gen_salt('bf'))),
 (5,'completed',crypt('MV9026',gen_salt('bf'))),(5,'not_completed',crypt('MV1643',gen_salt('bf'))),
 (6,'completed',crypt('LC5472',gen_salt('bf'))),(6,'not_completed',crypt('LC8195',gen_salt('bf'))),
 (7,'completed',crypt('QC2938',gen_salt('bf'))),(7,'not_completed',crypt('QC6841',gen_salt('bf')))
on conflict (station_id,outcome) do nothing;

create or replace function public.admin_is_allowed()
returns boolean language sql security definer set search_path=public
as $$ select exists(select 1 from public.admins where user_id=auth.uid()); $$;

create or replace function public.team_login(p_team_id integer,p_pin text)
returns uuid language plpgsql security definer set search_path=public,extensions
as $$
declare v_hash text; v_token uuid;
begin
  select pin_hash into v_hash from public.teams where id=p_team_id;
  if v_hash is null or crypt(p_pin,v_hash) <> v_hash then
    raise exception 'Equipe ou senha inválida.';
  end if;
  delete from public.team_sessions where expires_at < now();
  insert into public.team_sessions(team_id) values(p_team_id) returning token into v_token;
  return v_token;
end; $$;

create or replace function public.team_submit_code(p_session_token uuid,p_code text)
returns jsonb language plpgsql security definer set search_path=public,extensions
as $$
declare v_team integer; v_station integer; v_outcome text; v_points integer;
begin
  select team_id into v_team from public.team_sessions
   where token=p_session_token and expires_at>now();
  if v_team is null then return jsonb_build_object('ok',false,'message','Sessão expirada. Entre novamente.'); end if;

  select station_id,outcome into v_station,v_outcome
    from public.code_keys
   where code_hash=crypt(upper(trim(p_code)),code_hash)
   limit 1;
  if v_station is null then return jsonb_build_object('ok',false,'message','Código inválido. Confira com o avaliador.'); end if;

  if exists(select 1 from public.station_results where team_id=v_team and station_id=v_station) then
    return jsonb_build_object('ok',false,'message','Esta equipe já registrou um resultado nesta estação.');
  end if;

  v_points := case when v_outcome='completed' then 100 else 0 end;
  insert into public.station_results(team_id,station_id,status,points)
  values(v_team,v_station,v_outcome,v_points);

  return jsonb_build_object('ok',true,'team_id',v_team,'station_id',v_station,'status',v_outcome,'points',v_points);
end; $$;

create or replace function public.team_get_progress(p_session_token uuid)
returns table(station_id integer,status text,points integer)
language plpgsql security definer set search_path=public
as $$
declare v_team integer;
begin
  select team_id into v_team from public.team_sessions
   where token=p_session_token and expires_at>now();
  if v_team is null then raise exception 'Sessão expirada. Entre novamente.'; end if;
  return query select r.station_id,r.status,r.points from public.station_results r
   where r.team_id=v_team order by r.station_id;
end; $$;

alter table public.teams enable row level security;
alter table public.stations enable row level security;
alter table public.admins enable row level security;
alter table public.code_keys enable row level security;
alter table public.team_sessions enable row level security;
alter table public.station_results enable row level security;

-- Somente administradores autenticados podem consultar os dados operacionais.
create policy "admin read teams" on public.teams for select to authenticated using (public.admin_is_allowed());
create policy "admin read stations" on public.stations for select to authenticated using (public.admin_is_allowed());
create policy "admin read results" on public.station_results for select to authenticated using (public.admin_is_allowed());
create policy "admin read admins" on public.admins for select to authenticated using (user_id=auth.uid());
create policy "admin read code keys" on public.code_keys for select to authenticated using (public.admin_is_allowed());

grant usage on schema public to anon,authenticated;
grant execute on function public.team_login(integer,text) to anon,authenticated;
grant execute on function public.team_submit_code(uuid,text) to anon,authenticated;
grant execute on function public.team_get_progress(uuid) to anon,authenticated;
grant execute on function public.admin_is_allowed() to authenticated;
grant select on public.teams,public.stations,public.station_results to authenticated;
grant select on public.code_keys,public.admins to authenticated;

-- Habilite Realtime para station_results no painel Supabase:
-- Database > Publications > supabase_realtime > marque station_results.
