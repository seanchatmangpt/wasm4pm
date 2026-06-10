import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body?.breed || !body?.contract) {
    throw createError({ statusCode: 400, statusMessage: 'Missing breed or contract' })
  }

  const repoRoot = resolve(process.cwd(), '../../')
  const wpmScript = resolve(repoRoot, 'apps/wasm4pm/dist/bin/wpm.js')

  const contractJson = JSON.stringify({ breed: body.breed, contract: body.contract })

  const result = spawnSync(
    process.execPath,
    [wpmScript, 'cognition', 'run', '--contract', body.breed, '--format', 'json'],
    {
      input: contractJson,
      env: { ...process.env, WASM4PM_NO_COLOR: '1' },
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30_000
    }
  )

  if (result.error) {
    throw createError({ statusCode: 500, statusMessage: result.error.message })
  }

  const stdout = result.stdout?.toString() ?? ''
  const stderr = result.stderr?.toString() ?? ''

  if (result.status !== 0) {
    throw createError({
      statusCode: 500,
      statusMessage: `wpm exited ${result.status}: ${stderr.slice(0, 300)}`
    })
  }

  try {
    return JSON.parse(stdout)
  }
  catch {
    throw createError({ statusCode: 500, statusMessage: `Non-JSON output: ${stdout.slice(0, 300)}` })
  }
})
