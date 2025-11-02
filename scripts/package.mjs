import fs from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import url from 'node:url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = pkg.version || '0.0.0'

const dist = path.join(root, 'dist')
if (!fs.existsSync(dist)) {
  console.error('dist/ not found. Run `npm run build` first.')
  process.exit(1)
}

const releases = path.join(root, 'releases')
fs.mkdirSync(releases, { recursive: true })

const out = path.join(releases, `tab-smash-${version}.zip`)
try { fs.unlinkSync(out) } catch {}

console.log(`Zipping dist/ -> ${out}`)
execSync(`cd ${dist} && zip -r ${JSON.stringify(out)} .`, { stdio: 'inherit' })
console.log('Done.')

