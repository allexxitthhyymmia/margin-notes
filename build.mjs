import { build } from 'esbuild'
import { cpSync, mkdirSync, rmSync } from 'node:fs'

rmSync('dist', { recursive: true, force: true })
rmSync('dist-server', { recursive: true, force: true })
mkdirSync('dist')
await build({
  entryPoints: ['src/background.ts', 'src/content.ts'],
  bundle: true,
  outdir: 'dist',
  format: 'iife',
  target: 'chrome120',
})
cpSync('manifest.json', 'dist/manifest.json')
await build({
  entryPoints: ['server/index.ts'],
  bundle: true,
  outfile: 'dist-server/margin-notes-mcp.mjs',
  platform: 'node',
  format: 'esm',
  target: 'node20',
})
console.log('Built dist/ (load unpacked in chrome://extensions) and dist-server/margin-notes-mcp.mjs.')
