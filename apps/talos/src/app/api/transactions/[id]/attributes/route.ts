import { NextResponse } from 'next/server'
import { withAuthAndParams } from '@/lib/api/auth-wrapper'
import { getTenantPrisma } from '@/lib/tenant/server'
import { Prisma } from '@targon/prisma-talos'
import { sanitizeForDisplay } from '@/lib/security/input-sanitization'
import { parseLocalDate } from '@/lib/utils/date-helpers'
import { isRecord } from '@/lib/utils/type-coercion'

export const dynamic = 'force-dynamic'

export const PATCH = withAuthAndParams(async (request, params, session) => {
 try {
 const { id } = params as { id: string }

 const prisma = await getTenantPrisma()
 const body = await request.json()
 const { 
 shipName, 
 trackingNumber, 
 pickupDate,
 supplier,
 notes,
 attachments,
 referenceId,
 cartonsIn,
 cartonsOut,
 storagePalletsIn,
 shippingPalletsOut,
 unitsPerCarton,
 storageCartonsPerPallet,
 shippingCartonsPerPallet
 } = body

 // Sanitize inputs
 const sanitizedData: Prisma.InventoryTransactionUpdateInput = {}

 let sanitizedShipName: string | null | undefined
 let sanitizedTrackingNumber: string | null | undefined
 let sanitizedSupplier: string | null | undefined
 let sanitizedReferenceId: string | null | undefined
 
 if (shipName !== undefined) {
 sanitizedShipName = shipName ? sanitizeForDisplay(shipName) : null
 sanitizedData.shipName = sanitizedShipName
 }
 if (trackingNumber !== undefined) {
 sanitizedTrackingNumber = trackingNumber ? sanitizeForDisplay(trackingNumber) : null
 sanitizedData.trackingNumber = sanitizedTrackingNumber
 }
 if (pickupDate !== undefined) {
 const parsedDate = parseLocalDate(pickupDate)
 sanitizedData.pickupDate = parsedDate
 }
 if (supplier !== undefined) {
 sanitizedSupplier = supplier ? sanitizeForDisplay(supplier) : null
 sanitizedData.supplier = sanitizedSupplier
 }
 if (referenceId !== undefined) {
 sanitizedReferenceId = referenceId ? sanitizeForDisplay(referenceId) : null
 sanitizedData.referenceId = sanitizedReferenceId
 }
 
 // Handle quantity fields
 if (cartonsIn !== undefined) {
 sanitizedData.cartonsIn = cartonsIn
 }
 if (cartonsOut !== undefined) {
 sanitizedData.cartonsOut = cartonsOut
 }
 if (storagePalletsIn !== undefined) {
 sanitizedData.storagePalletsIn = storagePalletsIn
 }
 if (shippingPalletsOut !== undefined) {
 sanitizedData.shippingPalletsOut = shippingPalletsOut
 }
 if (unitsPerCarton !== undefined) {
 sanitizedData.unitsPerCarton = unitsPerCarton
 }
 if (storageCartonsPerPallet !== undefined) {
 sanitizedData.storageCartonsPerPallet = storageCartonsPerPallet
 }
 if (shippingCartonsPerPallet !== undefined) {
 sanitizedData.shippingCartonsPerPallet = shippingCartonsPerPallet
 }
 
 // Handle attachments + notes
 if (attachments !== undefined || notes !== undefined) {
 // Get existing transaction to preserve other attachments
 const existingTx = await prisma.inventoryTransaction.findUnique({
 where: { id },
 select: { attachments: true }
 })
 
 const updatedAttachments: Record<string, unknown> = (() => {
 if (!existingTx?.attachments) {
 return {}
 }
 
 if (Array.isArray(existingTx.attachments)) {
 return Object.fromEntries(
 (existingTx.attachments as unknown[])
 .map(entry => {
 if (!isRecord(entry)) return null
 const category = typeof entry.type === 'string' ? entry.type : undefined
 if (!category || category === 'notes') {
 return null
 }
 return [category, entry] as const
 })
 .filter((pair): pair is readonly [string, Record<string, unknown>] => pair !== null)
 )
 }
 
 if (typeof existingTx.attachments === 'object') {
 return { ...(existingTx.attachments as Record<string, unknown>) }
 }
 
 return {}
 })()
 
 if (notes !== undefined) {
 const sanitizedNotes = notes ? sanitizeForDisplay(notes) : null
 if (sanitizedNotes) {
 updatedAttachments.notes = sanitizedNotes
 } else {
 delete updatedAttachments.notes
 }
 }
 
 if (attachments !== undefined) {
 if (isRecord(attachments)) {
 for (const [key, value] of Object.entries(attachments)) {
 updatedAttachments[key] = value
 }
 }
 }
 
 const keys = Object.keys(updatedAttachments)
 sanitizedData.attachments = keys.length > 0
 ? (updatedAttachments as unknown as Prisma.InputJsonValue)
 : Prisma.JsonNull
 }

 // Get current transaction for audit log
 const currentTransaction = await prisma.inventoryTransaction.findUnique({
 where: { id },
 select: {
 shipName: true,
 trackingNumber: true,
 pickupDate: true,
 supplier: true,
 attachments: true,
 referenceId: true,
 cartonsIn: true,
 cartonsOut: true,
 storagePalletsIn: true,
 shippingPalletsOut: true,
 unitsPerCarton: true,
 storageCartonsPerPallet: true,
 shippingCartonsPerPallet: true
 }
 })

 // Update transaction
 const updatedTransaction = await prisma.inventoryTransaction.update({
 where: { id },
 data: sanitizedData,
 select: {
 id: true,
 shipName: true,
 trackingNumber: true,
 pickupDate: true,
 supplier: true,
 cartonsIn: true,
 cartonsOut: true,
 storagePalletsIn: true,
 shippingPalletsOut: true,
 unitsPerCarton: true,
 storageCartonsPerPallet: true,
 shippingCartonsPerPallet: true
 }
 })

 // Create audit log
 interface Changes {
 fields: string[]
 before: Record<string, string | null>
 after: Record<string, string | null>
 }
 const changes: Changes = {
 fields: [],
 before: {},
 after: {}
 }

 // Track what changed
 if (shipName !== undefined && currentTransaction?.shipName !== sanitizedShipName) {
 changes.fields.push('shipName')
 changes.before.shipName = currentTransaction?.shipName
 changes.after.shipName = sanitizedShipName ?? null
 }
 if (trackingNumber !== undefined && currentTransaction?.trackingNumber !== sanitizedTrackingNumber) {
 changes.fields.push('trackingNumber')
 changes.before.trackingNumber = currentTransaction?.trackingNumber
 changes.after.trackingNumber = sanitizedTrackingNumber ?? null
 }
 if (supplier !== undefined && currentTransaction?.supplier !== sanitizedSupplier) {
 changes.fields.push('supplier')
 changes.before.supplier = currentTransaction?.supplier
 changes.after.supplier = sanitizedSupplier ?? null
 }
 if (referenceId !== undefined && currentTransaction?.referenceId !== sanitizedReferenceId) {
 changes.fields.push('referenceId')
 changes.before.referenceId = currentTransaction?.referenceId
 changes.after.referenceId = sanitizedReferenceId ?? null
 }

 if (changes.fields.length > 0) {
 await prisma.auditLog.create({
 data: {
 entity: 'inventory_transactions',
 entityId: id,
 action: 'UPDATE',
 newValue: changes as unknown as Prisma.InputJsonValue,
 userId: session.user.id
 }
 })
 }

 return NextResponse.json(updatedTransaction)
 } catch (_error) {
 // console.error('Failed to update transaction attributes:', _error)
 return NextResponse.json({ 
 error: 'Failed to update transaction attributes',
 details: _error instanceof Error ? _error.message : 'Unknown error'
 }, { status: 500 })
 }
})
