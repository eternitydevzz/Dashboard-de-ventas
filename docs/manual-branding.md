# Manual de branding del dashboard de Eternity

> **Para Claude (en otro proyecto):** este documento describe la identidad visual del panel de ventas de Eternity
> (`dashboard.eternity.llc`). Úsalo para replicar el mismo aspecto en otra app. Todos los valores y el código están
> copiados tal cual del proyecto original (Next.js 16 + Tailwind 4); no los cambies ni los «mejores» salvo que el
> usuario lo pida. Si el proyecto de destino no usa Next.js o Tailwind 4, dilo antes de adaptar nada.
>
> Sacado de: `src/app/globals.css`, `src/app/layout.tsx`, `public/marca/`, `src/components/ui.tsx`,
> `src/components/modal.tsx`, `src/components/portal.tsx`, `src/components/eleccion.tsx`, `src/components/toasts.tsx`,
> `src/components/barra-lateral.tsx`, `src/components/bienvenida.tsx` y `src/app/login/page.tsx`. Fecha: 18 oct 2026.

## 1. La idea en una frase

Vidrio translúcido estilo iOS sobre un fondo con manchas de luz azul Maestria y granate Eternity, con modo claro y
oscuro (oscuro por defecto), textos en español de España y la letra del sistema de Apple (o Geist fuera de Apple).

## 2. Reglas para replicarlo

1. **Todo color sale de un token.** Nunca un hex suelto en un componente: `bg-primario`, `text-texto-2`,
   `border-borde`… (las clases nacen del bloque `@theme inline`).
2. **Cada token existe dos veces:** en `:root` (claro) y en `.dark` (oscuro). Si añades uno, añádelo en los dos.
3. **El tema se cambia con la clase `dark` en `<html>`** y se recuerda en una cookie (`eternity_tema`, valores
   `claro` / `oscuro`). Sin cookie, la app sale en **oscuro**.
4. **Superficies = vidrio.** Tarjetas, barra lateral, menús y botones secundarios usan `vidrio` (fondo translúcido +
   desenfoque 30px + saturación 180 % + filo de luz arriba + sombra). El fondo de la página tiene que tener color
   (los degradados de marca) para que el vidrio se note.
5. **Las ventanas van en `<Portal>`** (directas en `<body>`). Una tarjeta de vidrio (`backdrop-filter`) atrapa a los
   elementos `fixed` que tiene dentro; sin portal, la ventana queda encerrada en la tarjeta.
6. **Ventanas casi opacas:** a la tarjeta de una ventana se le añade `ventana` (panel al 88 % en claro, 85 % en oscuro).
7. **Verde = elegido.** Casillas, interruptores, pastillas y la opción elegida de un desplegable se marcan con `ok`
   (verde). El azul `primario` es para acciones y para la sección activa del menú.
8. **Accesibilidad incluida:** con «reducir transparencia» del sistema, el vidrio pasa a sólido; con «reducir
   movimiento», se quitan las animaciones. Según los comentarios del código, `--texto-3` se ajustó para llegar a 4,5:1
   de contraste sobre el vidrio (no lo he medido yo).
9. **Iconos:** `lucide-react` (tamaños usados: `h-4 w-4`, `h-[18px] w-[18px]` en el menú, `h-5 w-5`).
10. **Idioma:** español de España en textos, nombres de clases y de componentes (`tarjeta`, `campo`, `btn-primario`…).

## 3. Logos (`public/marca/`)

| Archivo | Tamaño | Qué es | Dónde se usa |
|---|---|---|---|
| `eternity.png` | 1254 × 1254 | Cuadrado granate con «E» y jinete en blanco. Fondo medido: `#7a1920` | Favicon, barra lateral (36 px, `rounded-lg`), login (64 px, `rounded-2xl`), bienvenida (72 px, `rounded-2xl`), onboarding (48 px, `rounded-xl`), emails (40 px, radio 11px) |
| `maestria.png` | 576 × 576 | «M» azul marino y azul sobre blanco con «MAESTRIA». Azul del centro medido: `#1354b0` | No se usa en el código (solo está guardado) |
| `maestria-blanco.png` | 255 × 240 | La «M» en blanco con fondo transparente | Selector de proyecto de la barra lateral (16 px), sobre un cuadradito del color del proyecto |
| `maestria-m.png` | 255 × 185 | La «M» sola con fondo transparente | Portada de las ventanas de avisos sin imagen (`src/components/portada-marca.tsx`, 24 % del ancho) |

En todas sus apariciones, el logo de Eternity lleva esquinas redondeadas (nunca en cuadrado recto).

## 4. Colores

### 4.1 Marca

| Nombre | Valor | Para qué |
|---|---|---|
| Azul Maestria (`--primario`, claro) | `#2b59d1` | Botón principal, menú activo, barras de carga, anillos y gráficos |
| Azul Maestria (`--primario`, oscuro) | `#4f7cf0` | Lo mismo en modo oscuro |
| Granate Eternity (`--marca-eternity`) | `#7b1a22` | Token definido (clase `text-eternity`/`bg-eternity`), pero hoy ninguna pantalla lo usa; el granate se ve en el logo y en la mancha de luz del fondo |
| Oro (`--oro`) | `#c98a12` / `#e5ac35` | KPI destacado y una luz suave del fondo claro |

### 4.2 Todos los tokens (claro / oscuro)

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--fondo` | `#eef2f9` | `#060a18` | Fondo de la página |
| `--fondo-2` | `#e4eaf5` | `#0b1328` | Fondo secundario |
| `--panel` | `rgb(255 255 255 / 0.55)` | `rgb(22 32 64 / 0.48)` | Vidrio de tarjetas |
| `--panel-2` | `rgb(255 255 255 / 0.45)` | `rgb(40 54 100 / 0.4)` | Campos, hover, pastillas |
| `--borde` | `rgb(15 26 51 / 0.09)` | `rgb(255 255 255 / 0.09)` | Bordes |
| `--borde-fuerte` | `rgb(15 26 51 / 0.16)` | `rgb(255 255 255 / 0.16)` | Bordes marcados, scroll |
| `--brillo` | `rgb(255 255 255 / 0.75)` | `rgb(255 255 255 / 0.08)` | Filo de luz arriba del vidrio |
| `--apagado` | `rgb(110 120 145 / 0.38)` | `rgb(255 255 255 / 0.18)` | Interruptor apagado |
| `--texto` | `#0f1a33` | `#eef2fd` | Texto principal |
| `--texto-2` | `#46546f` | `#b3c0de` | Texto secundario |
| `--texto-3` | `#66738f` | `#8392b8` | Texto terciario, placeholders |
| `--primario` | `#2b59d1` | `#4f7cf0` | Acción principal |
| `--primario-2` | `#3f6ee6` | `#6a92f7` | Hover del principal |
| `--primario-suave` | `#e6edfd` | `#15275a` | Fondo de iconos y avatares |
| `--oro` / `--oro-suave` | `#c98a12` / `#fdf3dc` | `#e5ac35` / `#2a2210` | Destacado |
| `--ok` / `--ok-suave` | `#15924a` / `#e3f6ea` | `#3ccf7a` / `#0f2a1d` | Bien, elegido, sube |
| `--mal` / `--mal-suave` | `#d0303f` / `#fde8ea` | `#f2606c` / `#2d1218` | Error, peligro, baja |
| `--aviso` / `--aviso-suave` | `#c46a08` / `#fdf0e1` | `#f0a24a` / `#2c1d0d` | Avisos, insignias del menú |
| `--morado` | `#7c4ddb` | `#a07cf5` | Tono extra |
| `--sombra` | `0 1px 2px rgb(15 26 51 / 0.04), 0 8px 32px rgb(15 26 51 / 0.08)` | `0 10px 40px rgb(0 0 0 / 0.35)` | Sombra de paneles |
| `--desenfoque` | `30px` | (el mismo) | Desenfoque del vidrio |

### 4.3 Fondo con luz de marca

Cuatro manchas radiales en claro (azul arriba a la izquierda, granate arriba a la derecha, azul abajo, oro tenue en
el centro) y tres en oscuro (sin la de oro), con `background-attachment: fixed`. La clase `.fondo-app` pone el mismo
fondo a una capa (se usa en la pantalla de bienvenida). Código exacto en el apartado 8.

## 5. Letra

- En Apple: la del sistema (SF Pro). Fuera de Apple: **Geist** (`next/font/google`), y **Geist Mono** para monoespaciada.
- Pila: `-apple-system, BlinkMacSystemFont, "SF Pro Text", var(--font-geist-sans), system-ui, sans-serif`, con
  `-webkit-font-smoothing: antialiased`.
- Tamaños que se repiten:
  - Título de página: `text-3xl font-semibold tracking-tight`.
  - Título de sección (`.titulo-seccion`): `text-[11px] font-semibold uppercase tracking-[0.12em] text-texto-2`.
  - Título de ventana: `text-lg font-semibold`.
  - Cifra de KPI: `text-2xl sm:text-3xl font-semibold tracking-tight tabular-nums`.
  - Texto normal: `text-sm`; detalles: `text-xs` o `text-[11px]` en `text-texto-3`.

## 6. Formas, espacios y movimiento

| Cosa | Valor |
|---|---|
| Radio de tarjeta | `22px` (`rounded-[22px]`) |
| Radio de la barra lateral (escritorio) | `26px`, separada 12 px del borde (`lg:m-3`) |
| Radio de botones y campos | `rounded-xl` |
| Radio de desplegables abiertos | `rounded-2xl` |
| Chips | `rounded-full`, `text-[11px]` |
| Relleno de tarjeta | `p-4` (KPI) / `p-4 sm:p-5` (sección) / `p-5` (ventana) |
| Márgenes de página | `px-4 sm:px-8`; cabecera `pt-16` en móvil (deja sitio al botón de menú) y `lg:pt-8` |
| Separación entre bloques | `space-y-5` |
| Pulsar un botón | `active:scale-[0.97]`, `transition-all duration-200` |
| Fondo detrás de ventanas | `bg-black/35 backdrop-blur-md` |
| Barra lateral | 256 px (`w-64`); en móvil se esconde y sale con un botón de vidrio arriba a la izquierda |

Animaciones (en `globals.css`): `.entrada-logo` (latido del logo, 1,6 s en bucle, con un halo azul),
`.entrada-texto` (aparece subiendo 8 px en 0,6 s), `.barra-carga` (barra fina azul arriba que avanza en 1,1 s) y
`.celebracion-pieza` (confeti que cae en 2,6 s).

## 7. Piezas (clases) y cuándo usarlas

| Clase | Qué es |
|---|---|
| `vidrio` | Utilidad de vidrio (se puede usar con `@apply`) |
| `tarjeta` | Vidrio + `rounded-[22px]` + borde. La caja base de todo |
| `ventana` | Se añade a una `tarjeta` para hacerla casi opaca (ventanas y desplegables) |
| `titulo-seccion` | Rótulo pequeño en mayúsculas |
| `btn-primario` | Azul con sombra azul; acción principal (uno por zona) |
| `btn-secundario` | Vidrio con borde; «Cancelar» y acciones de apoyo |
| `btn-peligro` | Rojo suave con borde rojo; borrar |
| `campo` / `etiqueta-campo` | Inputs y su etiqueta; al enfocar, borde azul y aro azul al 15 % |
| `chip` | Etiqueta redonda pequeña (con tonos: `bg-ok-suave text-ok`, etc.) |
| `tabla` | Tabla con cabecera en mayúsculas `text-texto-3` y filas separadas por `border-borde` |
| `interruptor` | `<input type="checkbox" class="interruptor">`: sí/no estilo iOS, verde encendido |
| `pastilla` / `grupo-pastillas` | Radios que se ven como pastillas; la elegida en verde |
| `fondo-app` | El fondo de marca en una capa |

Patrón de tonos (de `ui.tsx`): cada tono es la pareja `bg-<tono>-suave text-<tono>` (primario, oro, ok, mal, aviso;
el morado usa `bg-primario-suave text-morado`). El neutro es `bg-panel-2 text-texto-2 ring-1 ring-borde`.

## 8. Código para copiar

### 8.1 `src/app/globals.css`

Copia `src/app/globals.css` entero del proyecto original (no se pega aquí para que no se quede viejo).
Requiere Tailwind 4 (`@import "tailwindcss"`, `@custom-variant`, `@theme inline`, `@utility`).

### 8.2 `src/app/layout.tsx` (fuentes y tema por cookie)

Lee la cookie en el servidor y pone `dark` en `<html>` antes de pintar (así no hay parpadeo). Cambia `title`,
`description` e icono por los del proyecto nuevo.

```tsx
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Eternity · Ventas",
  description: "Panel de ventas del equipo",
  icons: { icon: "/marca/eternity.png" },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const tema = (await cookies()).get("eternity_tema")?.value === "claro" ? "" : "dark";
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} ${tema} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
```

### 8.3 Botón de tema (de `src/components/barra-lateral.tsx`)

Cambia la clase al momento en el navegador (sin llamar al servidor) y guarda la cookie un año.

```tsx
function cambiarTemaAlInstante() {
  const html = document.documentElement;
  const oscuro = !html.classList.contains("dark");
  html.classList.toggle("dark", oscuro);
  document.cookie = `eternity_tema=${oscuro ? "oscuro" : "claro"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
}
```

```tsx
<button
  onClick={cambiarTemaAlInstante}
  className="rounded-md p-1.5 text-texto-3 hover:bg-panel-2 hover:text-texto"
  title="Cambiar tema claro / oscuro"
  aria-label="Cambiar tema"
>
  <Sun className="hidden h-4 w-4 dark:block" />
  <Moon className="h-4 w-4 dark:hidden" />
</button>
```

### 8.4 `src/components/portal.tsx`

```tsx
"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const sinSuscripcion = () => () => {};

// Dibuja su contenido directamente en <body>, fuera de cualquier tarjeta.
// Hace falta para las ventanas: una tarjeta de vidrio (backdrop-filter) se convierte en el marco de las
// piezas «fixed» que tiene dentro y la ventana quedaba encerrada en la tarjeta (detectado por Cristian).
export function Portal({ children }: { children: ReactNode }) {
  // En el servidor no hay <body> al que llevarlo: solo se dibuja en el navegador
  const enNavegador = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  return enNavegador ? createPortal(children, document.body) : null;
}
```

### 8.5 `src/components/modal.tsx` (ventana)

```tsx
"use client";

import { X } from "lucide-react";
import { Portal } from "@/components/portal";

export function Modal({ titulo, onCerrar, children, ancho = "max-w-md" }: { titulo: string; onCerrar: () => void; children: React.ReactNode; ancho?: string }) {
  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-md" onClick={onCerrar}>
      <div className={`tarjeta ventana w-full ${ancho} p-5`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <button onClick={onCerrar} className="rounded-md p-1 text-texto-3 hover:bg-panel-2" aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
    </Portal>
  );
}
```

### 8.6 Enlace del menú (de `src/components/barra-lateral.tsx`)

Activo: azul relleno con sombra azul. Inactivo: gris que se aclara al pasar el ratón. Lo de marca es el `className`; `prefetch`, `setYendo`
y la insignia son lógica propia de este dashboard.

```tsx
<Link
  href={it.href}
  prefetch={precargar}
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
```

Contenedor de la barra lateral (botón de menú en móvil, fondo oscurecido y `<aside>`; dentro va el contenido y se
cierra con `</aside>`):

```tsx
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
```

### 8.7 Piezas de `src/components/ui.tsx` (cabecera, contenido, sección, insignia, avatar)

```tsx
export function Cabecera({ titulo, subtitulo, acciones }: { titulo: string; subtitulo?: ReactNode; acciones?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 px-4 pb-4 pt-16 sm:px-8 lg:pt-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-texto-2">{subtitulo}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </header>
  );
}

export function Contenido({ children }: { children: ReactNode }) {
  return <main className="space-y-5 px-4 pb-12 sm:px-8">{children}</main>;
}
```

```tsx
export function Seccion({ titulo, acciones, children, className = "" }: { titulo?: string; acciones?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`tarjeta p-4 sm:p-5 ${className}`}>
      {(titulo || acciones) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {titulo && <h2 className="titulo-seccion">{titulo}</h2>}
          {acciones}
        </div>
      )}
      {children}
    </section>
  );
}
```

```tsx
export function Insignia({ children, tono = "neutro" }: { children: ReactNode; tono?: "neutro" | Tono }) {
  const clases: Record<string, string> = {
    neutro: "bg-panel-2 text-texto-2 ring-1 ring-borde",
    primario: "bg-primario-suave text-primario",
    oro: "bg-oro-suave text-oro",
    ok: "bg-ok-suave text-ok",
    mal: "bg-mal-suave text-mal",
    aviso: "bg-aviso-suave text-aviso",
    morado: "bg-primario-suave text-morado",
  };
  return <span className={`chip ${clases[tono]}`}>{children}</span>;
}

export function Avatar({ nombre, tamano = "h-8 w-8 text-[11px]" }: { nombre: string; tamano?: string }) {
  const ini = nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-primario-suave font-semibold text-primario ${tamano}`}>
      {ini}
    </span>
  );
}
```

### 8.8 Pantalla de ejemplo: bienvenida (de `src/components/bienvenida.tsx`, solo lo visual)

```tsx
return (
  <div id="entrada" className="fondo-app fixed inset-0 z-[100] flex items-center justify-center p-4" role="status" aria-live="polite">
    <div className="tarjeta w-full max-w-sm p-8 text-center">
      <div className="entrada-logo mx-auto mb-6 w-fit rounded-2xl">
        <Image src="/marca/eternity.png" alt="Eternity" width={72} height={72} className="rounded-2xl" priority />
      </div>
      <h1 className="entrada-texto text-2xl font-semibold tracking-tight">Hola, {nombre}</h1>
      <p key={avance < 50 ? 0 : 1} className="entrada-texto mt-2 text-sm text-texto-2">{avance < 50 ? "Comprobando tu acceso…" : "Cargando tu panel…"}</p>
      <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-panel-2">
        <div className="h-full rounded-full bg-primario transition-[width] duration-300 ease-out" style={{ width: `${Math.max(avance, 8)}%` }} />
      </div>
    </div>
  </div>
```

### 8.9 Aviso flotante (de `src/components/toasts.tsx`)

Abajo a la derecha; el de bien en vidrio con borde verde, el de error en rojo suave.

```tsx
<div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
  {toasts.map((t) => (
    <div
      key={t.id}
      role={t.tipo === "error" ? "alert" : "status"}
      className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm shadow-panel ${
        t.tipo === "ok" ? "vidrio border-ok/30 text-texto" : "border-mal/40 bg-mal-suave text-mal"
      }`}
    >
      {t.tipo === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
      <span className="flex-1">{t.texto}</span>
      <button onClick={() => quitar(t.id)} className="rounded p-0.5 text-texto-3 hover:text-texto" aria-label="Cerrar aviso">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  ))}
</div>
```

## 9. Lista de comprobación al replicarlo

- [ ] `globals.css` copiado entero y Tailwind 4 funcionando (las clases `bg-primario`, `tarjeta`… existen).
- [ ] `layout.tsx` con Geist, `lang="es"` y la clase `dark` según la cookie.
- [ ] Botón de tema que cambia al instante y la recarga mantiene el tema.
- [ ] Logos en `public/marca/` y el de Eternity con esquinas redondeadas.
- [ ] Ninguna ventana ni desplegable dentro de una tarjeta sin `<Portal>`.
- [ ] Probado en claro **y** en oscuro, y en móvil (barra lateral escondida con botón).
- [ ] Ningún hex suelto en los componentes nuevos.
