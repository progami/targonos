export const runtime = 'nodejs'

function redirectToHermes(request: Request): Response {
  const url = new URL(request.url)

  return new Response(null, {
    status: 307,
    headers: {
      location: `/hermes/api/orders/recent${url.search}`,
    },
  })
}

export function GET(request: Request) {
  return redirectToHermes(request)
}

export function POST(request: Request) {
  return redirectToHermes(request)
}

