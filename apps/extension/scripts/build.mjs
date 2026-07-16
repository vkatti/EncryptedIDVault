import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import config from "../vite.config.mjs";

const rootDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(rootDir, "..");

await build(config);

mkdirSync(resolve(packageDir, "dist"), { recursive: true });
copyFileSync(resolve(packageDir, "manifest.json"), resolve(packageDir, "dist", "manifest.json"));
