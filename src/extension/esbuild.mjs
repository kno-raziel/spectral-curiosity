import { execSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync } from "node:fs";
import * as esbuild from "esbuild";

if (existsSync("../shared/icon.png")) {
  copyFileSync("../shared/icon.png", "icon.png");
}

const isWatch = process.argv.includes("--watch");

// Build Tailwind CSS
function buildTailwind() {
  console.log("  Building Tailwind CSS...");
  execSync("npx @tailwindcss/cli -i ../client/index.css -o dist/webview.css --minify", {
    cwd: import.meta.dirname,
    stdio: "inherit",
  });
}

// Copy local fonts to dist/
function copyFonts() {
  console.log("  Copying fonts...");
  cpSync("../shared/fonts", "dist/fonts", { recursive: true });
}

// Ensure dist exists
if (!existsSync("dist")) {
  execSync("mkdir -p dist", { cwd: import.meta.dirname });
}

// Extension host bundle (Node.js)
const hostOptions = {
  entryPoints: ["extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode", "node-sqlite3-wasm"],
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: true,
  minify: !isWatch,
};

// Plugin: ignore CSS imports (Tailwind CLI compiles CSS separately)
const ignoreCss = {
  name: "ignore-css",
  setup(build) {
    build.onResolve({ filter: /\.css$/ }, () => ({ path: "ignored", namespace: "ignore" }));
    build.onLoad({ filter: /.*/, namespace: "ignore" }, () => ({ contents: "" }));
  },
};

// Webview bundle (browser)
const webviewOptions = {
  entryPoints: ["../client/main.tsx"],
  bundle: true,
  outfile: "dist/webview.js",
  format: "iife",
  platform: "browser",
  target: "es2022",
  sourcemap: true,
  minify: !isWatch,
  jsx: "automatic",
  plugins: [ignoreCss],
  define: {
    "process.env.NODE_ENV": isWatch ? '"development"' : '"production"',
  },
};

if (isWatch) {
  const hostCtx = await esbuild.context(hostOptions);
  const webviewCtx = await esbuild.context(webviewOptions);
  await Promise.all([hostCtx.watch(), webviewCtx.watch()]);
  buildTailwind();
  copyFonts();
  console.log("👀 Watching for changes...");
} else {
  await Promise.all([esbuild.build(hostOptions), esbuild.build(webviewOptions)]);
  buildTailwind();
  copyFonts();
  console.log("✅ Build complete");
}
