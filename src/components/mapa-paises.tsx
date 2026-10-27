"use client";

import { useEffect, useRef, useState } from "react";
import { ALFA2_DE_NUMERICO } from "@/lib/mapa-codigos";
import { SIN_PAIS, nombrePais } from "@/lib/formato";
import { colocarCuadros, type Sitio } from "@/lib/mapa-cuadros";

type Forma = { alfa: string | null; d: string; x: number; y: number };
const ANCHO = 800;
const ALTO = 400;
// Todos los puntos del mismo azul (Cristian, 27 oct; antes el 2.º iba en granate)
const COLOR_PUNTO = "var(--primario)";
// Países con cuadro de cifra en el mapa (Cristian, 27 oct)
const CON_CUADRO = ["ES", "MX", "CO", "CL", "AR", "VE", "BR", "US", "PE"];
// Elegido por Cristian sobre el mapa (27 oct): Chile encima de su punto, Argentina debajo y Perú a la izquierda, un
// poco bajado para no tapar Colombia
const SITIO_FIJO: Partial<Record<string, Sitio>> = { CL: "arriba", AR: "abajo", PE: "izquierdaBaja" };
const CLASE_SITIO: Record<Sitio, string> = {
  arriba: "-translate-x-1/2 -translate-y-[calc(100%+0.5rem)]",
  izquierda: "-translate-x-[calc(100%+0.5rem)] -translate-y-1/2",
  izquierdaBaja: "-translate-x-[calc(100%+0.5rem)] -translate-y-[15%]",
  derecha: "translate-x-2 -translate-y-1/2",
  abajo: "-translate-x-1/2 translate-y-2",
};
// Ranking: azul Maestria, granate Eternity, oro y los tonos de la app (cambian solos en modo oscuro)
const COLORES = ["var(--primario)", "var(--marca-eternity)", "var(--oro)", "var(--ok)", "var(--morado)", "var(--aviso)", "var(--primario-2)", "var(--mal)"];

// 1c · L5 (Cristian, 26 oct 2026: «haz el mapa visualmente más top», con sus referencias adaptadas a la marca):
// vidrio con las luces de la app (azul Maestria y granate Eternity), un punto de luz por país (más grande cuantos más
// leads; los 5 primeros laten), cifras flotando sobre 9 países elegidos (27 oct), 3 datos grandes, un ranking con barras y, al
// pasar el ratón por un país, su cuadro. Sin líneas entre países (no hay ningún dato que los una). El dibujo
// (world-atlas 110m) y las librerías (d3-geo, topojson-client) se cargan solo en esta pestaña. Las islas pequeñas y
// «Sin país» no salen en el mapa; la lista de debajo con ellos se quitó (Cristian, 26 oct).
// alElegir (Cristian, 26 oct): clic en un país del mapa o del ranking abre la lista de sus personas
export function MapaPaises({ paises, alElegir }: { paises: { pais: string; n: number }[]; alElegir?: (pais: string) => void }) {
  const [formas, setFormas] = useState<Forma[] | null>(null);
  const [error, setError] = useState(false);
  const [sobre, setSobre] = useState<{ alfa: string; x: number; y: number; derecha: boolean } | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const [anchoCaja, setAnchoCaja] = useState(0);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const o = new ResizeObserver(() => setAnchoCaja(el.clientWidth));
    o.observe(el);
    return () => o.disconnect();
  }, []);
  useEffect(() => {
    let vivo = true;
    Promise.all([import("d3-geo"), import("topojson-client"), import("world-atlas/countries-110m.json")])
      .then(([geo, topo, mundo]) => {
        const datos = (mundo as { default?: unknown }).default ?? mundo;
        const t = datos as unknown as Parameters<typeof topo.feature>[0] & { objects: { countries: Parameters<typeof topo.feature>[1] } };
        const todas = topo.feature(t, t.objects.countries) as unknown as { features: { id?: string; geometry: { type: string; coordinates: unknown } }[] };
        // Sin la Antártida (010): ocupa media altura y no tiene leads
        const features = todas.features.filter((f) => f.id !== "010");
        const proyeccion = geo.geoNaturalEarth1().fitSize([ANCHO, ALTO], { type: "FeatureCollection", features } as never);
        const camino = geo.geoPath(proyeccion);
        // El punto de luz va en el trozo más grande del país (si no, el de Francia caería en el mar por la Guayana
        // Francesa y el de EE. UU. se iría hacia Alaska)
        const centro = (f: (typeof features)[number]) => {
          if (f.geometry.type !== "MultiPolygon") return camino.centroid(f as never);
          const trozos = (f.geometry.coordinates as unknown[][]).map((c) => ({ type: "Polygon", coordinates: c }));
          const mayor = trozos.reduce((a, b) => (geo.geoArea(b as never) > geo.geoArea(a as never) ? b : a));
          return camino.centroid(mayor as never);
        };
        if (vivo)
          setFormas(
            features.map((f) => {
              const [x, y] = centro(f);
              return { alfa: f.id ? ALFA2_DE_NUMERICO[f.id] ?? null : null, d: camino(f as never) ?? "", x, y };
            })
          );
      })
      .catch(() => vivo && setError(true));
    return () => {
      vivo = false;
    };
  }, []);

  const conPais = paises.filter((p) => p.pais !== SIN_PAIS).sort((a, b) => b.n - a.n);
  const total = paises.reduce((s, p) => s + p.n, 0);
  const n = new Map(paises.map((p) => [p.pais, p.n]));
  const max = Math.max(1, ...conPais.map((p) => p.n));
  const top = conPais.slice(0, 5).map((p) => p.pais);
  // Cuadros con la cifra: los países que eligió Cristian (27 oct), los que tengan leads, de más a menos
  const conCuadro = conPais.filter((p) => CON_CUADRO.includes(p.pais)).map((p) => p.pais);
  // Tamaño de cada cuadro en unidades del dibujo: en píxeles (sin el nombre en el móvil) y pasado a la escala del mapa
  const escala = ANCHO / (anchoCaja || ANCHO);
  const movil = anchoCaja > 0 && anchoCaja < 640;
  const sitios = formas
    ? colocarCuadros(
        conCuadro.flatMap((alfa) => {
          const f = formas.find((x) => x.alfa === alfa);
          if (!f) return [];
          const cifra = (n.get(alfa) ?? 0).toLocaleString("es-ES").length * (movil ? 7 : 8.5);
          const ancho = 20 + (movil ? cifra : Math.max(cifra, nombrePais(alfa).length * 6));
          return [{ id: alfa, x: f.x, y: f.y, ancho: ancho * escala, alto: (movil ? 24 : 44) * escala }];
        }),
        8 * escala,
        SITIO_FIJO
      )
    : {};
  const pct = (x: number) => `${total ? Math.round((x / total) * 1000) / 10 : 0} %`.replace(".", ",");
  // Tamaño y brillo del punto: raíz cuadrada (si no, España taparía a todos los demás)
  const radio = (x: number) => 2.5 + 11 * Math.sqrt(x / max);

  if (error) return <p className="text-sm text-mal">No se pudo cargar el mapa.</p>;
  const datos = [
    { v: total.toLocaleString("es-ES"), t: "leads" },
    { v: conPais.length.toLocaleString("es-ES"), t: "países" },
    ...(conPais[0] ? [{ v: pct(conPais[0].n), t: nombrePais(conPais[0].pais) }] : []),
  ].map((d) => (
    <div key={d.t} className="vidrio rounded-xl border border-borde px-2.5 py-1.5 leading-tight">
      <div className="text-sm font-semibold tabular-nums sm:text-lg">{d.v}</div>
      <div className="text-[10px] uppercase tracking-wider text-texto-3">{d.t}</div>
    </div>
  ));
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2 sm:hidden">{datos}</div>
        <div
          ref={caja}
          className="relative aspect-[2/1] overflow-hidden rounded-2xl border border-borde"
          style={{
            background:
              "radial-gradient(60% 70% at 28% 45%, color-mix(in srgb, var(--primario) 22%, transparent), transparent 70%), radial-gradient(45% 60% at 78% 30%, color-mix(in srgb, var(--marca-eternity) 20%, transparent), transparent 70%), var(--panel-2)",
          }}
          onMouseLeave={() => setSobre(null)}
        >
          {!formas ? (
            <div className="absolute inset-0 animate-pulse bg-panel-2" aria-busy="true" />
          ) : (
            <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="absolute inset-0 h-full w-full" role="img" aria-label="Leads por país">
              <defs>
                <filter id="luz-punto" x="-200%" y="-200%" width="500%" height="500%">
                  <feGaussianBlur stdDeviation="4" />
                </filter>
                <style>{`.latido{transform-box:fill-box;transform-origin:center;animation:latido-punto 2.4s ease-out infinite}@keyframes latido-punto{0%{transform:scale(1);opacity:.55}70%{transform:scale(2.6);opacity:0}100%{opacity:0}}`}</style>
              </defs>
              {formas.map((f, i) => {
                const leads = f.alfa ? n.get(f.alfa) ?? 0 : 0;
                return (
                  <path
                    key={i}
                    d={f.d}
                    fill={leads ? `color-mix(in srgb, var(--primario) ${Math.round(18 + 42 * Math.sqrt(leads / max))}%, transparent)` : "color-mix(in srgb, var(--texto-3) 14%, transparent)"}
                    stroke={sobre?.alfa === f.alfa && leads ? "var(--primario)" : "var(--borde-fuerte)"}
                    strokeWidth={sobre?.alfa === f.alfa && leads ? 1.2 : 0.5}
                    className={leads && alElegir ? "cursor-pointer" : undefined}
                    onClick={() => f.alfa && leads && alElegir?.(f.alfa)}
                    onMouseMove={(e) => {
                      if (!f.alfa || !leads) return setSobre(null);
                      const r = caja.current!.getBoundingClientRect();
                      // En la parte derecha del mapa, el cuadro sale a la izquierda del ratón (si no, se saldría)
                      setSobre({ alfa: f.alfa, x: e.clientX - r.left, y: e.clientY - r.top, derecha: e.clientX - r.left > r.width * 0.6 });
                    }}
                  />
                );
              })}
              {/* Puntos de luz: halo desenfocado + núcleo; los 5 primeros, con latido */}
              {formas
                .filter((f) => f.alfa && n.get(f.alfa))
                .sort((a, b) => (n.get(a.alfa!) ?? 0) - (n.get(b.alfa!) ?? 0))
                .map((f) => {
                  const leads = n.get(f.alfa!)!;
                  const r = radio(leads);
                  const esTop = top.includes(f.alfa!);
                  const color = COLOR_PUNTO;
                  return (
                    <g key={f.alfa} className="pointer-events-none">
                      <circle cx={f.x} cy={f.y} r={r * 1.8} fill={color} opacity={0.35} filter="url(#luz-punto)" />
                      {esTop && <circle cx={f.x} cy={f.y} r={r} fill="none" stroke={color} strokeWidth={1.5} className="latido" />}
                      <circle cx={f.x} cy={f.y} r={Math.max(1.6, r * 0.42)} fill={color} stroke="var(--panel)" strokeWidth={0.8} />
                    </g>
                  );
                })}
            </svg>
          )}
          {/* Cifras flotando sobre los países elegidos por Cristian, cada una en un sitio libre (lib/mapa-cuadros.ts) */}
          {formas &&
            conCuadro.map((alfa) => {
              const f = formas.find((x) => x.alfa === alfa);
              if (!f) return null;
              return (
                <div key={alfa} className={`vidrio pointer-events-none absolute rounded-xl border border-borde px-2 py-1 text-center leading-tight ${CLASE_SITIO[sitios[alfa] ?? "arriba"]}`} style={{ left: `${(f.x / ANCHO) * 100}%`, top: `${(f.y / ALTO) * 100}%` }}>
                  <div className="text-xs font-semibold tabular-nums sm:text-sm">{(n.get(alfa) ?? 0).toLocaleString("es-ES")}</div>
                  <div className="hidden text-[10px] text-texto-2 sm:block">{nombrePais(alfa)}</div>
                </div>
              );
            })}
          {/* 3 datos grandes (en móvil van encima del mapa: aquí tapaban las cifras de los países) */}
          <div className="pointer-events-none absolute left-3 top-3 hidden flex-wrap gap-2 sm:flex">{datos}</div>
          {/* Cuadro del país bajo el ratón */}
          {sobre && (
            <div className="tarjeta ventana pointer-events-none absolute z-10 px-3 py-2 text-sm" style={{ left: sobre.x, top: sobre.y, transform: `translate(${sobre.derecha ? "calc(-100% - 12px)" : "12px"}, -50%)` }} role="status">
              <div className="font-semibold">{nombrePais(sobre.alfa)}</div>
              <div className="tabular-nums text-texto-2">{(n.get(sobre.alfa) ?? 0).toLocaleString("es-ES")} leads · {pct(n.get(sobre.alfa) ?? 0)}</div>
            </div>
          )}
        </div>
      </div>

      {/* Ranking */}
      <div>
        <div className="mb-2 text-sm font-medium">Países con más leads</div>
        <ul className="space-y-2">
          {conPais.slice(0, 8).map((p, i) => (
            <li key={p.pais} onMouseEnter={() => setSobre(null)}>
              <button type="button" disabled={!alElegir} onClick={() => alElegir?.(p.pais)} className="block w-full rounded-lg text-left enabled:cursor-pointer enabled:hover:opacity-80">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate text-texto-2">{nombrePais(p.pais)}</span>
                <span className="shrink-0 tabular-nums">{p.n.toLocaleString("es-ES")} <small className="text-texto-3">{pct(p.n)}</small></span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-panel-2">
                <div className="h-full rounded-full" style={{ width: `${(p.n / max) * 100}%`, background: COLORES[i % COLORES.length], boxShadow: `0 0 10px color-mix(in srgb, ${COLORES[i % COLORES.length]} 60%, transparent)` }} />
              </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
