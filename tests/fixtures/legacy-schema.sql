create extension if not exists pgcrypto;

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  categories text[] not null default '{}',
  wishlist_links text[] not null default '{}',
  likes text not null default '',
  dislikes text not null default '',
  edit_token_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_settings (
  id integer primary key default 1 check (id = 1),
  registration_deadline timestamptz,
  gift_budget text not null default 'S$20–30',
  exchange_date text not null default '',
  registration_open boolean not null default true,
  assignments_generated boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.event_settings (id)
values (1) on conflict (id) do nothing;

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  giver_id uuid not null unique references public.participants(id) on delete cascade,
  recipient_id uuid not null unique references public.participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint no_self_assignment check (giver_id <> recipient_id)
);

-- Keep tables inaccessible to anonymous clients. The app uses the service-role key
-- exclusively in server-side route handlers.
alter table public.participants enable row level security;
alter table public.event_settings enable row level security;
alter table public.assignments enable row level security;
