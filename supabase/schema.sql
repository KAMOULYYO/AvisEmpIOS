create extension if not exists "pgcrypto";

create table if not exists public.avis (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  prenom text not null,
  departement text not null,
  type_avis text not null,
  priorite text not null default 'Moyenne',
  statut text not null default 'Nouveau',
  assigne_a text,
  date_limite date,
  is_anonyme boolean not null default false,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.avis enable row level security;

alter table public.avis
  add column if not exists priorite text not null default 'Moyenne',
  add column if not exists statut text not null default 'Nouveau',
  add column if not exists assigne_a text,
  add column if not exists date_limite date,
  add column if not exists is_anonyme boolean not null default false;

alter table public.avis
  drop constraint if exists avis_priorite_check;
alter table public.avis
  add constraint avis_priorite_check check (priorite in ('Basse', 'Moyenne', 'Haute', 'Urgente'));

alter table public.avis
  drop constraint if exists avis_statut_check;
alter table public.avis
  add constraint avis_statut_check check (statut in ('Nouveau', 'En cours', 'Resolu'));

create index if not exists avis_created_at_idx on public.avis(created_at desc);
create index if not exists avis_statut_idx on public.avis(statut);
create index if not exists avis_priorite_idx on public.avis(priorite);
create index if not exists avis_departement_idx on public.avis(departement);

drop policy if exists "avis_insert_public" on public.avis;
create policy "avis_insert_public"
on public.avis
for insert
to anon, authenticated
with check (true);

drop policy if exists "avis_select_authenticated" on public.avis;
create policy "avis_select_authenticated"
on public.avis
for select
to authenticated
using (true);

drop policy if exists "avis_update_authenticated" on public.avis;
create policy "avis_update_authenticated"
on public.avis
for update
to authenticated
using (true)
with check (true);

drop policy if exists "avis_delete_authenticated" on public.avis;
create policy "avis_delete_authenticated"
on public.avis
for delete
to authenticated
using (true);

create table if not exists public.directeur_commentaires (
  id uuid primary key default gen_random_uuid(),
  avis_id uuid not null references public.avis(id) on delete cascade,
  auteur_email text not null,
  contenu text not null,
  created_at timestamptz not null default now()
);

alter table public.directeur_commentaires enable row level security;

create index if not exists directeur_commentaires_avis_id_idx on public.directeur_commentaires(avis_id);
create index if not exists directeur_commentaires_created_at_idx on public.directeur_commentaires(created_at desc);

drop policy if exists "commentaires_select_authenticated" on public.directeur_commentaires;
create policy "commentaires_select_authenticated"
on public.directeur_commentaires
for select
to authenticated
using (true);

drop policy if exists "commentaires_insert_authenticated" on public.directeur_commentaires;
create policy "commentaires_insert_authenticated"
on public.directeur_commentaires
for insert
to authenticated
with check (true);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  avis_id uuid references public.avis(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  actor_email text,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_avis_id_idx on public.audit_logs(avis_id);

drop policy if exists "audit_select_authenticated" on public.audit_logs;
create policy "audit_select_authenticated"
on public.audit_logs
for select
to authenticated
using (true);

drop policy if exists "audit_insert_authenticated" on public.audit_logs;
create policy "audit_insert_authenticated"
on public.audit_logs
for insert
to authenticated
with check (true);
