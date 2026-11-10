-- Run once on an existing multi-event database before deploying this feature.
begin;
alter table public.events add column forced_pairs jsonb not null default '[]'::jsonb
  check (jsonb_typeof(forced_pairs) = 'array');

-- Validate the current saved pairings under the same event lock as the draw.
-- This also prevents a concurrent admin update from being silently ignored.
create or replace function public.commit_draw(target_event uuid, pairs jsonb) returns void
language plpgsql set search_path = public as $$
declare e public.events; n integer;
begin
  select * into e from public.events where id = target_event for update;
  if not found or e.assignments_generated then raise exception 'Draw already generated or event missing'; end if;
  select count(*) into n from public.participants where event_id = target_event;
  if n < 3 or jsonb_array_length(pairs) <> n then raise exception 'Participant list changed'; end if;
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
  update public.events set assignments_generated = true, registration_open = false, updated_at = now() where id = target_event;
end;
$$;
revoke all on function public.commit_draw(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.commit_draw(uuid, jsonb) to service_role;
commit;
