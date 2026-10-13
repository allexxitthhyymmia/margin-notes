import { build } from 'esbuild'
import { cpSync, mkdirSync, rmSync } from 'node:fs'

rmSync('dist', { recursive: true, force: true })
mkdirSync('dist')
await build({
  entryPoints: ['src/background.ts', 'src/content.ts'],
  bundle: true,
  outdir: 'dist',
  format: 'iife',
  target: 'chrome120',
})
cpSync('manifest.json', 'dist/manifest.json')
console.log('Built dist/. Load it unpacked in chrome://extensions.')
