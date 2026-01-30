export const runtime = 'nodejs'

function redirectToHermes(): Response {
  return new Response(null, {
    status: 307,
    headers: {
      location: '/hermes/api/solicitations/request-review',
    },
  })
}

export function GET() {
  return redirectToHermes()
}

export function POST() {
  return redirectToHermes()
}
