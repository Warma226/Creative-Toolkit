-- À exécuter une fois dans Supabase : SQL Editor > New query > coller > Run.

-- Un compte = une adresse IP (contrainte unique sur ip).
create table if not exists public.accounts (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  ip         text not null unique,
  created_at timestamptz not null default now()
);

-- Compteur de téléchargements par compte et par jour (UTC).
create table if not exists public.downloads (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null default current_date,
  count   int  not null default 0,
  primary key (user_id, day)
);

-- Aucun accès direct depuis le navigateur : seules les fonctions serveur lisent et écrivent.
alter table public.accounts  enable row level security;
alter table public.downloads enable row level security;

-- Consomme un téléchargement de façon atomique.
-- Renvoie le nombre restant, ou -1 si la limite du jour est atteinte.
create or replace function public.consume_download(p_user uuid, p_limit int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare c int;
begin
  insert into downloads (user_id, day, count)
  values (p_user, current_date, 1)
  on conflict (user_id, day) do update
    set count = downloads.count + 1
    where downloads.count < p_limit
  returning count into c;

  if c is null then
    return -1;
  end if;
  return p_limit - c;
end;
$$;

revoke execute on function public.consume_download(uuid, int) from public, anon, authenticated;
