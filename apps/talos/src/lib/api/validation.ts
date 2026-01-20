import { z } from 'zod'
import DOMPurify from 'isomorphic-dompurify'
import { ValidationError } from './responses'

/**
 * Validate request body against a Zod schema
 */
export async function validateRequest<T>(
 request: Request,
 schema: z.ZodSchema<T>
): Promise<T> {
 try {
 const body = await request.json()
 return schema.parse(body)
 } catch (error) {
 if (error instanceof z.ZodError) {
 const errors = error.issues.reduce((acc, curr) => {
 const path = curr.path.join('.')
 acc[path] = curr.message
 return acc
 }, {} as Record<string, string>)
 
 throw new ValidationError(
 `Validation failed: ${Object.entries(errors)
 .map(([field, message]) => `${field}: ${message}`)
 .join(', ')}`
 )
 }
 throw new ValidationError('Invalid request body')
 }
}

/**
 * Common validation schemas
 */
export const CommonSchemas = {
 id: z.string().min(1, 'ID is required'),
 
 email: z.string().email('Invalid email address'),
 
 date: z.string().regex(
 /^\d{4}-\d{2}-\d{2}$/,
 'Date must be in YYYY-MM-DD format'
 ),
 
 dateTime: z.string().datetime('Invalid datetime format'),
 
 positiveNumber: z.number().positive('Must be a positive number'),
 
 nonNegativeNumber: z.number().nonnegative('Must be non-negative'),
 
 percentage: z.number().min(0).max(100, 'Must be between 0 and 100'),
 
 currency: z.number().multipleOf(0.01, 'Maximum 2 decimal places'),
 
 skuCode: z.string()
 .min(1, 'SKU code is required')
 .max(50, 'SKU code too long'),
 
 warehouseCode: z.string()
 .min(1, 'Warehouse code is required')
 .max(20, 'Warehouse code too long'),
 
 batchLot: z.string()
 .min(1, 'Batch is required')
 .max(100, 'Batch too long'),
 
 pagination: z.object({
 page: z.number().int().positive().default(1),
 limit: z.number().int().positive().max(100).default(20),
 sortBy: z.string().optional(),
 sortOrder: z.enum(['asc', 'desc']).default('desc')
 })
}

/**
 * Sanitize string for safe display
 * Uses DOMPurify to properly remove all HTML and prevent XSS
 */
export function sanitizeForDisplay(input: string): string {
 if (!input) return ''
 
 // Use DOMPurify to strip all HTML tags and dangerous content
 // This properly handles script tags, event handlers, malformed HTML, etc.
 return DOMPurify.sanitize(input, {
 ALLOWED_TAGS: [], // Remove ALL HTML tags
 ALLOWED_ATTR: [],
 KEEP_CONTENT: true // Keep text content only
 }).trim()
}

/**
 * Validate and sanitize array of items
 */
export function validateArray<T>(
 items: unknown[],
 itemSchema: z.ZodSchema<T>,
 maxItems: number = 1000
): T[] {
 if (!Array.isArray(items)) {
 throw new ValidationError('Expected an array')
 }
 
 if (items.length === 0) {
 throw new ValidationError('Array cannot be empty')
 }
 
 if (items.length > maxItems) {
 throw new ValidationError(`Maximum ${maxItems} items allowed`)
 }
 
 return items.map((item, index) => {
 try {
 return itemSchema.parse(item)
 } catch (error) {
 if (error instanceof z.ZodError) {
 throw new ValidationError(
 `Item ${index + 1}: ${error.issues[0].message}`
 )
 }
 throw error
 }
 })
}

/**
 * Parse and validate query parameters
 */
export function parseQueryParams<T>(
 searchParams: URLSearchParams,
 schema: z.ZodSchema<T>
): T {
 const params: Record<string, unknown> = {}
 
 searchParams.forEach((value, key) => {
 // Handle array parameters (e.g., ?status=active&status=pending)
 if (params[key]) {
 if (Array.isArray(params[key])) {
 params[key].push(value)
 } else {
 params[key] = [params[key], value]
 }
 } else {
 // Try to parse numbers
 const num = Number(value)
 params[key] = !isNaN(num) && value !== '' ? num : value
 }
 })
 
 try {
 return schema.parse(params)
 } catch (error) {
 if (error instanceof z.ZodError) {
 throw new ValidationError(
 `Invalid query parameters: ${error.issues[0].message}`
 )
 }
 throw error
 }
}

/**
 * Validate date range
 */
export function validateDateRange(
 startDate: string,
 endDate: string
): { startDate: Date; endDate: Date } {
 const start = new Date(startDate)
 const end = new Date(endDate)
 
 if (isNaN(start.getTime())) {
 throw new ValidationError('Invalid start date')
 }
 
 if (isNaN(end.getTime())) {
 throw new ValidationError('Invalid end date')
 }
 
 if (start > end) {
 throw new ValidationError('Start date must be before end date')
 }
 
 // Check for reasonable date range (e.g., max 1 year)
 const oneYear = 365 * 24 * 60 * 60 * 1000
 if (end.getTime() - start.getTime() > oneYear) {
 throw new ValidationError('Date range cannot exceed 1 year')
 }
 
 return { startDate: start, endDate: end }
}