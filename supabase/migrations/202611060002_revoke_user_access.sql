-- Revoga somente a permissão do aplicativo; preserva conta e histórico.
begin;

create function public.revoke_user_access(target_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce((public.get_my_access()->>'canManageUsers')::boolean, false) then
    raise exception 'Acesso não autorizado' using errcode = '42501';
  end if;
  if exists(select 1 from public.user_access where user_id = target_user and can_manage_users) then
    raise exception 'O acesso da conta responsável não pode ser revogado';
  end if;
  if target_user is null or not exists(select 1 from auth.users where id = target_user) then
    raise exception 'Usuário não encontrado';
  end if;
  delete from public.user_access where user_id = target_user and not can_manage_users;
end $$;
revoke all on function public.revoke_user_access(uuid) from public, anon;
grant execute on function public.revoke_user_access(uuid) to authenticated;

commit;
