import { withAuthAndParams, ApiResponses } from '@/lib/api'
import { getGrnById } from '@/lib/services/grn-service'

export const GET = withAuthAndParams(async (_request, params, _session) => {
 const idParam = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : undefined
 if (!idParam) {
 return ApiResponses.badRequest('GRN ID is required')
 }

 const note = await getGrnById(idParam)
 return ApiResponses.success(note)
})
