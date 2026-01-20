// Export configurations for different models
// This file can be easily updated when schema changes without touching the export logic

import type { FieldConfig, ExportFieldValue, FieldFormatter } from './dynamic-export'
import { ExportConfig } from './dynamic-export'
import { INVENTORY_TRANSACTION_COLUMNS, INVENTORY_BALANCE_COLUMNS } from './column-ordering'

const formatOptionalValue: FieldFormatter = (value: unknown): ExportFieldValue => {
 if (value === null || value === undefined) {
 return null
 }

 if (typeof value === 'string') {
 return value
 }

 if (typeof value === 'number' || typeof value === 'boolean') {
 return value
 }

 if (value instanceof Date) {
 return value
 }

 if (typeof value === 'object' && 'toString' in value) {
 try {
 return (value as { toString(): string }).toString()
 } catch (_error) {
 return null
 }
 }

 return null
}

const attachmentsContain = (value: unknown, keys: string[]): boolean => {
 if (!value) {
 return false
 }

 if (Array.isArray(value)) {
 return value.some((entry) => {
 if (!entry || typeof entry !== 'object') {
 return false
 }
 const record = entry as Record<string, unknown>
 const type = typeof record.type === 'string' ? record.type : undefined
 return type ? keys.includes(type) : false
 })
 }

 if (typeof value === 'object') {
 const record = value as Record<string, unknown>
 return keys.some((key) => key in record)
 }

 return false
}

// Helper function to generate export fields from column definitions
function generateExportFields(columns: typeof INVENTORY_TRANSACTION_COLUMNS): FieldConfig[] {
 return columns
 .filter(col => col.showInExport)
 .sort((a, b) => a.order - b.order)
 .map(col => {
 const field: FieldConfig = {
 fieldName: col.isRelation ? col.relationPath! : col.fieldName,
 columnName: col.exportName,
 }
 
 if (col.isRelation) {
 field.isRelation = true
 field.format = formatOptionalValue
 }
 
 // Special formatting for document boolean fields
 if (col.fieldName === 'hasCommercialInvoice') {
 field.fieldName = 'attachments'
 field.format = (value: unknown): ExportFieldValue =>
 attachmentsContain(value, ['commercialInvoice', 'commercial_invoice']) ? 'Yes' : 'No'
 }
 
 if (col.fieldName === 'hasBillOfLading') {
 field.fieldName = 'attachments'
 field.format = (value: unknown): ExportFieldValue =>
 attachmentsContain(value, ['billOfLading', 'bill_of_lading']) ? 'Yes' : 'No'
 }
 
 if (col.fieldName === 'hasPackingList') {
 field.fieldName = 'attachments'
 field.format = (value: unknown): ExportFieldValue =>
 attachmentsContain(value, ['packingList', 'packing_list']) ? 'Yes' : 'No'
 }
 
 if (col.fieldName === 'hasDeliveryNote') {
 field.fieldName = 'attachments'
 field.format = (value: unknown): ExportFieldValue =>
 attachmentsContain(value, ['movementNote', 'movement_note', 'deliveryNote', 'delivery_note']) ? 'Yes' : 'No'
 }
 
 if (col.fieldName === 'hasCubeMaster') {
 field.fieldName = 'attachments'
 field.format = (value: unknown): ExportFieldValue =>
 attachmentsContain(value, ['cubeMaster', 'cube_master']) ? 'Yes' : 'No'
 }
 
 if (col.fieldName === 'hasTransactionCertificate') {
 field.fieldName = 'attachments'
 field.format = (value: unknown): ExportFieldValue =>
 attachmentsContain(value, ['transactionCertificate', 'transaction_certificate', 'tcGrs']) ? 'Yes' : 'No'
 }
 
 if (col.fieldName === 'hasCustomDeclaration') {
 field.fieldName = 'attachments'
 field.format = (value: unknown): ExportFieldValue =>
 attachmentsContain(value, ['customDeclaration', 'custom_declaration']) ? 'Yes' : 'No'
 }
 
 if (col.fieldName === 'hasProofOfPickup') {
 field.fieldName = 'attachments'
 field.format = (value: unknown): ExportFieldValue =>
 attachmentsContain(value, ['proofOfPickup', 'proof_of_pickup']) ? 'Yes' : 'No'
 }
 
 return field
 })
}

// Inventory Transaction Export Configuration
export const inventoryTransactionConfig: Partial<ExportConfig> = {
 modelName: 'InventoryTransaction',
 
 // Fields to exclude from export (internal IDs, etc.)
 excludeFields: ['id', 'warehouseId', 'skuId', 'createdById', 'transactionId'],
 
 // Relations to include in the export
 includeRelations: ['warehouse', 'sku', 'createdBy'],
 
 // Custom field configurations - Using standardized column ordering
 fields: generateExportFields(INVENTORY_TRANSACTION_COLUMNS)
}

// Inventory Balance Export Configuration
export const inventoryBalanceConfig: Partial<ExportConfig> = {
 modelName: 'InventoryBalance',
 excludeFields: ['id', 'warehouseId', 'skuId'],
 includeRelations: ['warehouse', 'sku'],
 fields: generateExportFields(INVENTORY_BALANCE_COLUMNS)
}

// SKU Export Configuration
export const skuConfig: Partial<ExportConfig> = {
 modelName: 'Sku',
 excludeFields: ['id'],
 fields: [
 { fieldName: 'skuCode', columnName: 'SKU Code' },
 { fieldName: 'asin', columnName: 'ASIN' },
 { fieldName: 'description', columnName: 'Description' },
 { fieldName: 'packSize', columnName: 'Pack Size' },
 { fieldName: 'material', columnName: 'Material' },
 { fieldName: 'itemDimensionsCm', columnName: 'Item dimensions (cm)' },
 { fieldName: 'itemWeightKg', columnName: 'Item weight (kg)' },
 { fieldName: 'unitsPerCarton', columnName: 'Units Per Carton' },
 { fieldName: 'cartonDimensionsCm', columnName: 'Carton Dimensions (cm)' },
 { fieldName: 'cartonWeightKg', columnName: 'Carton Weight (kg)' },
 { fieldName: 'packagingType', columnName: 'Packaging Type' },
 { fieldName: 'fbaStock', columnName: 'FBA Stock' },
 { fieldName: 'fbaStockLastUpdated', columnName: 'FBA Stock Last Updated' },
 { fieldName: 'notes', columnName: 'Notes' },
 ]
}

// Add more configurations as needed for other models...
