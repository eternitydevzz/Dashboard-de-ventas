// Crea los usuarios REALES del equipo a partir de un CSV con columnas:
//   nombre,email,rol,proyecto        (rol: ceo | director | closer | caller)
// y, si se quiere, telefono, admin (si/no: Administración, solo para directores), password (contraseña fija)
// y prueba (si: perfil de prueba, que no cuenta en cifras ni reparto y ve «Llamadas de GHL»; 1.0, 11 oct 2026).
// Genera una contraseña temporal «Maestria-…» para cada uno (Cristian, 10 oct 2026) y la guarda en
// scripts/salida/ (no en pantalla).
// Al entrar por primera vez, cada persona hace el onboarding.
//
//   Simular:  node --env-file=.env.produccion scripts/crear-usuarios.mjs equipo.csv
//   Hacerlo:  node --env-file=.env.produccion scripts/crear-usuarios.mjs equipo.csv --confirmar
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY (usa --env-file).");
const archivo = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!archivo) throw new Error("Indica el CSV del equipo: nombre,email,rol,proyecto");
const confirmar = process.argv.includes("--confirmar");
const ROLES = ["ceo", "director", "closer", "caller"];

const filas = Papa.parse(readFileSync(archivo, "utf8").replace(/^﻿/, ""), { header: true, skipEmptyLines: true }).data;
const errores = [];
const personas = filas.map((f, i) => {
  const p = { nombre: (f.nombre ?? "").trim(), email: (f.email ?? "").trim().toLowerCase(), rol: (f.rol ?? "").trim().toLowerCase(), proyecto: (f.proyecto ?? "Maestria").trim(), telefono: (f.telefono ?? "").trim() || null, admin: /^(si|sí|true|1)$/i.test((f.admin ?? "").trim()), password: (f.password ?? "").trim() || null, prueba: /^(si|sí|true|1)$/i.test((f.prueba ?? "").trim()) };
  if (!p.nombre) errores.push(`Fila ${i + 2}: falta el nombre`);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)) errores.push(`Fila ${i + 2}: email no válido (${p.email})`);
  if (!ROLES.includes(p.rol)) errores.push(`Fila ${i + 2}: rol no válido (${p.rol}); usa ${ROLES.join(", ")}`);
  if (p.admin && p.rol !== "director") errores.push(`Fila ${i + 2}: «admin» solo vale para directores`);
  if (p.password && p.password.length < 8) errores.push(`Fila ${i + 2}: la contraseña tiene que tener al menos 8 caracteres`);
  return p;
});
if (errores.length) {
  console.error("No se ha creado nada. Corrige el CSV:\n- " + errores.join("\n- "));
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const { data: proyectos } = await db.from("proyectos").select("id, nombre");
const { data: lista } = await db.auth.admin.listUsers({ perPage: 1000 });
console.log(`Base de datos: ${url}\nModo: ${confirmar ? "CREAR DE VERDAD" : "SIMULACIÓN (no cambia nada)"}\n`);

const salida = [];
for (const p of personas) {
  const proyecto = proyectos?.find((x) => x.nombre.toLowerCase() === p.proyecto.toLowerCase());
  if (!proyecto) {
    console.log(`✗ ${p.email}: no existe el proyecto «${p.proyecto}» (ejecuta antes preparar-proyecto.mjs)`);
    continue;
  }
  const existe = lista.users.find((u) => u.email === p.email);
  console.log(`${existe ? "=" : "+"} ${p.nombre} <${p.email}> · ${p.rol}${p.admin ? " con Administración" : ""}${p.prueba ? " · PERFIL DE PRUEBA" : ""} · ${proyecto.nombre}${existe ? " (ya existe: solo se añade al proyecto)" : ""}`);
  if (!confirmar) continue;
  let id = existe?.id;
  if (!existe) {
    const password = p.password ?? `Maestria-${randomBytes(6).toString("base64url")}`; // la fija del CSV, o «Maestria-» + 8 caracteres al azar
    const { data, error } = await db.auth.admin.createUser({ email: p.email, password, email_confirm: true });
    if (error) {
      console.log(`  ✗ ${error.message}`);
      continue;
    }
    id = data.user.id;
    const { error: e2 } = await db.from("perfiles").insert({ id, nombre: p.nombre, email: p.email, rol: p.rol, admin_activo: p.admin, telefono: p.telefono, es_prueba: p.prueba });
    if (e2) {
      await db.auth.admin.deleteUser(id);
      console.log(`  ✗ ${e2.message}`);
      continue;
    }
    // Perfil de prueba: ve «Llamadas de GHL» aunque su rol no la vea
    if (p.prueba) {
      const { error: e3 } = await db.from("permisos_persona").upsert({ proyecto_id: proyecto.id, perfil_id: id, seccion: "grabadas", permitido: true });
      if (e3) console.log(`  ✗ permiso «grabadas»: ${e3.message}`);
    }
    salida.push({ nombre: p.nombre, email: p.email, rol: p.rol, contrasena_temporal: password });
  }
  const { count } = await db.from("miembros_proyecto").select("perfil_id", { count: "exact", head: true }).eq("proyecto_id", proyecto.id);
  const { error: e4 } = await db.from("miembros_proyecto").upsert({ proyecto_id: proyecto.id, perfil_id: id, orden: count ?? 0 }, { onConflict: "proyecto_id,perfil_id", ignoreDuplicates: true });
  if (e4) console.log(`  ✗ no se pudo añadir al proyecto: ${e4.message}`);
}

if (confirmar && salida.length) {
  mkdirSync(new URL("./salida/", import.meta.url), { recursive: true });
  const fecha = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const ruta = new URL(`./salida/usuarios-creados-${fecha}.csv`, import.meta.url);
  writeFileSync(ruta, Papa.unparse(salida));
  console.log(`\n${salida.length} usuarios creados. Contraseñas temporales en: ${ruta.pathname}\nPásaselas a cada persona por un canal privado y borra ese archivo después.`);
} else if (!confirmar) {
  console.log("\nSimulación terminada. Para crearlos de verdad, añade --confirmar.");
}
