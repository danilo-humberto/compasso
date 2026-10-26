-- Preparada localmente. Aplicar somente em ambiente explicitamente autorizado.
create table public.base_revision (id boolean primary key default true check(id), revision bigint not null default 0);
insert into public.base_revision values (true,0);
create table public.employees (id text primary key, name text not null);
create table public.contracts (id text primary key);
create table public.time_records (
 employee_id text not null references public.employees(id),
 logical_date date not null,
 contract_id text not null references public.contracts(id),
 payload jsonb not null,
 primary key(employee_id,logical_date)
);
create table public.schedules (
 id uuid primary key,
 target text not null check(target in ('contract','employee')),
 target_id text not null,
 valid_from date not null,
 valid_to date,
 payload jsonb not null,
 check(valid_to is null or valid_to>=valid_from)
);
create table public.import_history (
 id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
 actor uuid not null, mode text not null check(mode in ('merge','replace')),
 inserted integer not null, updated integer not null, removed integer not null
);

alter table public.base_revision enable row level security;
alter table public.employees enable row level security;
alter table public.contracts enable row level security;
alter table public.time_records enable row level security;
alter table public.schedules enable row level security;
alter table public.import_history enable row level security;
create policy authenticated_read on public.base_revision for select to authenticated using(auth.uid() is not null);
create policy authenticated_read on public.employees for select to authenticated using(auth.uid() is not null);
create policy authenticated_read on public.contracts for select to authenticated using(auth.uid() is not null);
create policy authenticated_read on public.time_records for select to authenticated using(auth.uid() is not null);
create policy authenticated_read on public.schedules for select to authenticated using(auth.uid() is not null);
create policy authenticated_read on public.import_history for select to authenticated using(auth.uid() is not null);
revoke all on public.base_revision,public.employees,public.contracts,public.time_records,public.schedules,public.import_history from anon,authenticated;
grant select on public.base_revision,public.employees,public.contracts,public.time_records,public.schedules,public.import_history to authenticated;

create function public.assert_record(item jsonb) returns void language plpgsql set search_path='' as $$
declare p jsonb; k text;
begin
 if jsonb_typeof(item) is distinct from 'object' then raise exception 'Registro inválido'; end if;
 if item - array['employeeId','name','contract','date','punchedDate','punches','sourceSchedule'] <> '{}'::jsonb then raise exception 'Campos não permitidos no registro'; end if;
 foreach k in array array['employeeId','name','contract','date','punchedDate','sourceSchedule'] loop
  if jsonb_typeof(item->k) is distinct from 'string' then raise exception 'Campo de texto obrigatório: %',k; end if;
 end loop;
 if trim(item->>'employeeId')='' or trim(item->>'name')='' or trim(item->>'contract')='' then raise exception 'Identificação obrigatória'; end if;
 if (item->>'date') !~ '^\d{4}-\d{2}-\d{2}$' or (item->>'punchedDate') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Data inválida'; end if;
 perform (item->>'date')::date, (item->>'punchedDate')::date;
 if jsonb_typeof(item->'punches') is distinct from 'array' then raise exception 'Batidas inválidas'; end if;
 if jsonb_array_length(item->'punches')<>4 then raise exception 'Esperados quatro campos de batida'; end if;
 for p in select value from jsonb_array_elements(item->'punches') loop
  if p='null'::jsonb then continue; end if;
  if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'at') is distinct from 'string' or jsonb_typeof(p->'marked') is distinct from 'boolean' then raise exception 'Batida inválida'; end if;
  if p-array['at','marked']<>'{}'::jsonb or (p->>'at') !~ '^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$' then raise exception 'Horário inválido'; end if;
  perform (p->>'at')::timestamp;
 end loop;
end $$;

create function public.read_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
 return jsonb_build_object(
  'revision',(select revision from public.base_revision where id),
  'records',coalesce((select jsonb_agg(payload order by logical_date,employee_id) from public.time_records),'[]'::jsonb),
  'schedules',coalesce((select jsonb_agg(payload order by valid_from) from public.schedules),'[]'::jsonb),
  'imports',coalesce((select jsonb_agg(jsonb_build_object('id',id,'createdAt',created_at,'actor',actor::text,'mode',mode,'inserted',inserted,'updated',updated,'removed',removed) order by created_at desc) from public.import_history),'[]'::jsonb)
 );
end $$;

create function public.import_records(incoming jsonb,import_mode text,expected_revision bigint) returns void language plpgsql security definer set search_path='' as $$
declare current_revision bigint; item jsonb; added integer; changed integer; deleted integer;
begin
 if auth.uid() is null then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
 select revision into current_revision from public.base_revision where id for update;
 if expected_revision is null or expected_revision<>current_revision then raise exception 'A base mudou. Atualize e gere uma nova prévia.' using errcode='40001'; end if;
 if import_mode is null or import_mode not in ('merge','replace') then raise exception 'Modo inválido'; end if;
 if jsonb_typeof(incoming) is distinct from 'array' then raise exception 'Lista de registros inválida'; end if;
 if jsonb_array_length(incoming)=0 or jsonb_array_length(incoming)>50000 then raise exception 'Importe de 1 a 50.000 registros'; end if;
 for item in select value from jsonb_array_elements(incoming) loop perform public.assert_record(item); end loop;
 if exists(select 1 from jsonb_array_elements(incoming) x group by x->>'employeeId',x->>'date' having count(*)>1) then raise exception 'Matrícula/data duplicada'; end if;
 select count(*) filter(where r.employee_id is null),count(*) filter(where r.employee_id is not null and r.payload<>x) into added,changed from jsonb_array_elements(incoming) x left join public.time_records r on r.employee_id=x->>'employeeId' and r.logical_date=(x->>'date')::date;
 deleted:=0;
 if import_mode='replace' then
  select count(*) into deleted from public.time_records r where not exists(select 1 from jsonb_array_elements(incoming) x where x->>'employeeId'=r.employee_id and (x->>'date')::date=r.logical_date);
  delete from public.time_records;
 end if;
 insert into public.employees(id,name) select distinct on (x->>'employeeId') x->>'employeeId',x->>'name' from jsonb_array_elements(incoming) x order by x->>'employeeId',x->>'date' desc on conflict(id) do update set name=excluded.name;
 insert into public.contracts(id) select distinct x->>'contract' from jsonb_array_elements(incoming) x on conflict do nothing;
 insert into public.time_records(employee_id,logical_date,contract_id,payload) select x->>'employeeId',(x->>'date')::date,x->>'contract',x from jsonb_array_elements(incoming) x on conflict(employee_id,logical_date) do update set contract_id=excluded.contract_id,payload=excluded.payload;
 insert into public.import_history(actor,mode,inserted,updated,removed) values(auth.uid(),import_mode,added,changed,deleted);
 update public.base_revision set revision=revision+1 where id;
end $$;

create function public.save_schedule(item jsonb,expected_revision bigint) returns void language plpgsql security definer set search_path='' as $$
declare current_revision bigint; day jsonb; period jsonb; starts integer; ends integer; previous_end integer; first_start integer; dfrom date; dto date; sid uuid; k text;
begin
 if auth.uid() is null then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
 select revision into current_revision from public.base_revision where id for update;
 if expected_revision is null or expected_revision<>current_revision then raise exception 'A base mudou. Atualize antes de salvar.' using errcode='40001'; end if;
 if jsonb_typeof(item) is distinct from 'object' then raise exception 'Jornada inválida'; end if;
 if item-array['id','label','target','targetId','from','to','week']<>'{}'::jsonb then raise exception 'Campos não permitidos na jornada'; end if;
 foreach k in array array['id','label','target','targetId','from'] loop
  if jsonb_typeof(item->k) is distinct from 'string' or trim(item->>k)='' then raise exception 'Campo obrigatório: %',k; end if;
 end loop;
 if item->>'target' not in ('contract','employee') or not(item?'to') then raise exception 'Destino ou vigência inválidos'; end if;
 if item->>'target'='contract' and not exists(select 1 from public.contracts where id=item->>'targetId') then raise exception 'Contrato inexistente'; end if;
 if item->>'target'='employee' and not exists(select 1 from public.employees where id=item->>'targetId') then raise exception 'Colaborador inexistente'; end if;
 sid:=(item->>'id')::uuid; dfrom:=(item->>'from')::date; dto:=(item->>'to')::date;
 if (item->>'from') !~ '^\d{4}-\d{2}-\d{2}$' or (item->>'to' is not null and (item->>'to') !~ '^\d{4}-\d{2}-\d{2}$') or dto<dfrom then raise exception 'Vigência inválida'; end if;
 if jsonb_typeof(item->'week') is distinct from 'array' then raise exception 'Semana inválida'; end if;
 if jsonb_array_length(item->'week')<>7 then raise exception 'Esperados sete dias'; end if;
 for day in select value from jsonb_array_elements(item->'week') loop
  if jsonb_typeof(day) is distinct from 'array' then raise exception 'Dia inválido'; end if;
  if jsonb_array_length(day)>2 then raise exception 'Use até dois períodos'; end if;
  previous_end:=-1; first_start:=null;
  for period in select value from jsonb_array_elements(day) loop
   if jsonb_typeof(period) is distinct from 'object' or jsonb_typeof(period->'start') is distinct from 'string' or jsonb_typeof(period->'end') is distinct from 'string' then raise exception 'Período inválido'; end if;
   if period-array['start','end']<>'{}'::jsonb or (period->>'start') !~ '^([01]\d|2[0-3]):[0-5]\d$' or (period->>'end') !~ '^([01]\d|2[0-3]):[0-5]\d$' or period->>'start'=period->>'end' then raise exception 'Horários inválidos'; end if;
   starts:=extract(hour from (period->>'start')::time)*60+extract(minute from (period->>'start')::time);
   ends:=extract(hour from (period->>'end')::time)*60+extract(minute from (period->>'end')::time);
   if ends<starts then ends:=ends+1440; end if;
   if first_start is null then first_start:=starts; end if;
   while starts<previous_end loop starts:=starts+1440; ends:=ends+1440; end loop;
   if ends-first_start>1440 then raise exception 'Períodos sobrepostos ou superiores a 24 horas'; end if;
   previous_end:=ends;
  end loop;
 end loop;
 if exists(select 1 from public.schedules s where s.id<>sid and s.target=item->>'target' and s.target_id=item->>'targetId' and s.valid_from<=coalesce(dto,'9999-12-31'::date) and dfrom<=coalesce(s.valid_to,'9999-12-31'::date)) then raise exception 'Vigência sobreposta'; end if;
 insert into public.schedules(id,target,target_id,valid_from,valid_to,payload) values(sid,item->>'target',item->>'targetId',dfrom,dto,item) on conflict(id) do update set target=excluded.target,target_id=excluded.target_id,valid_from=excluded.valid_from,valid_to=excluded.valid_to,payload=excluded.payload;
 update public.base_revision set revision=revision+1 where id;
end $$;

revoke all on function public.assert_record(jsonb) from public,anon,authenticated;
revoke all on function public.read_snapshot() from public,anon;
revoke all on function public.import_records(jsonb,text,bigint) from public,anon;
revoke all on function public.save_schedule(jsonb,bigint) from public,anon;
grant execute on function public.read_snapshot(),public.import_records(jsonb,text,bigint),public.save_schedule(jsonb,bigint) to authenticated;
