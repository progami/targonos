import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/auth-wrapper';
import { validateFile, scanFileContent } from '@/lib/security/file-upload';
import { sanitizeForExcel } from '@/lib/security/input-sanitization';
import { checkRateLimit, rateLimitConfigs } from '@/lib/security/rate-limiter';
import * as XLSX from 'xlsx';
import { z } from 'zod';

const ALLOWED_TYPES = ['.xlsx', '.xls', '.csv'];

export const POST = withAuth(async (request, _session) => {
 try {
 // Rate limit file uploads
 const rateLimitResponse = await checkRateLimit(request, rateLimitConfigs.upload);
 if (rateLimitResponse) return rateLimitResponse;

 const formData = await request.formData();
 const file = formData.get('file') as File;
 
 if (!file) {
 return NextResponse.json({ error: 'No file provided' }, { status: 400 });
 }

 // Validate file
 const buffer = Buffer.from(await file.arrayBuffer());
 const validation = await validateFile(file, 'export', {
 maxSizeMB: 10,
 allowedExtensions: ALLOWED_TYPES.map(t => t.slice(1))
 });

 if (!validation.valid) {
 return NextResponse.json(
 { error: validation.error },
 { status: 400 }
 );
 }

 // Additional content scanning
 const contentScan = await scanFileContent(buffer, file.type);
 if (!contentScan.valid) {
 return NextResponse.json(
 { error: contentScan.error || 'File contains suspicious content' },
 { status: 400 }
 );
 }

 // Parse file based on type
 let data: unknown[] = [];
 const fileExt = file.name.split('.').pop()?.toLowerCase();

 if (fileExt === 'csv') {
 // Parse CSV
 const text = buffer.toString('utf-8');
 const lines = text.split('\n');
 const headers = lines[0].split(',').map(h => h.trim());
 
 for (let i = 1; i < lines.length; i++) {
 if (lines[i].trim()) {
 const values = lines[i].split(',');
 const row: Record<string, string> = {};
 headers.forEach((header, index) => {
 row[header] = sanitizeForExcel(values[index]?.trim() || '');
 });
 data.push(row);
 }
 }
 } else {
 // Parse Excel
 const workbook = XLSX.read(buffer, { type: 'buffer' });
 const sheetName = workbook.SheetNames[0];
 const sheet = workbook.Sheets[sheetName];
 
 // Convert to JSON with sanitization
 const rawData = XLSX.utils.sheet_to_json(sheet);
 data = rawData.map(row => {
 const sanitizedRow: Record<string, string> = {};
 for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
 sanitizedRow[key] = sanitizeForExcel(String(value));
 }
 return sanitizedRow;
 });
 }

 // Validate data structure
 const rowSchema = z.object({
 SKU: z.string().min(1),
 Name: z.string().min(1),
 Quantity: z.coerce.number().positive().int(),
 Warehouse: z.string().min(1),
 BatchNumber: z.string().optional()
 });

 const validationErrors: unknown[] = [];
 const validRows: unknown[] = [];

 for (let i = 0; i < data.length; i++) {
 const result = rowSchema.safeParse(data[i]);
 if (result.success) {
 validRows.push(result.data);
 } else {
 validationErrors.push({
 row: i + 2, // +1 for header, +1 for 0-index
 errors: result.error.issues
 });
 }
 }

 if (validationErrors.length > 0) {
 return NextResponse.json({
 error: 'Validation errors in file',
 validRows: validRows.length,
 errors: validationErrors.slice(0, 10) // Limit error response
 }, { status: 400 });
 }

 // Process valid rows in batches to avoid memory issues
 const BATCH_SIZE = 100;
 const results = [];
 
 for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
 const batch = validRows.slice(i, i + BATCH_SIZE);
 // Process batch...
 results.push({ batch: i / BATCH_SIZE + 1, processed: batch.length });
 }

 return NextResponse.json({
 success: true,
 totalRows: validRows.length,
 batches: results
 });

 } catch (_error: unknown) {
 // console.error('Upload error:', error);
 return NextResponse.json(
 { error: 'Failed to process file' },
 { status: 500 }
 );
 }
})
