-- Nova importação sempre substitui a base. A migration anterior permanece
-- como histórico; sua RPC com escolha de modo deixa de existir.
begin;

drop function public.import_records(jsonb,text,bigint);

create function public.import_records(incoming jsonb, expected_revision bigint)
returns void language plpgsql security definer set search_path='' as $$
declare
  current_revision bigint;
  item jsonb;
  added integer;
  changed integer;
  deleted integer;
begin
  if auth.uid() is null then
    raise exception 'Acesso não autorizado' using errcode='42501';
  end if;

  select revision into current_revision from public.base_revision where id for update;
  if expected_revision is null or expected_revision<>current_revision then
    raise exception 'A base mudou. Atualize e gere uma nova prévia.' using errcode='40001';
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
  select count(*) into deleted from public.time_records r
  where not exists (
    select 1 from jsonb_array_elements(incoming) x
    where x->>'employeeId'=r.employee_id and (x->>'date')::date=r.logical_date
  );

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

  -- Só depois dessa conferência, remover o que pertence exclusivamente à base antiga.
  delete from public.time_records r where not exists (
    select 1 from jsonb_array_elements(incoming) x
    where x->>'employeeId'=r.employee_id and (x->>'date')::date=r.logical_date
  );
  delete from public.employees e
    where not exists(select 1 from public.time_records r where r.employee_id=e.id);
  delete from public.contracts c
    where not exists(select 1 from public.time_records r where r.contract_id=c.id);

  if (select count(*) from public.time_records)<>jsonb_array_length(incoming) then
    raise exception 'Não foi possível concluir a substituição da base';
  end if;
  -- A coluna mode existe apenas para conservar a auditoria das importações antigas.
  insert into public.import_history(actor,mode,inserted,updated,removed)
    values(auth.uid(),'replace',added,changed,deleted);
  update public.base_revision set revision=revision+1 where id;
  -- A transação confirma tudo junto. Qualquer erro desfaz gravações e exclusões.
end $$;

revoke all on function public.import_records(jsonb,bigint) from public,anon;
grant execute on function public.import_records(jsonb,bigint) to authenticated;

commit;
