-- Cristian (17 nov 2026): al borrar a una persona (MCP «borrar_miembro» o el panel de Supabase), su nombre se queda en
-- todo el historial. Antes, perfiles.id → auth.users era «on delete cascade»: al borrar la cuenta se borraba el perfil,
-- grabaciones, llamadas, citas y ventas se quedaban sin nombre (set null) y se perdían sus liquidaciones, reportes,
-- objetivos y permisos (cascade). Pasó el 17 nov: Grabaciones se cayó con 5 grabaciones sin persona.
-- Ahora solo desaparece el acceso: el perfil se queda, de baja (como «dar de baja»).
alter table public.perfiles drop constraint if exists perfiles_id_fkey;

create or replace function public.baja_al_borrar_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.perfiles set activo = false where id = old.id;
  update public.miembros_equipo set activo = false where perfil_id = old.id;
  return old;
end $$;
revoke all on function public.baja_al_borrar_usuario() from public, anon, authenticated;

drop trigger if exists baja_al_borrar_usuario on auth.users;
create trigger baja_al_borrar_usuario after delete on auth.users
  for each row execute function public.baja_al_borrar_usuario();
