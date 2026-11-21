begin;
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160)
);
create index on public.projects(owner_id);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  kind text not null check (kind in ('Dotace', 'Veřejná sbírka', 'Vlastní prostředky', 'Dar')),
  budget bigint not null check (budget between 1 and 99999999999),
  deadline date,
  unique (project_id, id)
);
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  reference text not null check (length(trim(reference)) between 1 and 100),
  purpose text not null check (length(trim(purpose)) between 1 and 300),
  issue_date date not null,
  paid_on date,
  total bigint not null check (total between 1 and 99999999999),
  unique (project_id, id),
  unique (project_id, reference)
);
create table public.allocations (
  project_id uuid not null,
  document_id uuid not null,
  source_id uuid not null,
  category text not null check (length(trim(category)) between 1 and 160),
  amount bigint not null check (amount between 1 and 99999999999),
  foreign key (project_id, document_id) references public.documents(project_id, id) on delete cascade,
  foreign key (project_id, source_id) references public.sources(project_id, id) on delete cascade,
  primary key (project_id, document_id, source_id)
);
create index on public.allocations(project_id, source_id);

alter table public.projects enable row level security;
alter table public.sources enable row level security;
alter table public.documents enable row level security;
alter table public.allocations enable row level security;

create policy own_projects on public.projects to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy own_sources on public.sources to authenticated
using (exists (select 1 from public.projects p where p.id = project_id))
with check (exists (select 1 from public.projects p where p.id = project_id));
create policy own_documents on public.documents for select to authenticated
using (exists (select 1 from public.projects p where p.id = project_id));
create policy own_document_payments on public.documents for update to authenticated
using (exists (select 1 from public.projects p where p.id = project_id))
with check (exists (select 1 from public.projects p where p.id = project_id));
create policy own_allocations on public.allocations for select to authenticated
using (exists (select 1 from public.projects p where p.id = project_id));

revoke all on public.projects, public.sources, public.documents, public.allocations from anon, authenticated, public;
grant select on public.projects, public.sources, public.documents, public.allocations to authenticated;
grant insert on public.projects, public.sources to authenticated;
grant update (paid_on) on public.documents to authenticated;

create function public.save_document(
  p_project uuid, p_reference text, p_purpose text, p_issue_date date,
  p_paid_on date, p_total bigint, p_allocations jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_id uuid;
  line record;
  assigned numeric;
begin
  -- Serializuje uložení dokladů v projektu i při více otevřených kartách.
  perform 1 from public.projects where id = p_project and owner_id = auth.uid() for update;
  if not found then raise exception 'Projekt není dostupný.'; end if;

  select coalesce(sum(amount), 0) into assigned
    from jsonb_to_recordset(p_allocations) as x(source_id uuid, amount bigint, category text);
  if assigned <> p_total then raise exception 'Rozdělení musí odpovídat částce dokladu.'; end if;

  insert into public.documents(project_id, reference, purpose, issue_date, paid_on, total)
    values (p_project, trim(p_reference), trim(p_purpose), p_issue_date, p_paid_on, p_total)
    returning id into new_id;

  for line in select * from jsonb_to_recordset(p_allocations)
    as x(source_id uuid, amount bigint, category text)
  loop
    if not exists (
      select 1 from public.sources s
      where s.project_id = p_project and s.id = line.source_id
        and s.budget >= line.amount + (
          select coalesce(sum(a.amount), 0) from public.allocations a
          where a.project_id = p_project and a.source_id = s.id
        )
    ) then raise exception 'Zdroj v tomto projektu chybí nebo by byl překročen jeho rozpočet.'; end if;

    insert into public.allocations(project_id, document_id, source_id, category, amount)
      values (p_project, new_id, line.source_id, trim(line.category), line.amount);
  end loop;
  return new_id;
end;
$$;
revoke all on function public.save_document(uuid,text,text,date,date,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.save_document(uuid,text,text,date,date,bigint,jsonb) to authenticated;
commit;
