-- Run after 20261110_forced_pairs.sql on existing databases, before deployment.
begin;
alter table public.events add column draw_confirmed boolean not null default false;
alter table public.events add column draw_revision integer not null default 0;
-- Existing draws may already have been emailed. Keep them locked and sendable.
update public.events set draw_confirmed = true, draw_revision = 1 where assignments_generated;
alter table public.events add constraint confirmed_draw_exists check (not draw_confirmed or assignments_generated);

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
commit;
