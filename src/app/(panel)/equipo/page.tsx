import Link from "next/link";
import { redirect } from "next/navigation";
import { Crown, KeyRound } from "lucide-react";
import { getSesion, puedeAdmin } from "@/lib/auth";
import { db } from "@/lib/datos";
import { puedeSeccion } from "@/lib/permisos";
import { cargarEquipo } from "@/lib/equipo";
import { Cabecera, Contenido, Seccion, Insignia } from "@/components/ui";
import { AltaMiembro } from "./alta";
import { ComisionRolForm, EditorAreas } from "./cliente";
import { FichaPersona } from "./ficha";
import type { Rol } from "@/lib/tipos";
import { pct } from "@/lib/formato";
import { MERCADOS, entraEnMercado, mercadoDe, mercadoValido } from "@/lib/mercado";
import { mercadosDelProyecto } from "@/lib/mercado-datos";
import { EtiquetaMercado, FiltroMercado } from "@/components/mercado-equipo";

const ROL_TXT: Record<string, string> = { ceo: "CEO", director: "Director", closer: "Closer", caller: "Caller" };

export default async function EquipoPage({ searchParams }: PageProps<"/equipo">) {
  const { perfil, proyecto } = await getSesion();
  if (!(await puedeSeccion(perfil, proyecto.id, "equipo"))) redirect("/");
  const sp = await searchParams;
  const verInactivos = sp.inactivos === "1";
  const [eq, mercados, { data: productos }] = await Promise.all([cargarEquipo(proyecto.id), mercadosDelProyecto(proyecto.id), db().from("productos").select("id, nombre, precio").eq("proyecto_id", proyecto.id).eq("activo", true).order("orden")]);
  // 13 nov: callers y closers se filtran y agrupan por mercado (España / Latam); el resto sale siempre
  const filtroM = mercadoValido(sp.mercado);
  const vende = (m: { rol: Rol | null }) => m.rol === "caller" || m.rol === "closer";
  const mercadoDeM = (m: { perfil_id: string | null }) => mercadoDe(m.perfil_id ? mercados[m.perfil_id] : null);
  const miembros = eq.miembros.filter((m) => m.activo !== verInactivos && (!vende(m) || entraEnMercado(mercados, m.perfil_id, filtroM)));
  const sinArea = miembros.filter((m) => !m.area_id || !eq.areas.some((a) => a.id === m.area_id));
  // Mismas reglas que el servidor (lib/auth.ts, arreglo 2): accesos de tu rol o inferior;
  // comisiones solo CEO y director, nunca la propia (salvo el CEO)
  const rango: Record<Rol, number> = { caller: 1, closer: 2, director: 3, ceo: 4 };
  const rolesQuePuedoDar = (["closer", "caller", "director", "ceo"] as Rol[]).filter((r) => rango[r] <= rango[perfil.rol]);
  const jefe = perfil.rol === "ceo" || perfil.rol === "director";
  const puedeComisionDe = (perfilId: string | null) => jefe && (perfil.rol === "ceo" || perfilId !== perfil.id);
  const puedeComisionRol = (r: Rol) => jefe && (perfil.rol === "ceo" || r !== perfil.rol);
  const puesto = (id: string | null) => eq.puestos.find((p) => p.id === id)?.nombre;
  const resumenComision = (m: (typeof miembros)[number]) => {
    if ((m.rol === "caller" || m.rol === "closer") && (m.comision_modo ?? "tramos") === "tramos") return "Tramos"; // bloque 4
    if (!m.comision) return null;
    const partes = [m.comision.pct_venta ? `${pct(m.comision.pct_venta)} venta` : "", m.comision.pct_agenda ? `${pct(m.comision.pct_agenda)} agenda` : "", m.comision.por_producto && Object.keys(m.comision.por_producto).length ? "por producto" : ""].filter(Boolean);
    return partes.length ? `Propia: ${partes.join(" · ")}` : null;
  };
  const tarjeta = (m: (typeof miembros)[number]) => (
    <li key={m.id} className="flex items-center gap-3 rounded-lg border border-borde bg-panel px-3 py-2">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-panel-2 text-sm font-semibold">{m.nombre.charAt(0).toUpperCase()}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
          {m.nombre}
          {m.lider && <span title="Líder del área"><Crown className="h-3.5 w-3.5 text-oro" /></span>}
          {vende(m) && <EtiquetaMercado m={mercadoDeM(m)} />}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-texto-3">
          {puesto(m.puesto_id) && <span>{puesto(m.puesto_id)}</span>}
          {m.rol ? <Insignia tono="primario">{ROL_TXT[m.rol]}</Insignia> : <span className="inline-flex items-center gap-1"><KeyRound className="h-3 w-3" />Sin acceso</span>}
          {resumenComision(m) && <span className="text-oro">{resumenComision(m)}</span>}
        </div>
      </div>
      {/* Bloque 5 de 1.0: la ficha completa (lo de más allá de datos y comisión, solo con Administración) */}
      <FichaPersona
        titulo={m.nombre}
        m={m}
        perfilId={m.perfil_id}
        admin={puedeAdmin(perfil)}
        abiertaAlInicio={!!m.perfil_id && sp.ficha === m.perfil_id}
        datos={{ areas: eq.areas, puestos: eq.puestos, productos: (productos ?? []).map((p) => ({ id: p.id, nombre: p.nombre })), rolesQuePuedoDar, puedeComision: puedeComisionDe(m.perfil_id) }}
      />
    </li>
  );

  // Fase 5: organigrama en árbol (CEO → directores → closers y callers). Pulsar el nombre abre su ficha.
  const nodo = (m: (typeof miembros)[number]) => (
    <div key={m.id} className="vidrio flex min-w-0 items-center gap-2.5 rounded-xl border border-borde px-3 py-2 shadow-sm">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primario-suave text-sm font-semibold text-primario">{m.nombre.charAt(0).toUpperCase()}</span>
      <div className="min-w-0">
        <div className="flex items-center gap-1 text-sm">
          <FichaPersona
            titulo={m.nombre}
            m={m}
            perfilId={m.perfil_id}
            admin={puedeAdmin(perfil)}
            boton="nombre"
            datos={{ areas: eq.areas, puestos: eq.puestos, productos: (productos ?? []).map((p) => ({ id: p.id, nombre: p.nombre })), rolesQuePuedoDar, puedeComision: puedeComisionDe(m.perfil_id) }}
          />
          {m.lider && <span title="Líder del área"><Crown className="h-3.5 w-3.5 shrink-0 text-oro" /></span>}
          {vende(m) && <EtiquetaMercado m={mercadoDeM(m)} />}
        </div>
        <div className="truncate text-xs text-texto-3">{puesto(m.puesto_id) ?? (m.rol ? ROL_TXT[m.rol] : "Sin acceso")}</div>
      </div>
    </div>
  );
  const delRol = (r: Rol | null) => miembros.filter((m) => (m.rol ?? null) === r).sort((x, y) => x.nombre.localeCompare(y.nombre));
  const linea = <div className="mx-auto h-6 w-px bg-borde-fuerte" aria-hidden />;
  const organigrama = (
    <div className="space-y-0">
      {/* Con varios CEO (Cristian y José, 11 nov 2026) van en una caja centrada, como los directores: la línea sale del centro de la caja y no de debajo de uno */}
      <div className={delRol("ceo").length > 1 ? "mx-auto w-fit rounded-2xl border border-dashed border-borde p-3" : undefined}>
        <div className="flex flex-wrap justify-center gap-3">{delRol("ceo").map(nodo)}</div>
      </div>
      {delRol("director").length > 0 && (
        <>
          {linea}
          <div className="rounded-2xl border border-dashed border-borde p-3">
            <div className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-texto-3">Directores</div>
            <div className="grid justify-center gap-3 sm:grid-cols-2 lg:grid-cols-3">{delRol("director").map(nodo)}</div>
          </div>
        </>
      )}
      {linea}
      {/* 13 nov (Cristian): closers y callers en dos grupos, España y Latam */}
      <div className="space-y-4">
        {MERCADOS.filter((x) => !filtroM || x.v === filtroM).reverse().map(({ v: mk, t: titulo }) => (
          <div key={mk} className="rounded-2xl border border-dashed border-borde p-3">
            <div className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-texto-3">{titulo}</div>
            <div className="grid gap-4 md:grid-cols-2">
              {([["closer", "Closers"], ["caller", "Callers"]] as const).map(([r, t]) => {
                const de = delRol(r).filter((m) => mercadoDeM(m) === mk);
                return (
                  <div key={r} className="rounded-2xl border border-borde bg-panel-2/50 p-3">
                    <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                      {t}
                      <span className="rounded-full bg-panel px-2 text-xs tabular-nums text-texto-2">{de.length}</span>
                    </div>
                    {de.length === 0 ? <p className="py-3 text-center text-xs text-texto-3">Nadie todavía.</p> : <div className="grid gap-2">{de.map(nodo)}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {delRol(null).length > 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-borde p-3">
          <div className="mb-2 text-sm font-semibold">Sin acceso a la app</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{delRol(null).map(nodo)}</div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <Cabecera
        titulo="Equipo"
        subtitulo={`${proyecto.nombre} · ${eq.miembros.filter((m) => m.activo).length} personas activas`}
        acciones={
          <>
            <FiltroMercado />
            <Link href={verInactivos ? "/equipo" : "/equipo?inactivos=1"} className="btn-secundario">{verInactivos ? "Ver activos" : "Ver inactivos"}</Link>
            <AltaMiembro areas={eq.areas} puestos={eq.puestos} productos={(productos ?? []).map((p) => ({ id: p.id, nombre: p.nombre, precio: p.precio === null ? null : Number(p.precio) }))} comisionesRol={eq.comisionesRol} rolesQuePuedoDar={rolesQuePuedoDar} puedeComision={jefe} codigoMoneda={proyecto.moneda} />
          </>
        }
      />
      <Contenido>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
          {!verInactivos && <Seccion titulo="Organigrama">{organigrama}</Seccion>}
          <Seccion titulo={verInactivos ? "Personas inactivas" : "Por áreas"}>
            <div className="grid gap-4 md:grid-cols-2">
              {eq.areas.map((a) => {
                const de = miembros.filter((m) => m.area_id === a.id).sort((x, y) => Number(y.lider) - Number(x.lider) || x.nombre.localeCompare(y.nombre));
                return (
                  <div key={a.id} className="rounded-xl border border-borde bg-panel-2/60 p-3" style={{ borderTop: `3px solid ${a.color}` }}>
                    <div className="mb-2 flex items-center justify-between"><span className="flex items-center gap-2 font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: a.color }} />{a.nombre}</span><span className="rounded-full bg-panel px-2 text-xs tabular-nums text-texto-2">{de.length}</span></div>
                    {de.length === 0 ? <p className="py-3 text-center text-xs text-texto-3">Nadie en esta área.</p> : <ul className="space-y-2">{de.map(tarjeta)}</ul>}
                  </div>
                );
              })}
              {sinArea.length > 0 && (
                <div className="rounded-xl border border-dashed border-borde p-3">
                  <div className="mb-2 font-semibold">Sin área</div>
                  <ul className="space-y-2">{sinArea.map(tarjeta)}</ul>
                </div>
              )}
            </div>
          </Seccion>
          </div>
          <div className="space-y-5">
            <Seccion titulo="Comisión de cada rol">
              {!jefe && <p className="mb-2 rounded-lg bg-panel-2 px-3 py-2 text-xs text-texto-2">Solo el CEO o el director pueden cambiar comisiones.</p>}
              <p className="mb-3 text-xs text-texto-3">Es la que se usa si la persona o el producto no tienen una propia. «% por venta»: de lo que vende él. Caller: además, «% por agenda cerrada» cuando el closer cierra una agenda suya. Se paga sobre lo cobrado, cada mes. Callers y closers van por tramos (Administración → Comisiones): esta solo se les aplica si en su ficha manda «su % propio».</p>
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_72px_72px_auto] gap-2 text-[11px] text-texto-3"><span>Rol</span><span className="text-right">% venta</span><span className="text-right">% agenda</span><span className="w-7" /></div>
                {(["closer", "caller", "director", "ceo"] as Rol[]).map((r) => <ComisionRolForm key={r} rol={r} editable={puedeComisionRol(r)} pctVenta={eq.comisionesRol[r]?.pct_venta ?? 0} pctAgenda={eq.comisionesRol[r]?.pct_agenda ?? 0} />)}
              </div>
            </Seccion>
            <Seccion titulo="Áreas">
              <EditorAreas areas={eq.areas} />
            </Seccion>
          </div>
        </div>
      </Contenido>
    </>
  );
}
