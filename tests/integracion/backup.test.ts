// scripts/backup.sh con binarios falsos (REQ-NFR-4, auditoría H-01): un respaldo que falla termina en error, no poda
// los anteriores ni marca `ultimo-ok`, también en el bucle diario (donde antes `set -e` quedaba anulado).
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = path.resolve("scripts/backup.sh");
let raiz: string;

/** pg_dump: "ok" escribe un volcado válido; "parcial" escribe y falla; "basura" sale 0 con un archivo ilegible. */
function preparar(modo: "ok" | "parcial" | "basura") {
  raiz = mkdtempSync(path.join(tmpdir(), "neltume-backup-"));
  const bin = path.join(raiz, "bin");
  for (const d of [bin, path.join(raiz, "backups"), path.join(raiz, "externo")]) mkdirSync(d);
  const ejecutable = (nombre: string, cuerpo: string) => {
    writeFileSync(path.join(bin, nombre), `#!/bin/sh\n${cuerpo}\n`);
    chmodSync(path.join(bin, nombre), 0o755);
  };
  const escribir = { ok: "printf 'PGDMP-VALIDO' > \"$f\"; exit 0", parcial: "printf 'PGDMP' > \"$f\"; echo 'sin espacio' >&2; exit 1", basura: "printf 'xx' > \"$f\"; exit 0" }[modo];
  ejecutable("pg_dump", `while [ $# -gt 0 ]; do [ "$1" = "-f" ] && f="$2"; shift; done\n${escribir}`);
  ejecutable("pg_restore", `[ "$1" = "--list" ] && grep -q PGDMP-VALIDO "$2"`);
  ejecutable("psql", "printf 'movimiento|10\\ncotizacion|5\\naudit_log|100\\n'");
  ejecutable("date", `if [ "$1" = "+%H%M" ]; then echo 0200; else /bin/date "$@"; fi`);
  ejecutable("sleep", "kill -TERM $PPID"); // corta el bucle tras el primer intento
  // Respaldo de hace 40 días: solo un respaldo verificado puede podarlo.
  const viejo = path.join(raiz, "backups", "neltume-20260101-020000.dump");
  writeFileSync(viejo, "PGDMP-VALIDO");
  const hace40 = new Date(Date.now() - 40 * 86_400_000);
  utimesSync(viejo, hace40, hace40);
  return bin;
}

function correr(bin: string, args: string[]) {
  return spawnSync("sh", [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, BACKUP_DIR: path.join(raiz, "backups"), BACKUP_EXTERNO_DIR: path.join(raiz, "externo"), BACKUP_RETENCION_DIAS: "30" },
  });
}
const archivos = (d: string) => readdirSync(path.join(raiz, d)).sort();

afterEach(() => rmSync(raiz, { recursive: true, force: true }));

describe("scripts/backup.sh (REQ-NFR-4, H-01)", () => {
  it("respaldo correcto: dump verificado, copia externa, poda y ultimo-ok", () => {
    const r = correr(preparar("ok"), ["--una-vez"]);
    expect(r.status).toBe(0);
    expect(existsSync(path.join(raiz, "backups", "ultimo-ok"))).toBe(true);
    expect(archivos("backups")).not.toContain("neltume-20260101-020000.dump");
    expect(archivos("backups").filter((f) => f.endsWith(".dump"))).toHaveLength(1);
    expect(archivos("externo").filter((f) => f.endsWith(".dump"))).toHaveLength(1);
  });

  it.each(["parcial", "basura"] as const)("pg_dump %s en el bucle diario: error, sin poda, sin ultimo-ok ni copia", (modo) => {
    const r = correr(preparar(modo), []);
    const salida = r.stdout + r.stderr;
    expect(salida).toContain('"nivel":"error"');
    expect(salida).not.toContain("listo y copiado");
    expect(existsSync(path.join(raiz, "backups", "ultimo-ok"))).toBe(false);
    expect(archivos("backups")).toContain("neltume-20260101-020000.dump");
    expect(archivos("backups")).toEqual(["neltume-20260101-020000.dump"]);
    expect(archivos("externo")).toEqual([]);
  });

  it("--una-vez con pg_dump que falla sale con código distinto de 0", () => {
    const r = correr(preparar("parcial"), ["--una-vez"]);
    expect(r.status).not.toBe(0);
    expect(readFileSync(path.join(raiz, "backups", "neltume-20260101-020000.dump"), "utf8")).toBe("PGDMP-VALIDO");
  });
});
