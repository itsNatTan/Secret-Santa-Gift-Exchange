-- Run ONCE on the original app database, before deploying the new app.
-- Preserves participant IDs, edit links, settings, and the existing draw.
begin;
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


insert into public.events(id, name, join_code, registration_deadline, gift_budget, exchange_date, registration_open, assignments_generated, updated_at)
select '00000000-0000-4000-8000-000000000001', 'NSCC Gift Exchange', 'NSCC2026', registration_deadline, gift_budget, exchange_date, registration_open, assignments_generated, updated_at
from public.event_settings where id = 1;
-- Also supports an original database with no settings row yet.
insert into public.events(id, name, join_code) values ('00000000-0000-4000-8000-000000000001', 'NSCC Gift Exchange', 'NSCC2026') on conflict (id) do nothing;

alter table public.participants add column event_id uuid references public.events(id) on delete cascade;
update public.participants set event_id = '00000000-0000-4000-8000-000000000001';
alter table public.participants alter column event_id set not null;
alter table public.participants drop constraint participants_email_key;
alter table public.participants add unique(event_id, email);
alter table public.participants add unique(event_id, id);
create index participants_edit_token_idx on public.participants(edit_token_hash);

alter table public.assignments add column event_id uuid references public.events(id) on delete cascade;
alter table public.assignments add column emailed_at timestamptz;
alter table public.assignments add column email_claimed_at timestamptz;
update public.assignments set event_id = '00000000-0000-4000-8000-000000000001';
-- Historical mail status is unknown. Review existing assignments before using
-- Send pending emails; this may send another copy of an old assignment.
alter table public.assignments alter column event_id set not null;
alter table public.assignments add foreign key (event_id, giver_id) references public.participants(event_id, id) on delete cascade;
alter table public.assignments add foreign key (event_id, recipient_id) references public.participants(event_id, id) on delete cascade;
create index assignments_event_idx on public.assignments(event_id);
alter table public.events enable row level security;
-- event_settings is retained as an unused backup of the original settings.

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

-- One transaction prevents double draws and incomplete assignment records.
create or replace function public.commit_draw(target_event uuid, pairs jsonb) returns void
language plpgsql set search_path = public as $$
declare e public.events; n integer;
begin
  select * into e from public.events where id = target_event for update;
  if not found or e.assignments_generated then raise exception 'Draw already generated or event missing'; end if;
  select count(*) into n from public.participants where event_id = target_event;
  if n < 3 or jsonb_array_length(pairs) <> n then raise exception 'Participant list changed'; end if;
  insert into public.assignments(event_id, giver_id, recipient_id)
    select target_event, x.giver_id, x.recipient_id
    from jsonb_to_recordset(pairs) as x(giver_id uuid, recipient_id uuid);
  -- Composite foreign keys and uniqueness require exactly the event's current people.
  if exists (select 1 from public.assignments a join public.assignments b
      on a.giver_id = b.recipient_id and a.recipient_id = b.giver_id
      where a.event_id = target_event and b.event_id = target_event) then
    raise exception 'Reciprocal assignments are not allowed';
  end if;
  update public.events set assignments_generated = true, registration_open = false, updated_at = now() where id = target_event;
end;
$$;

-- Concurrent send requests claim different rows. Expired claims can be retried
-- after an interrupted Vercel invocation without ever regenerating a draw.
create or replace function public.claim_assignment_emails(target_event uuid)
returns table(id uuid, giver_id uuid, recipient_id uuid)
language sql set search_path = public as $$
  update public.assignments a set email_claimed_at = now()
  where a.id in (
    select s.id from public.assignments s where s.event_id = target_event
      and s.emailed_at is null
      and (s.email_claimed_at is null or s.email_claimed_at < now() - interval '2 minutes')
    order by s.id for update skip locked limit 5
  ) returning a.id, a.giver_id, a.recipient_id;
$$;

-- These functions are server-only; browser clients must never invoke them.
revoke all on function public.guard_registration() from public, anon, authenticated;
revoke all on function public.commit_draw(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.claim_assignment_emails(uuid) from public, anon, authenticated;
grant execute on function public.guard_registration() to service_role;
grant execute on function public.commit_draw(uuid, jsonb) to service_role;
grant execute on function public.claim_assignment_emails(uuid) to service_role;

commit;
