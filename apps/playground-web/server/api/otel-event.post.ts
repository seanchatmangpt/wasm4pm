export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  console.error(JSON.stringify({ ...body, service: 'playground-web' }))
  return { ok: true }
})
