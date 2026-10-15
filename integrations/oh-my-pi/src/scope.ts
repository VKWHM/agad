import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { resolve, relative, dirname, isAbsolute, sep } from "node:path";
export async function safePath(cwd: string, path: string) {
  const root = await realpath(cwd),
    target = resolve(root, path);
  const rel = relative(root, target);
  if (
    !rel ||
    isAbsolute(rel) ||
    rel === ".." ||
    rel.startsWith(`..${sep}`) ||
    rel.split(sep).some((p) => [".git", ".omp", "node_modules"].includes(p))
  )
    throw new Error(`Unsafe or reserved path: ${path}`);
  let cursor = target;
  while (cursor !== root) {
    try {
      if ((await lstat(cursor)).isSymbolicLink())
        throw new Error(`Symlink paths are outside AGAD write scope: ${path}`);
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }
    cursor = dirname(cursor);
  }
  return target;
}
export async function allowWrite(cwd: string, path: unknown, paths: string[]) {
  if (typeof path !== "string") throw new Error("Write must identify one path");
  const target = await safePath(cwd, path);
  for (const allowed of paths) {
    const base = await safePath(cwd, allowed),
      rel = relative(base, target);
    if (
      !rel ||
      (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`))
    )
      return;
  }
  throw new Error(`Path is outside approved role scope: ${path}`);
}
export async function fingerprint(cwd: string, paths: string[]) {
  const root = await realpath(cwd);
  const hash = createHash("sha256");
  async function visit(path: string) {
    const full = await safePath(root, path);
    let stat;
    try {
      stat = await lstat(full);
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
      hash.update(JSON.stringify([path, "missing"]));
      return;
    }
    if (stat.isDirectory()) {
      hash.update(JSON.stringify([path, "directory"]));
      for (const entry of (await readdir(full)).sort())
        await visit(relative(root, resolve(full, entry)));
    } else if (stat.isFile()) {
      hash.update(JSON.stringify([path, stat.mode, stat.size]));
      hash.update(await readFile(full));
    } else throw new Error(`Unsupported artifact: ${path}`);
  }
  for (const path of [...paths].sort()) await visit(path);
  return `sha256:${hash.digest("hex")}`;
}
