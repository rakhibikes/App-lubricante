-- Fase 2: mi bicicleta, salud de la cadena y planificador de carrera.
-- Pegar completo en Supabase > SQL Editor > New query > Run. Se puede correr más de una vez.

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

-- Cada persona ve y edita solo lo suyo. Tú ves todo desde el panel de Supabase.
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
