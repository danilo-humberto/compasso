-- Aplicar pelo responsável no ambiente autorizado, após validação e backup.
-- Instala a operação; aplicar esta migration não apaga a base.
begin;

create function public.reset_base(expected_revision bigint)
returns void language plpgsql security definer set search_path='' as $$
declare current_revision bigint;
begin
  if auth.uid() is null then
    raise exception 'Acesso não autorizado' using errcode='42501';
  end if;
  select revision into current_revision from public.base_revision where id for update;
  if expected_revision is null or current_revision is null or expected_revision <> current_revision then
    raise exception 'A base mudou. Atualize e confirme a limpeza novamente.' using errcode='40001';
  end if;
  delete from public.time_records;
  -- Jornadas de contratos e exceções individuais são preservadas.
  delete from public.import_history;
  delete from public.employees;
  delete from public.contracts;
  -- Nunca zerar a revisão: clientes antigos precisam continuar sendo recusados.
  update public.base_revision set revision = revision + 1 where id;
end $$;

revoke all on function public.reset_base(bigint) from public,anon;
grant execute on function public.reset_base(bigint) to authenticated;
commit;
