-- Enriquece o histórico com o nome atual do autor; mantém actor como identificador.
begin;

create or replace function public.read_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
 return jsonb_build_object(
  'revision',(select revision from public.base_revision where id),
  'records',coalesce((select jsonb_agg(payload order by logical_date,employee_id) from public.time_records),'[]'::jsonb),
  'schedules',coalesce((select jsonb_agg(payload order by valid_from) from public.schedules),'[]'::jsonb),
  'imports',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'createdAt',h.created_at,'actor',h.actor::text,'actorName',coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'),''),nullif(trim(u.raw_user_meta_data->>'name'),''),nullif(split_part(u.email,'@',1),''),'Usuário indisponível'),'mode',mode,'inserted',inserted,'updated',updated,'removed',removed) order by h.created_at desc) from public.import_history h left join auth.users u on u.id=h.actor),'[]'::jsonb)
 );
end $$;

revoke all on function public.read_snapshot() from public,anon;
grant execute on function public.read_snapshot() to authenticated;

commit;
