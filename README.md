# Eternity · Dashboard de ventas

App web del equipo de ventas (Next.js + Supabase). Proyecto principal: Maestria.

- **Plan y estado:** fuera del repositorio, en `VENTAS/plan.md` (ver [`docs/plan.md`](docs/plan.md))
- **Publicar:** [`docs/GUIA-PUBLICAR.md`](docs/GUIA-PUBLICAR.md)
- **Conectar GoHighLevel:** [`docs/GUIA-GHL.md`](docs/GUIA-GHL.md)
- **Manual de marca (colores, letras y estilo):** [`docs/manual-branding.md`](docs/manual-branding.md)

- **App publicada:** https://dashboard.eternity.llc (Vercel + Supabase en la nube; cada commit a `main` se publica solo y tiene que ir firmado por `eternitydevzz`).
- **Conectar una web al dashboard (manual del equipo):** [`Team/Template-landing.md`](Team/Template-landing.md); para Claude, la skill `Team/skills/conectar-web-al-dashboard`.

En local (⚠ desde el 12 oct no se usa Docker: los tests de integración irán en GitHub, esto queda como referencia): Docker Desktop abierto, Supabase local y `npm run dev` (puerto 3100 en esta máquina). Tests: `npm test`. Docker va apagado por defecto: se enciende para los tests de integración y se apaga después. Variables: copia `.env.example` como `.env.local`.

