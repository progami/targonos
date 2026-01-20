/**
 * Generate Import Templates
 * Creates Excel templates with proper column headers for data import
 */

import { importConfigs } from '../lib/import-config'
import * as XLSX from 'xlsx'
import * as path from 'path'
import * as fs from 'fs'

// Sample data for each entity type
const sampleData: Record<string, unknown[]> = {
 inventoryTransactions: [
 {
 'Transaction Date': new Date().toISOString().split('T')[0],
 'Type': 'RECEIVE',
 'Warehouse': 'MAIN',
 'SKU Code': 'SKU001',
 'Batch': '2025001',
 'Reference': 'PO-12345',
 'Cartons In': 100,
 'Cartons Out': 0,
 'Storage Pallets In': 4,
 'Shipping Pallets Out': 0,
 'Storage Cartons/Pallet': 25,
 'Tracking Number': 'TRACK123456',
 'Ship Name': 'Container ABC123'
 },
 {
 'Transaction Date': new Date().toISOString().split('T')[0],
 'Type': 'SHIP',
 'Warehouse': 'MAIN',
 'SKU Code': 'SKU001',
 'Batch': '2025001',
 'Reference': 'SO-67890',
 'Cartons In': 0,
 'Cartons Out': 50,
 'Storage Pallets In': 0,
 'Shipping Pallets Out': 2,
 'Shipping Cartons/Pallet': 25,
 'Tracking Number': 'FEDEX789012'
 }
 ],
 skus: [
 {
 'SKU Code': 'SKU001',
 'ASIN': 'B08ABC1234',
 'Description': 'Sample Product - Widget A',
	 'Pack Size': 12,
	 'Material': 'Plastic',
	 'Item dimensions (cm)': '10x5x3',
	 'Item weight (kg)': 0.15,
	 'Units Per Carton': 144,
	 'Carton Dimensions (cm)': '40x30x20',
	 'Carton Weight (kg)': 22.5,
	 'Packaging Type': 'Box'
 }
 ],
 warehouses: [
 {
 'Code': 'MAIN',
 'Name': 'Main Distribution Center',
 'Address': '123 Warehouse St, City, State 12345',
 'Latitude': 41.8781,
 'Longitude': -87.6298,
 'Contact Email': 'main@warehouse.com',
 'Contact Phone': '+1-555-0123'
 }
 ],
 costRates: [
 {
 'Warehouse': 'MAIN',
 'Cost Category': 'Storage',
 'Cost Name': 'Pallet Storage - Standard',
 'Cost Value': 15.00,
 'Unit of Measure': 'pallet/week',
 'Effective Date': new Date().toISOString().split('T')[0]
 }
 ]
}

function generateTemplate(entityName: string): void {
 const config = importConfigs[entityName]
 if (!config) {
 // console.error(`No configuration found for entity: ${entityName}`)
 return
 }

 // console.log(`\n📄 Generating template for: ${config.displayName}`)

 // Create headers using the first (primary) column name from each field
 const headers = config.fieldMappings
 .filter(field => field.dbField !== 'id') // Exclude auto-generated fields
 .map(field => field.excelColumns[0]) // Use the primary column name

 // Create worksheet data
 const wsData = [headers]
 
 // Add sample data if available
 if (sampleData[entityName]) {
 sampleData[entityName].forEach(row => {
 const rowData = headers.map(header => row[header] || '')
 wsData.push(rowData)
 })
 }

 // Create workbook
 const wb = XLSX.utils.book_new()
 const ws = XLSX.utils.aoa_to_sheet(wsData)

 // Auto-size columns
 const colWidths = headers.map(header => ({ wch: Math.max(header.length + 2, 15) }))
 ws['!cols'] = colWidths

 // Add the worksheet
 XLSX.utils.book_append_sheet(wb, ws, 'Data')

 // Create instructions sheet
 const instructions = [
 [`${config.displayName} Import Template`],
 [''],
 ['Instructions:'],
 ['1. Fill in the data starting from row 2'],
 ['2. Do not modify the column headers'],
 ['3. Required fields must be filled for each row'],
 ['4. Date fields should be in YYYY-MM-DD format'],
 ['5. Leave optional fields empty if not applicable'],
 [''],
 ['Field Reference:'],
 ['Column Name', 'Required', 'Type', 'Notes']
 ]

 config.fieldMappings.forEach(field => {
 const notes = []
 if (field.defaultValue !== undefined) {
 notes.push(`Default: ${field.defaultValue}`)
 }
 if (field.validate) {
 notes.push('Has validation')
 }
 if (field.dbField === 'transactionType') {
 notes.push('Values: RECEIVE, SHIP, ADJUST_IN, ADJUST_OUT, TRANSFER')
 }
 
 instructions.push([
 field.excelColumns[0],
 field.required ? 'Yes' : 'No',
 field.type,
 notes.join('; ') || ''
 ])
 })

 const wsInstructions = XLSX.utils.aoa_to_sheet(instructions)
 wsInstructions['!cols'] = [
 { wch: 30 }, // Column Name
 { wch: 10 }, // Required
 { wch: 10 }, // Type
 { wch: 50 } // Notes
 ]
 
 XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions')

 // Create templates directory if it doesn't exist
 const templatesDir = path.join(process.cwd(), 'templates')
 if (!fs.existsSync(templatesDir)) {
 fs.mkdirSync(templatesDir, { recursive: true })
 }

 // Write the file
 const fileName = `${entityName}_import_template.xlsx`
 const filePath = path.join(templatesDir, fileName)
 XLSX.writeFile(wb, filePath)
 
 // console.log(`✅ Template saved to: templates/${fileName}`)
}

// Generate templates for all entities
// console.log('🚀 Generating Import Templates')
// console.log('=' .repeat(50))

Object.keys(importConfigs).forEach(entityName => {
 generateTemplate(entityName)
})

// console.log('\n✅ All templates generated successfully!')
// console.log('\nTemplates are saved in the "templates" directory.')
// console.log('These templates include:')
// console.log('- Properly formatted column headers')
// console.log('- Sample data (where applicable)')
// console.log('- Instructions sheet with field reference')
