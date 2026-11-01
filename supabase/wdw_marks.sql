-- Shared annotations for the Disney 5-day plan page (one row per item per person).
-- Applied to Supabase project "Gembox" (lvqexlphajdruidoapdu) as migration wdw_marks_shared_annotations.
create table if not exists public.wdw_marks (
  trip       text        not null default 'wdw-2026-11' check (trip = 'wdw-2026-11'),
  item_id    text        not null check (length(item_id) between 1 and 40),
  person     text        not null check (length(person) between 1 and 20),
  checked    boolean     not null default false,
  fav        boolean     not null default false,
  note       text        not null default '' check (length(note) <= 500),
  updated_at timestamptz not null default now(),
  primary key (trip, item_id, person)
);

comment on table public.wdw_marks is 'Disney trip plan: per-person ticks, stars and notes. Written anonymously by family members through the static page.';

alter table public.wdw_marks enable row level security;

-- Anyone with the public key may read/insert/update rows of this trip. No delete.
create policy "wdw_marks_anon_select" on public.wdw_marks
  for select to anon using (trip = 'wdw-2026-11');
create policy "wdw_marks_anon_insert" on public.wdw_marks
  for insert to anon with check (trip = 'wdw-2026-11');
create policy "wdw_marks_anon_update" on public.wdw_marks
  for update to anon using (trip = 'wdw-2026-11') with check (trip = 'wdw-2026-11');

grant select, insert, update on public.wdw_marks to anon;

-- Keep updated_at honest and cap the table so the public key cannot be used to fill the database.
create or replace function public.wdw_marks_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.wdw_marks) >= 5000 then
    raise exception 'wdw_marks is full' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists wdw_marks_guard on public.wdw_marks;
create trigger wdw_marks_guard
  before insert or update on public.wdw_marks
  for each row execute function public.wdw_marks_guard();
