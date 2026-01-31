export const runtime = 'nodejs'

function redirectToHermes(): Response {
  return new Response(null, {
    status: 307,
    headers: {
      location: '/hermes/api/orders/backfill',
    },
  })
}

export function GET() {
  return redirectToHermes()
}

export function POST() {
  return redirectToHermes()
}

