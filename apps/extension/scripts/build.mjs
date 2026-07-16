import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const rootDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(rootDir, "..");

await build({
    build: {
        outDir: "dist",
        emptyOutDir: true,
        rollupOptions: {
            input: {
                popup: resolve(packageDir, "popup.html"),
                serviceWorker: resolve(packageDir, "src/background/serviceWorker.ts")
            },
            output: {
                entryFileNames: "[name].js",
                chunkFileNames: "assets/[name].js",
                assetFileNames: "assets/[name][extname]"
            }
        }
    }
});

mkdirSync(resolve(packageDir, "dist"), { recursive: true });
copyFileSync(resolve(packageDir, "manifest.json"), resolve(packageDir, "dist", "manifest.json"));
