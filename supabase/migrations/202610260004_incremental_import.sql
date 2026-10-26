-- Importação incremental: mantém os registros ausentes do arquivo.
-- Renomear a RPC preserva as permissões e bloqueia clientes antigos de substituição.
begin;

alter function public.import_records(jsonb,bigint) rename to import_records_incremental;

create or replace function public.import_records_incremental(incoming jsonb, expected_revision bigint)
returns void language plpgsql security definer set search_path='' as $$
declare
  current_revision bigint;
  item jsonb;
  added integer;
  changed integer;
begin
  if auth.uid() is null then
    raise exception 'Acesso não autorizado' using errcode='42501';
  end if;

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

notify pgrst, 'reload schema';
commit;
