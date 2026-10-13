-- Esquema de la app de lubricación (fase 1).
-- Pegar completo en Supabase > SQL Editor > New query > Run.

-- Perfil: una fila por persona con cuenta.
create table if not exists public.perfiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  email       text,
  nombre      text,
  datos       jsonb not null,
  actualizado timestamptz not null default now()
);

-- Historial: una fila cada vez que alguien con cuenta termina el perfil.
create table if not exists public.recomendaciones (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references auth.users (id) on delete cascade,
  creado    timestamptz not null default now(),
  segmento  text,
  ganador   text,
  solidez   real,
  top       jsonb,
  perfil    jsonb
);
create index if not exists recomendaciones_user_idx on public.recomendaciones (user_id, creado desc);

-- Seguridad por fila: cada persona ve y edita solo lo suyo.
-- Tú, como dueño del proyecto, ves todo desde el panel de Supabase (Table Editor),
-- porque el panel no pasa por estas reglas.
alter table public.perfiles enable row level security;
alter table public.recomendaciones enable row level security;

drop policy if exists "perfil propio" on public.perfiles;
create policy "perfil propio" on public.perfiles
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "recomendaciones propias" on public.recomendaciones;
create policy "recomendaciones propias" on public.recomendaciones
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Vista para ti: un resumen por persona, para revisar o exportar a CSV desde el panel.
create or replace view public.resumen_usuarios
with (security_invoker = true) as
select
  p.email,
  p.nombre,
  p.datos->>'segmento'        as segmento,
  (p.datos->>'kmSemana')::int as km_semana,
  p.datos->>'sacaCadena'      as saca_cadena,
  p.datos->'actual'->>'nombre' as lubricante_actual,
  (select r.ganador from public.recomendaciones r where r.user_id = p.user_id order by r.creado desc limit 1) as ultimo_recomendado,
  p.actualizado
from public.perfiles p;
