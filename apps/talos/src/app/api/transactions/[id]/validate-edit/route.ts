import { NextResponse } from 'next/server'
import { withAuthAndParams } from '@/lib/api/auth-wrapper'
import { getTenantPrisma } from '@/lib/tenant/server'
import { TransactionValidationError, validateTransactionDelete } from '../validation'

export const dynamic = 'force-dynamic'

export const GET = withAuthAndParams(async (request, params, session) => {
 try {
 const { id } = params as { id: string }

 const prisma = await getTenantPrisma()
 const result = await validateTransactionDelete(prisma, session.user, id)
 return NextResponse.json(result)
 } catch (_error) {
 if (_error instanceof TransactionValidationError) {
 return NextResponse.json({ error: _error.message }, { status: _error.status })
 }
 // console.error('Error validating transaction edit:', _error)
 return NextResponse.json(
 { error: 'Failed to validate transaction' },
 { status: 500 }
 )
 }
})
