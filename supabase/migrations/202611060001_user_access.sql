-- Aplicar apenas no ambiente autorizado, após conferir a conta responsável.
begin;

create table public.user_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'reader')),
  can_manage_users boolean not null default false,
  check (not can_manage_users or role = 'admin')
);
alter table public.user_access enable row level security;
revoke all on public.user_access from public, anon, authenticated;

-- A concessão inicial acontece uma única vez. Novas contas não herdam acesso.
insert into public.user_access(user_id, role, can_manage_users)
select id, 'admin', coalesce(lower(email) = 'danilohumberto@cifraengenharia.com.br', false)
from auth.users;
do $$
begin
  if (select count(*) from public.user_access where can_manage_users) <> 1 then
    raise exception 'A conta responsável deve existir exatamente uma vez antes da migration';
  end if;
end $$;

create function public.get_my_access() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('role', role, 'canManageUsers', can_manage_users)
  from public.user_access where user_id = auth.uid();
$$;
revoke all on function public.get_my_access() from public, anon;
grant execute on function public.get_my_access() to authenticated;

-- Usada dentro das RPCs SECURITY DEFINER; não exposta aos clientes.
create function public.assert_app_access(required_role text default null) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.user_access
    where user_id = auth.uid() and (required_role is null or role = required_role)
  ) then
    raise exception 'Acesso não autorizado' using errcode = '42501';
  end if;
end $$;
revoke all on function public.assert_app_access(text) from public, anon, authenticated;

create function public.list_app_users() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((public.get_my_access()->>'canManageUsers')::boolean, false) then
    raise exception 'Acesso não autorizado' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', u.id, 'email', coalesce(u.email, ''), 'role', a.role,
    'canManageUsers', coalesce(a.can_manage_users, false)
  ) order by u.email) from auth.users u left join public.user_access a on a.user_id = u.id), '[]'::jsonb);
end $$;
revoke all on function public.list_app_users() from public, anon;
grant execute on function public.list_app_users() to authenticated;

create function public.set_user_role(target_user uuid, new_role text, only_if_missing boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce((public.get_my_access()->>'canManageUsers')::boolean, false) then
    raise exception 'Acesso não autorizado' using errcode = '42501';
  end if;
  if new_role is null or new_role not in ('admin', 'reader') then
    raise exception 'Perfil inválido';
  end if;
  if exists(select 1 from public.user_access where user_id = target_user and can_manage_users) then
    raise exception 'O perfil da conta responsável não pode ser alterado';
  end if;
  if not exists(select 1 from auth.users where id = target_user) then
    raise exception 'Usuário não encontrado';
  end if;
  if only_if_missing then
    insert into public.user_access(user_id, role) values(target_user, new_role)
    on conflict(user_id) do nothing;
  else
    insert into public.user_access(user_id, role) values(target_user, new_role)
    on conflict(user_id) do update set role = excluded.role;
  end if;
end $$;
revoke all on function public.set_user_role(uuid,text,boolean) from public, anon;
grant execute on function public.set_user_role(uuid,text,boolean) to authenticated;

-- Consultas diretas também exigem um perfil atribuído. Histórico só para admin.
alter policy authenticated_read on public.base_revision using(public.get_my_access() is not null);
alter policy authenticated_read on public.employees using(public.get_my_access() is not null);
alter policy authenticated_read on public.contracts using(public.get_my_access() is not null);
alter policy authenticated_read on public.time_records using(public.get_my_access() is not null);
alter policy authenticated_read on public.schedules using(public.get_my_access() is not null);
alter policy authenticated_read on public.import_history using(public.get_my_access()->>'role' = 'admin');

create or replace function public.save_schedule(item jsonb,expected_revision bigint) returns void language plpgsql security definer set search_path='' as $$
declare current_revision bigint; day jsonb; period jsonb; starts integer; ends integer; previous_end integer; first_start integer; sid uuid; k text;
begin
 perform public.assert_app_access('admin');
 select revision into current_revision from public.base_revision where id for update;
 if expected_revision is null or expected_revision<>current_revision then raise exception 'A base mudou. Atualize antes de salvar.' using errcode='40001'; end if;
 if jsonb_typeof(item) is distinct from 'object' then raise exception 'Jornada inválida'; end if;
 if item-array['id','label','target','targetId','week']<>'{}'::jsonb then raise exception 'Campos não permitidos na jornada'; end if;
 foreach k in array array['id','label','target','targetId'] loop
  if jsonb_typeof(item->k) is distinct from 'string' or trim(item->>k)='' then raise exception 'Campo obrigatório: %',k; end if;
 end loop;
 if item->>'target' not in ('contract','employee') then raise exception 'Destino inválido'; end if;
 if item->>'target'='contract' and not exists(select 1 from public.contracts where id=item->>'targetId') then raise exception 'Contrato inexistente'; end if;
 if item->>'target'='employee' and not exists(select 1 from public.employees where id=item->>'targetId') then raise exception 'Colaborador inexistente'; end if;
 sid:=(item->>'id')::uuid;
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
 if exists(select 1 from public.schedules s where s.id<>sid and s.target=item->>'target' and s.target_id=item->>'targetId') then raise exception 'Já existe uma jornada para este destino. Edite a jornada cadastrada.'; end if;
 insert into public.schedules(id,target,target_id,payload) values(sid,item->>'target',item->>'targetId',item) on conflict(id) do update set target=excluded.target,target_id=excluded.target_id,payload=excluded.payload;
 update public.base_revision set revision=revision+1 where id;
end $$;

create or replace function public.import_records_incremental(incoming jsonb, expected_revision bigint)
returns void language plpgsql security definer set search_path='' as $$
declare
  current_revision bigint;
  item jsonb;
  added integer;
  changed integer;
begin
  perform public.assert_app_access('admin');

  select revision into current_revision from public.base_revision where id for update;
  if expected_revision is null or expected_revision<>current_revision then
    raise exception 'A base mudou. Atualize e tente importar novamente.' using errcode='40001';
  end if;
  if jsonb_typeof(incoming) is distinct from 'array' then
    raise exception 'Lista de registros inválida';
  end if;
  if jsonb_array_length(incoming)=0 or jsonb_array_length(incoming)>50000 then
    raise exception 'Importe de 1 a 50.000 registros';
  end if;

  -- O arquivo completo já chegou; nenhum registro antigo é removido na validação.
  for item in select value from jsonb_array_elements(incoming) loop
    perform public.assert_record(item);
  end loop;
  if exists (
    select 1 from jsonb_array_elements(incoming) x
    group by x->>'employeeId',x->>'date' having count(*)>1
  ) then raise exception 'Matrícula/data duplicada'; end if;

  select count(*) filter(where r.employee_id is null),
         count(*) filter(where r.employee_id is not null and r.payload<>x)
  into added,changed
  from jsonb_array_elements(incoming) x
  left join public.time_records r
    on r.employee_id=x->>'employeeId' and r.logical_date=(x->>'date')::date;
  insert into public.employees(id,name)
    select distinct on (x->>'employeeId') x->>'employeeId',x->>'name'
    from jsonb_array_elements(incoming) x
    order by x->>'employeeId',x->>'date' desc
    on conflict(id) do update set name=excluded.name;
  insert into public.contracts(id)
    select distinct x->>'contract' from jsonb_array_elements(incoming) x
    on conflict do nothing;
  insert into public.time_records(employee_id,logical_date,contract_id,payload)
    select x->>'employeeId',(x->>'date')::date,x->>'contract',x
    from jsonb_array_elements(incoming) x
    on conflict(employee_id,logical_date) do update
    set contract_id=excluded.contract_id,payload=excluded.payload;

  -- Confirmar no próprio banco que a nova base foi gravada inteira e sem mudanças.
  if exists (
    select 1 from jsonb_array_elements(incoming) x
    left join public.time_records r
      on r.employee_id=x->>'employeeId' and r.logical_date=(x->>'date')::date
    where r.employee_id is null or r.payload is distinct from x
      or r.contract_id is distinct from x->>'contract'
  ) then raise exception 'A nova base não foi gravada integralmente'; end if;

  insert into public.import_history(actor,mode,inserted,updated,removed)
    values(auth.uid(),'merge',added,changed,0);
  update public.base_revision set revision=revision+1 where id;
  -- A transação confirma tudo junto. Qualquer erro desfaz todas as gravações.
end $$;

create or replace function public.delete_schedule(schedule_id uuid, expected_revision bigint)
returns void language plpgsql security definer set search_path='' as $$
declare current_revision bigint;
begin
  perform public.assert_app_access('admin');
  select revision into current_revision from public.base_revision where id for update;
  if expected_revision is null or expected_revision <> current_revision then
    raise exception 'A base mudou. Atualize antes de excluir.' using errcode='40001';
  end if;
  delete from public.schedules where id = schedule_id;
  if not found then
    raise exception 'Jornada não encontrada. Atualize a base.';
  end if;
  update public.base_revision set revision = revision + 1 where id;
end $$;

create or replace function public.reset_base(expected_revision bigint)
returns void language plpgsql security definer set search_path='' as $$
declare current_revision bigint;
begin
  perform public.assert_app_access('admin');
  select revision into current_revision from public.base_revision where id for update;
  if expected_revision is null or current_revision is null or expected_revision <> current_revision then
    raise exception 'A base mudou. Atualize e confirme a limpeza novamente.' using errcode='40001';
  end if;
  delete from public.time_records where employee_id is not null;
  -- Jornadas de contratos e exceções individuais são preservadas.
  delete from public.import_history where id is not null;
  delete from public.employees where id is not null;
  delete from public.contracts where id is not null;
  -- Nunca zerar a revisão: clientes antigos precisam continuar sendo recusados.
  update public.base_revision set revision = revision + 1 where id;
end $$;

create or replace function public.read_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.assert_app_access();
 return jsonb_build_object(
  'revision',(select revision from public.base_revision where id),
  'records',coalesce((select jsonb_agg(payload order by logical_date,employee_id) from public.time_records),'[]'::jsonb),
  'schedules',coalesce((select jsonb_agg(payload order by target,target_id,id) from public.schedules),'[]'::jsonb),
  'imports',case when public.get_my_access()->>'role' = 'admin' then coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'createdAt',h.created_at,'actor',h.actor::text,'actorName',coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'),''),nullif(trim(u.raw_user_meta_data->>'name'),''),nullif(split_part(u.email,'@',1),''),'Usuário indisponível'),'mode',mode,'inserted',inserted,'updated',updated,'removed',removed) order by h.created_at desc) from public.import_history h left join auth.users u on u.id=h.actor),'[]'::jsonb) else '[]'::jsonb end
 );
end $$;

commit;
