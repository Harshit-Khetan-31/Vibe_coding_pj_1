// PostToolUse guard. Reads the hook payload on stdin, then runs whichever checks
// the edited file actually warrants. Hard failures exit 2 so Claude has to fix them;
// advisories print JSON and let the turn continue.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT =
  process.env.CLAUDE_PROJECT_DIR ??
  resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function stdin() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}')
  } catch {
    return {}
  }
}

const payload = stdin()
const raw = payload?.tool_response?.filePath ?? payload?.tool_input?.file_path ?? ''
if (!raw) process.exit(0)

const rel = relative(ROOT, resolve(raw)).split('\\').join('/')
// Editing the hook or its config must not re-trigger the hook.
if (rel.startsWith('..') || rel.startsWith('.claude/')) process.exit(0)

const hard = []
const soft = []
const read = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : null)

// 1. Types. tsc -b is incremental, so this stays cheap on repeat edits.
if (/\.tsx?$/.test(rel)) {
  const tsc = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
  if (existsSync(tsc)) {
    const r = spawnSync(process.execPath, [tsc, '-b'], { cwd: ROOT, encoding: 'utf8' })
    if (r.status !== 0) {
      const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim()
      hard.push(`tsc -b failed:\n${out.slice(0, 4000)}`)
    }
  }
}

// 2. Licence obligations. CC BY 4.0 requires the aircraft credit to stay visible, and
// the OFL requires its text to ship with the self-hosted fonts. Both are easy to
// delete by accident during a refactor, and neither failure is visible in the UI.
for (const f of [
  'public/fonts/BigShouldersDisplay-OFL.txt',
  'public/fonts/InterTight-OFL.txt',
  'public/fonts/DepartureMono-OFL.txt',
  'plane.glb/license.txt',
]) {
  if (!existsSync(join(ROOT, f))) hard.push(`Licence file missing: ${f} — see FONTS.md / README.md.`)
}

const contact = read('src/sections/Contact.tsx')
if (
  contact &&
  !['plane.sourceUrl', 'plane.authorUrl', 'plane.licenseUrl'].every((k) => contact.includes(k))
) {
  hard.push(
    'The CC BY 4.0 aircraft credit is no longer rendered in the CONTACT footer ' +
      '(src/sections/Contact.tsx must link plane.sourceUrl, plane.authorUrl and plane.licenseUrl). ' +
      'That credit is a licence condition, not decoration.',
  )
}

// 3. Design tokens. tokens.css is the single source of truth for the DOM layer, so a
// chromatic hex there means a token was bypassed. src/gl/ is exempt: the 3D sky, sun
// and livery colours legitimately live in src/gl/config.ts. #000/#fff are exempt too,
// since masks and gradients need literal black and white.
if (/^src\/(components|sections|styles)\/.*\.(css|tsx?)$/.test(rel)) {
  const body = read(rel) ?? ''
  const hits = [...body.matchAll(/#[0-9a-fA-F]{3,8}\b/g)]
    .map((m) => m[0])
    .filter((h) => !/^#(0{3,4}|0{6,8}|f{3,4}|f{6,8})$/i.test(h))
  if (hits.length) {
    soft.push(
      `${rel} hardcodes ${[...new Set(hits)].join(', ')}. The DOM layer reads colour from ` +
        `src/styles/tokens.css (--bg, --fg, --dim, --line, --accent). Add a token instead.`,
    )
  }
}

if (hard.length) {
  process.stderr.write(`${hard.join('\n\n')}\n`)
  process.exit(2)
}
if (soft.length) {
  process.stdout.write(
    JSON.stringify({
      systemMessage: soft.join('\n'),
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: soft.join('\n') },
    }),
  )
}
process.exit(0)
