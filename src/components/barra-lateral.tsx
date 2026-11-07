"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import {
  BookOpen,
  BarChart3,
  KanbanSquare,
  AudioLines,
  PhoneCall,
  CalendarCheck,
  ShoppingCart,
  Trophy,
  FolderOpen,
  ClipboardList,
  Settings,
  Sun,
  Moon,
  LogOut,
  ListChecks,
  Menu,
  X,
  Network,
  Package,
  Landmark,
  UserCheck,
  Gauge,
  ScrollText,
} from "lucide-react";
import { cambiarProyecto } from "@/app/(panel)/acciones-globales";
import { cerrarSesion } from "@/app/login/acciones";
import { iniciales, ETIQUETA_ROL, type ProyectoMenu } from "@/lib/formato";
import type { Perfil } from "@/lib/tipos";
import { Desplegable } from "@/components/eleccion";

const ICONOS = {
  funnel: BarChart3,
  kpis: Gauge,
  crm: KanbanSquare,
  grabadas: AudioLines,
  caller: PhoneCall,
  closer: CalendarCheck,
  ventas: ShoppingCart,
  ranking: Trophy,
  recursos: FolderOpen,
  manuales: BookOpen, // C9
  reportes: ClipboardList,
  admin: Settings,
  equipo: Network,
  programas: Package,
  finanzas: Landmark,
  clientes: UserCheck,
  onboarding: ListChecks,
  guiones: ScrollText,
};

// Velocidad (17 oct 2026, Cristian: «al poner modo dark o light va súper lento»): el tema cambia al momento en el
// navegador, sin llamar al servidor (antes, una acción que regeneraba toda la app y borraba todo lo precargado).
// La cookie es la misma de antes: el servidor la lee al cargar (src/app/layout.tsx).
function cambiarTemaAlInstante() {
  const html = document.documentElement;
  const oscuro = !html.classList.contains("dark");
  html.classList.toggle("dark", oscuro);
  document.cookie = `eternity_tema=${oscuro ? "oscuro" : "claro"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
}

export type ItemMenu = { href: string; texto: string; icono: keyof typeof ICONOS; exacto?: boolean; insignia?: number };

export function BarraLateral({
  perfil,
  proyectos,
  proyecto,
  menu,
}: {
  perfil: Perfil;
  proyectos: ProyectoMenu[];
  proyecto: ProyectoMenu;
  menu: { grupo: string; items: ItemMenu[] }[];
}) {
  const ruta = usePathname();
  // Fase 2 (Cristian, 12 oct 2026): el menú ya no precarga todas las pantallas al aparecer (medido: 24 peticiones
  // al servidor en 10 s por cada pantalla abierta); solo la que se señala con el ratón o el dedo, justo antes del clic.
  // Velocidad (17 oct 2026, Cristian: «me sigue cargando lento al cambiar de sección»): ahora sí se precargan todas
  // las secciones del menú al abrir la app, completas (prefetch={true}: la página con sus datos), y se guardan 5 min
  // (staleTimes en next.config.ts); el 12 oct se repetían porque caducaban al momento. Los cambios las borran al
  // instante (revalidatePath y avisos-en-vivo.tsx), así que no enseñan datos viejos.
  // Al pulsar, el botón se marca al momento (sin esperar al servidor); vale mientras no cambie la ruta
  // 18 oct 2026: la precarga empieza cuando la pantalla en la que se entra ya tiene sus datos (lib/pantalla-lista.ts)
  // 25 oct 2026 (Cristian, la base se saturó con el equipo trabajando): ya NO se precargan todas las secciones al
  // abrir la app (cada pestaña preparaba Funnel, KPIs, Ranking… cada 5 min). Solo la que se señala con el ratón,
  // el dedo o el teclado, justo antes de pulsar (como antes del 17 oct), y completa.
  const [precargadas, setPrecargadas] = useState<Set<string>>(() => new Set());
  const precargar = (href: string) => setPrecargadas((s) => (s.has(href) ? s : new Set(s).add(href)));
  const [yendo, setYendo] = useState<{ a: string; desde: string } | null>(null);
  const destino = yendo && yendo.desde === ruta ? yendo.a : null;
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();

  const contenido = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-5 pt-6">
        <Image src="/marca/eternity.png" alt="Eternity" width={36} height={36} className="rounded-lg" />
        <div className="leading-tight">
          <div className="font-semibold tracking-tight">Eternity</div>
          <div className="text-[11px] text-texto-3">Panel de ventas</div>
        </div>
      </div>

      <div className="px-4">
        <div className="titulo-seccion mb-2 px-1">Proyecto</div>
        <div className="relative">
          <span
            className="pointer-events-none absolute left-2.5 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md"
            style={{ background: proyecto.color }}
          >
            <Image src="/marca/maestria-blanco.png" alt="" width={16} height={15} style={{ height: "auto" }} />
          </span>
          <Desplegable
            aria-label="Proyecto"
            value={proyecto.id}
            disabled={pendiente || proyectos.length < 2}
            onChange={(e) => {
              const id = e.target.value;
              iniciar(async () => {
                await cambiarProyecto(id);
              });
            }}
            className="campo py-2.5 pl-11 pr-3 font-medium disabled:opacity-100"
          >
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Desplegable>
        </div>
      </div>

      <nav className="mt-5 flex-1 space-y-5 overflow-y-auto px-3">
        {menu.map((g) => (
          <div key={g.grupo}>
            <div className="titulo-seccion mb-1.5 px-3">{g.grupo}</div>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const Icono = ICONOS[it.icono];
                const activo = destino
                  ? destino === it.href
                  : ruta === it.href || (!it.exacto && ruta.startsWith(it.href + "/"));
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      prefetch={precargadas.has(it.href)}
                      onMouseEnter={() => precargar(it.href)}
                      onFocus={() => precargar(it.href)}
                      onTouchStart={() => precargar(it.href)}
                      onClick={() => {
                        setAbierto(false);
                        if (it.href !== ruta) setYendo({ a: it.href, desde: ruta });
                      }}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-200 ${
                        activo
                          ? "bg-primario font-medium text-white shadow-[0_6px_18px_-8px_rgb(43_89_209/0.7)]"
                          : "text-texto-2 hover:bg-panel-2 hover:text-texto"
                      }`}
                    >
                      <Icono className="h-[18px] w-[18px]" />
                      {it.texto}
                      {!!it.insignia && (
                        <span className="ml-auto rounded-full bg-aviso px-1.5 text-[11px] font-semibold text-white" title="Llamadas programadas que ya tocan">
                          {it.insignia}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-borde p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          {/* Bloque 1 de 1.0: tocar tu nombre abre «Mi perfil» */}
          <Link href="/perfil" prefetch={precargadas.has("/perfil")} onMouseEnter={() => precargar("/perfil")} onClick={() => setAbierto(false)} className={`-m-1 flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 hover:bg-panel-2 ${ruta === "/perfil" ? "bg-panel-2" : ""}`} title="Mi perfil" aria-label="Mi perfil">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primario-suave text-xs font-semibold text-primario">
              {iniciales(perfil.nombre)}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-medium">{perfil.nombre}</div>
              <div className="text-[11px] text-texto-3">{ETIQUETA_ROL[perfil.rol]} · Mi perfil</div>
            </div>
          </Link>
          <button
            onClick={cambiarTemaAlInstante}
            className="rounded-md p-1.5 text-texto-3 hover:bg-panel-2 hover:text-texto"
            title="Cambiar tema claro / oscuro"
            aria-label="Cambiar tema"
          >
            <Sun className="hidden h-4 w-4 dark:block" />
            <Moon className="h-4 w-4 dark:hidden" />
          </button>
          <form action={cerrarSesion}>
            <button className="rounded-md p-1.5 text-texto-3 hover:bg-panel-2 hover:text-mal" title="Cerrar sesión" aria-label="Cerrar sesión">
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="vidrio fixed left-3 top-3 z-30 rounded-xl border border-borde p-2 lg:hidden"
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </button>
      {abierto && <div className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm lg:hidden" onClick={() => setAbierto(false)} />}
      <aside
        className={`vidrio fixed inset-y-0 left-0 z-40 w-64 border-r border-borde transition-transform lg:sticky lg:top-3 lg:m-3 lg:h-[calc(100vh-1.5rem)] lg:translate-x-0 lg:rounded-[26px] lg:border ${
          abierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={() => setAbierto(false)}
          className="absolute right-3 top-5 rounded-md p-1 text-texto-3 lg:hidden"
          aria-label="Cerrar menú"
        >
          <X className="h-5 w-5" />
        </button>
        {contenido}
      </aside>
    </>
  );
}
