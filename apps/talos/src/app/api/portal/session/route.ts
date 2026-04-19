import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { buildPortalSessionResponse } from './session-response'

export async function GET(_request: NextRequest) {
  return buildPortalSessionResponse(auth)
}
