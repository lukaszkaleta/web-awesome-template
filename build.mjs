#!/usr/bin/env node
import { build } from 'esbuild';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

const root = process.cwd();
const publicDir = path.join(root, 'public');
const outDir = path.join(root, 'dist');

async function rimraf(p) {
  await fsp.rm(p, { recursive: true, force: true });
}

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

async function copyDir(src, dest) {
  const entries = await fsp.readdir(src, { withFileTypes: true });
  await ensureDir(dest);
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      // Skip old dev bundles if present
      if (entry.name === 'bundle.js' || entry.name === 'bundle.js.map') continue;
      await fsp.copyFile(srcPath, destPath);
    }
  }
}

async function run() {
  console.log('[build] Cleaning dist...');
  await rimraf(outDir);
  await ensureDir(outDir);

  console.log('[build] Bundling with esbuild...');
  await build({
    entryPoints: ['src/index.js'],
    bundle: true,
    format: 'esm',
    target: ['es2019'],
    sourcemap: true,
    minify: true,
    outdir: outDir,
    logLevel: 'info'
  });

  if (fs.existsSync(publicDir)) {
    console.log('[build] Copying static assets...');
    await copyDir(publicDir, outDir);
  }

  console.log('[build] Done.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
