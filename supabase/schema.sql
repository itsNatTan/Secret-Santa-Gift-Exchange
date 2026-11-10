-- Fresh databases only. For the existing single-event app use the migration instead.
begin;
create extension if not exists pgcrypto;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 100),
  join_code text not null unique,
  admin_code_hash text,
  registration_deadline timestamptz,
  gift_budget text not null default 'S$20–30',
  exchange_date text not null default '',
  registration_open boolean not null default true,
  assignments_generated boolean not null default false,
  draw_confirmed boolean not null default false,
  draw_revision integer not null default 0,
  constraint confirmed_draw_exists check (not draw_confirmed or assignments_generated),
  forced_pairs jsonb not null default '[]'::jsonb check (jsonb_typeof(forced_pairs) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  email text not null,
  categories text[] not null default '{}',
  wishlist_links text[] not null default '{}',
  likes text not null default '',
  dislikes text not null default '',
  edit_token_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, email),
  unique (event_id, id)
);
create index participants_edit_token_idx on public.participants(edit_token_hash);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  giver_id uuid not null unique,
  recipient_id uuid not null unique,
  emailed_at timestamptz,
  email_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (event_id, giver_id) references public.participants(event_id, id) on delete cascade,
  foreign key (event_id, recipient_id) references public.participants(event_id, id) on delete cascade,
  constraint no_self_assignment check (giver_id <> recipient_id)
);
create index assignments_event_idx on public.assignments(event_id);

alter table public.events enable row level security;
alter table public.participants enable row level security;
alter table public.assignments enable row level security;

-- All participant writes take the same event lock as the draw. A signup/edit
-- cannot race the draw or bypass a closed registration period.
create or replace function public.guard_registration() returns trigger
language plpgsql set search_path = public as $$
declare e public.events;
begin
  if TG_OP = 'UPDATE' and (new.event_id <> old.event_id or new.id <> old.id) then
    raise exception 'Cannot move a participant between events';
  end if;
  select * into e from public.events where id = new.event_id for update;
  if not found or not e.registration_open or e.assignments_generated
    or (e.registration_deadline is not null and e.registration_deadline <= now()) then
    raise exception 'Registration is closed';
  end if;
  return new;
end;
$$;
create trigger guard_registration before insert or update on public.participants
for each row execute function public.guard_registration();

-- Generation saves a draft and closes registration, but does not permit emails.
create or replace function public.commit_draw(target_event uuid, pairs jsonb) returns void
language plpgsql set search_path = public as $$
declare e public.events; n integer;
begin
  select * into e from public.events where id = target_event for update;
  if not found or e.assignments_generated then raise exception 'Draw already generated or event missing'; end if;
  select count(*) into n from public.participants where event_id = target_event;
  if n < 3 or pairs is null or jsonb_typeof(pairs) is distinct from 'array' or jsonb_array_length(pairs) <> n then raise exception 'Participant list changed'; end if;
  if exists (
    select 1 from jsonb_to_recordset(e.forced_pairs) as f(giver_id uuid, recipient_id uuid)
    where not exists (
      select 1 from jsonb_to_recordset(pairs) as p(giver_id uuid, recipient_id uuid)
      where p.giver_id = f.giver_id and p.recipient_id = f.recipient_id
    )
  ) then raise exception 'Forced pairings changed or were not honoured'; end if;
  insert into public.assignments(event_id, giver_id, recipient_id)
    select target_event, x.giver_id, x.recipient_id
    from jsonb_to_recordset(pairs) as x(giver_id uuid, recipient_id uuid);
  if exists (select 1 from public.assignments a join public.assignments b
      on a.giver_id = b.recipient_id and a.recipient_id = b.giver_id
      where a.event_id = target_event and b.event_id = target_event) then
    raise exception 'Reciprocal assignments are not allowed';
  end if;
  update public.events set assignments_generated = true, registration_open = false,
    draw_confirmed = false, draw_revision = 1, updated_at = now() where id = target_event;
end;
$$;

-- Admins may override initial forced choices during review. All final pairings
-- must still be a complete valid draw. Delete/insert is atomic, including swaps.
create or replace function public.edit_draft_draw(target_event uuid, pairs jsonb, expected_revision integer) returns void
language plpgsql set search_path = public as $$
declare e public.events; n integer;
begin
  select * into e from public.events where id = target_event for update;
  if not found or not e.assignments_generated or e.draw_confirmed then raise exception 'No editable draft'; end if;
  if e.draw_revision is distinct from expected_revision then raise exception 'Draft changed; refresh before editing'; end if;
  if exists (select 1 from public.assignments where event_id = target_event
      and (emailed_at is not null or email_claimed_at is not null)) then raise exception 'Emails already started'; end if;
  select count(*) into n from public.participants where event_id = target_event;
  if n < 3 or pairs is null or jsonb_typeof(pairs) is distinct from 'array' or jsonb_array_length(pairs) <> n then raise exception 'Participant list changed'; end if;
  delete from public.assignments where event_id = target_event;
  insert into public.assignments(event_id, giver_id, recipient_id)
    select target_event, x.giver_id, x.recipient_id
    from jsonb_to_recordset(pairs) as x(giver_id uuid, recipient_id uuid);
  if exists (select 1 from public.assignments a join public.assignments b
      on a.giver_id = b.recipient_id and a.recipient_id = b.giver_id
      where a.event_id = target_event and b.event_id = target_event) then
    raise exception 'Reciprocal assignments are not allowed';
  end if;
  update public.events set draw_revision = draw_revision + 1, updated_at = now() where id = target_event;
end;
$$;

-- Confirmation and editing serialize on the event. A stale review cannot be
-- confirmed, and confirmed assignments can never be edited by the draft RPC.
create or replace function public.confirm_draw(target_event uuid, expected_revision integer) returns void
language plpgsql set search_path = public as $$
declare e public.events; n integer;
begin
  select * into e from public.events where id = target_event for update;
  if not found or not e.assignments_generated or e.draw_confirmed then raise exception 'No unconfirmed draft'; end if;
  if e.draw_revision is distinct from expected_revision then raise exception 'Draft changed; refresh before confirming'; end if;
  select count(*) into n from public.participants where event_id = target_event;
  if n < 3 or (select count(*) from public.assignments where event_id = target_event) <> n then raise exception 'Incomplete draw'; end if;
  update public.events set draw_confirmed = true, updated_at = now() where id = target_event;
end;
$$;

-- Even direct attempts to claim draft email batches return no recipients.
create or replace function public.claim_assignment_emails(target_event uuid)
returns table(id uuid, giver_id uuid, recipient_id uuid)
language sql set search_path = public as $$
  update public.assignments a set email_claimed_at = now()
  where a.id in (
    select s.id from public.assignments s join public.events e on e.id = s.event_id
    where s.event_id = target_event and e.draw_confirmed
      and s.emailed_at is null
      and (s.email_claimed_at is null or s.email_claimed_at < now() - interval '2 minutes')
    order by s.id for update of s skip locked limit 5
  ) returning a.id, a.giver_id, a.recipient_id;
$$;

revoke all on function public.commit_draw(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.edit_draft_draw(uuid, jsonb, integer) from public, anon, authenticated;
revoke all on function public.confirm_draw(uuid, integer) from public, anon, authenticated;
revoke all on function public.claim_assignment_emails(uuid) from public, anon, authenticated;
grant execute on function public.commit_draw(uuid, jsonb) to service_role;
grant execute on function public.edit_draft_draw(uuid, jsonb, integer) to service_role;
grant execute on function public.confirm_draw(uuid, integer) to service_role;
grant execute on function public.claim_assignment_emails(uuid) to service_role;

revoke all on function public.guard_registration() from public, anon, authenticated;
grant execute on function public.guard_registration() to service_role;
commit;
