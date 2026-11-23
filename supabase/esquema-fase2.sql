-- Fase 2: mi bicicleta, salud de la cadena, planificador de carrera y catálogo administrable.
-- Pegar completo en Supabase > SQL Editor > New query > Run. Se puede correr más de una vez.

-- ---------- Administrador ----------
create table if not exists public.admins (
  email text primary key
);
alter table public.admins enable row level security;
insert into public.admins (email) values
  ('rakhi.bikes@gmail.com'),
  ('manuperezraquiman@gmail.com')
on conflict do nothing;

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where lower(email) = lower(auth.jwt() ->> 'email'));
$$;
grant execute on function public.es_admin() to anon, authenticated;

-- ---------- Módulo 2: bicicletas ----------
create table if not exists public.bicicletas (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre          text not null,
  tipo            text,
  velocidades     int,
  grupo           text,
  precio_cadena   int,
  precio_cassette int,
  "union"         text,
  creado          timestamptz not null default now()
);

-- ---------- Módulo 6: cadenas y bitácora ----------
create table if not exists public.cadenas (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bici_id          uuid not null references public.bicicletas (id) on delete cascade,
  instalada_fecha  date,
  instalada_odo    numeric,
  lubricante_id    text,
  edad_desconocida boolean not null default false,
  retirada_fecha   date,
  retirada_odo     numeric,
  k                real,
  creado           timestamptz not null default now()
);

create table if not exists public.eventos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cadena_id   uuid not null references public.cadenas (id) on delete cascade,
  fecha       date not null default current_date,
  tipo        text not null check (tipo in ('km', 'lub', 'limpie', 'medicion', 'cambio')),
  odo         numeric,
  clima       text check (clima in ('seco', 'normal', 'lluvia')),
  producto_id text,
  resultado   text check (resultado in ('bajo', 'medio', 'alto')),
  creado      timestamptz not null default now()
);
create index if not exists eventos_cadena_idx on public.eventos (cadena_id, fecha);

-- ---------- Módulo 7: carreras ----------
create table if not exists public.carreras (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre      text not null,
  fecha       date,
  distancia   numeric,
  tramos      jsonb,
  modo        text,
  controles   jsonb,
  estrategias jsonb,
  potencia    int,
  velocidad   numeric,
  ruta        jsonb,
  gpx_path    text,
  bici_id     uuid references public.bicicletas (id) on delete set null,
  plan        jsonb,
  creado      timestamptz not null default now()
);

-- Cada persona ve y edita solo lo suyo; el administrador puede leer cadenas y bitácora para calibrar K.
do $$
declare t text;
begin
  foreach t in array array['bicicletas', 'cadenas', 'eventos', 'carreras'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "propio" on public.%I', t);
    execute format('create policy "propio" on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

drop policy if exists "admin lee cadenas" on public.cadenas;
create policy "admin lee cadenas" on public.cadenas for select to authenticated using (public.es_admin());
drop policy if exists "admin lee eventos" on public.eventos;
create policy "admin lee eventos" on public.eventos for select to authenticated using (public.es_admin());

-- ---------- Módulo 8: catálogo versionado ----------
create table if not exists public.catalogo_versiones (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,
  datos     jsonb not null,
  publicado boolean not null default true,
  nota      text,
  autor     uuid default auth.uid(),
  creado    timestamptz not null default now()
);
alter table public.catalogo_versiones enable row level security;
drop policy if exists "todos leen lo publicado" on public.catalogo_versiones;
create policy "todos leen lo publicado" on public.catalogo_versiones for select to anon, authenticated using (publicado or public.es_admin());
drop policy if exists "admin escribe" on public.catalogo_versiones;
create policy "admin escribe" on public.catalogo_versiones for insert to authenticated with check (public.es_admin());
drop policy if exists "admin edita" on public.catalogo_versiones;
create policy "admin edita" on public.catalogo_versiones for update to authenticated using (public.es_admin()) with check (public.es_admin());
grant select on public.catalogo_versiones to anon, authenticated;
grant insert, update on public.catalogo_versiones to authenticated;

-- Lubricantes que la gente busca y no encuentra.
create table if not exists public.busquedas (
  id     bigint generated always as identity primary key,
  texto  text not null check (char_length(texto) <= 80),
  creado timestamptz not null default now()
);
alter table public.busquedas enable row level security;
drop policy if exists "cualquiera registra" on public.busquedas;
create policy "cualquiera registra" on public.busquedas for insert to anon, authenticated with check (true);
drop policy if exists "admin lee" on public.busquedas;
create policy "admin lee" on public.busquedas for select to authenticated using (public.es_admin());
grant insert on public.busquedas to anon, authenticated;
grant select on public.busquedas to authenticated;

-- Cada recomendación guarda la versión del catálogo con que se calculó.
alter table public.recomendaciones add column if not exists catalogo text;

-- ---------- Archivos GPX (Storage, privado, una carpeta por persona) ----------
insert into storage.buckets (id, name, public) values ('gpx', 'gpx', false) on conflict (id) do nothing;
drop policy if exists "gpx propio lee" on storage.objects;
create policy "gpx propio lee" on storage.objects for select to authenticated
  using (bucket_id = 'gpx' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "gpx propio sube" on storage.objects;
create policy "gpx propio sube" on storage.objects for insert to authenticated
  with check (bucket_id = 'gpx' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "gpx propio borra" on storage.objects;
create policy "gpx propio borra" on storage.objects for delete to authenticated
  using (bucket_id = 'gpx' and (storage.foldername(name))[1] = auth.uid()::text);
