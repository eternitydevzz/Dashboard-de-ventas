// Valores de las animaciones, copiados de la maqueta aprobada (GESTION EQUIPO/maqueta.html, funciones cristal*)
export const SUAVE = "cubic-bezier(.2,.7,.2,1)";
export const DESLIZA = "cubic-bezier(.3,.8,.2,1)";

// Cristian, 14 nov (noche): la cascada solo al abrir la app y como mucho 0,4 s (antes ~1,2 s con las filas una a una):
// 30 ms entre paneles, tope en el 6.º, y 0,25 s cada uno. Las filas ya no se animan por separado.
export const DURACION_PANEL = 250;
export const retrasoPanel = (n: number, base = 0) => base + Math.min(n, 5) * 30;
export const panelConDesenfoque = (n: number) => n < 12;
// Al navegar o al quitarse el esqueleto, un fundido corto de todo a la vez (la cascada empezaba invisible y dejaba un
// fotograma casi vacío); la cascada, solo al abrir la app
export const modoEntrada = (primera: boolean, conEsqueleto: boolean) => (primera && !conEsqueleto ? "cascada" : "fundido");

// Lee la primera cifra de un texto con el formato que traiga ("1.234 $", "$1,234", "12,5 %")
function leerCifra(texto: string) {
  const m = /\d[\d.,]*\d|\d/.exec(texto);
  if (!m) return null;
  const tok = m[0];
  const seps = [...new Set(tok.replace(/\d/g, ""))];
  let grupo = "";
  let decimal = "";
  if (seps.length === 2) [grupo, decimal] = tok.lastIndexOf(seps[0]) < tok.lastIndexOf(seps[1]) ? seps : [seps[1], seps[0]];
  else if (seps.length === 1) {
    const s = seps[0];
    // un solo separador seguido de 3 cifras al final = miles; si no, decimales
    if (tok.split(s).length > 2 || /^\d{3}$/.test(tok.slice(tok.indexOf(s) + 1))) grupo = s;
    else decimal = s;
  }
  const [ent, frac = ""] = decimal ? tok.split(decimal) : [tok];
  const valor = Number(ent.split(grupo || "\0").join("") + (frac ? "." + frac : ""));
  return { tok, valor, grupo, decimal, dec: frac.length };
}

// El número sube desde el 80 % hasta su valor; con p = 1 devuelve siempre el texto original
export function textoConteo(fin: string, p: number): string {
  const c = leerCifra(fin);
  if (!c || p >= 1) return fin;
  const x = c.valor * (0.8 + 0.2 * (1 - (1 - Math.max(0, p)) ** 3));
  const [ent, frac] = x.toFixed(c.dec).split(".");
  const conGrupo = c.grupo ? ent.replace(/\B(?=(\d{3})+(?!\d))/g, c.grupo) : ent;
  return fin.replace(c.tok, frac ? conGrupo + c.decimal + frac : conGrupo);
}
