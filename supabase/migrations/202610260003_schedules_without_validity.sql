-- Aplicar pelo responsável após backup recuperável e validação local.
-- Caso existam destinos duplicados, a transação é abortada sem escolher ou apagar jornadas.
begin;
lock table public.base_revision, public.schedules in exclusive mode;
do $$
begin
 if exists(select 1 from public.schedules group by target,target_id having count(*)>1) then
   raise exception 'Existem várias jornadas para o mesmo destino. Escolha qual manter antes de remover a vigência.';
 end if;
end $$;
alter table public.schedules add constraint schedules_unique_target unique(target,target_id);
update public.schedules set payload=payload-'from'-'to';
alter table public.schedules drop column valid_from, drop column valid_to;
update public.base_revision set revision=revision+1 where id;

create or replace function public.save_schedule(item jsonb,expected_revision bigint) returns void language plpgsql security definer set search_path='' as $$
declare current_revision bigint; day jsonb; period jsonb; starts integer; ends integer; previous_end integer; first_start integer; sid uuid; k text;
begin
 if auth.uid() is null then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
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

create or replace function public.read_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
 return jsonb_build_object(
  'revision',(select revision from public.base_revision where id),
  'records',coalesce((select jsonb_agg(payload order by logical_date,employee_id) from public.time_records),'[]'::jsonb),
  'schedules',coalesce((select jsonb_agg(payload order by target,target_id,id) from public.schedules),'[]'::jsonb),
  'imports',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'createdAt',h.created_at,'actor',h.actor::text,'actorName',coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'),''),nullif(trim(u.raw_user_meta_data->>'name'),''),nullif(split_part(u.email,'@',1),''),'Usuário indisponível'),'mode',mode,'inserted',inserted,'updated',updated,'removed',removed) order by h.created_at desc) from public.import_history h left join auth.users u on u.id=h.actor),'[]'::jsonb)
 );
end $$;

commit;
