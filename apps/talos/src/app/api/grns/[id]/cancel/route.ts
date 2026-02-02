import { NextRequest } from 'next/server'
import { withAuthAndParams, ApiResponses } from '@/lib/api'
import { cancelGrn } from '@/lib/services/grn-service'

export const POST = withAuthAndParams(async (_request: NextRequest, params, _session) => {
 const idParam = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : undefined
 if (!idParam) {
 return ApiResponses.badRequest('GRN ID is required')
 }

 await cancelGrn(idParam)
 return ApiResponses.noContent()
})
