// 公開する ファイルだけを dist/ に あつめる。
// Netlify の ビルドと、手わたしの ZIP の りょうほうが ここを 見る
// （「どの ファイルを 公開するか」を 1か所に する ため）。
import { mkdir, rm, copyFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SITE_FILES = [
  "index.html",
  "config.js",
  "manifest.webmanifest",
  "icon.svg",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png",
];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function buildSite(outDir) {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  for (const f of SITE_FILES) await copyFile(join(root, f), join(outDir, f));
  return outDir;
}

/* 手わたしの ZIP 用。きろくサーバー（Netlify Functions）を
   **ほかの ライブラリが いらない 1ファイル**に まとめて 入れる。
   Netlify に フォルダを ドラッグする やりかたでは npm install が はしらないので、
   まとめて おかないと @netlify/blobs が 見つからない。
   （GitHub を つないだ ばあいは Netlify 側が まとめるので、これは つかわれない） */
export async function bundleFunction(outDir) {
  const { build } = await import("esbuild");
  await mkdir(join(outDir, "netlify", "functions"), { recursive: true });
  await build({
    entryPoints: [join(root, "netlify", "functions", "api.mjs")],
    outfile: join(outDir, "netlify", "functions", "api.mjs"),
    bundle: true, format: "esm", platform: "node", target: "node20",
    banner: { js: "// べんきょうノートの きろくサーバー（じどうせいせい。なおすなら netlify/functions/api.mjs を）" },
  });
  await copyFile(join(root, "netlify.toml"), join(outDir, "netlify.toml"));
  // ドラッグで あげる ときは build を はしらせない（ファイルは もう ここに ある）
  await writeFile(join(outDir, "netlify.toml"),
    (await import("node:fs")).readFileSync(join(root, "netlify.toml"), "utf8")
      .replace('command = "node scripts/build-site.mjs"', 'command = ""')
      .replace('publish = "dist"', 'publish = "."'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] || join(root, "dist");
  await buildSite(out);
  let extra = "";
  if (process.argv.includes("--with-function")) {
    await bundleFunction(out);
    extra = " ＋ きろくサーバー";
  }
  console.log(`${SITE_FILES.length}ファイル${extra}を ${out} に おきました`);
}
