-- Aplicar pelo responsável no ambiente autorizado, após validação local.
begin;

create function public.delete_schedule(schedule_id uuid, expected_revision bigint)
returns void language plpgsql security definer set search_path='' as $$
declare current_revision bigint;
begin
  if auth.uid() is null then
    raise exception 'Acesso não autorizado' using errcode='42501';
  end if;
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

revoke all on function public.delete_schedule(uuid,bigint) from public,anon;
grant execute on function public.delete_schedule(uuid,bigint) to authenticated;

commit;
