import http from 'node:http'

const host = '127.0.0.1'
const port = 3321

const routes = new Map([
  [
    '/operations/inbound',
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Inbound</title>
  </head>
  <body>
    <main>
      <h1>Inbound</h1>
      <p>Talos callback target</p>
    </main>
  </body>
</html>`,
  ],
])

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url ?? '/', `http://${host}:${port}`)
  const html = routes.get(requestUrl.pathname)

  if (html === undefined) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Not found')
    return
  }

  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  response.end(html)
})

server.listen(port, host, () => {
  process.stdout.write(`callback target server listening on http://${host}:${port}\n`)
})

const shutdown = () => {
  server.close(() => {
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
