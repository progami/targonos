/**
 * Accessibility utility functions for consistent form field IDs, names, and ARIA attributes
 */

/**
 * Generate a unique, stable ID for form fields
 * @param prefix - The prefix for the ID (e.g., 'receive', 'ship')
 * @param rowIndex - The row index for dynamic rows (1-based for user clarity)
 * @param fieldName - The name of the field (e.g., 'sku', 'lot')
 * @returns A unique ID string
 */
export function generateFieldId(prefix: string, rowIndex: number | null, fieldName: string): string {
 if (rowIndex !== null) {
 return `${prefix}-item-${rowIndex}-${fieldName}`
 }
 return `${prefix}-${fieldName}`
}

/**
 * Generate consistent name attributes for form fields
 * @param baseName - The base name (e.g., 'items', 'attachments')
 * @param index - Array index for dynamic fields
 * @param property - The property name
 * @returns A properly formatted name attribute
 */
export function generateFieldName(baseName: string, index: number | null, property: string): string {
 if (index !== null) {
 return `${baseName}[${index}].${property}`
 }
 return property
}

/**
 * Generate ARIA label for form fields
 * @param itemNumber - The item number (1-based)
 * @param fieldLabel - The human-readable field label
 * @returns A descriptive ARIA label
 */
export function generateAriaLabel(itemNumber: number | null, fieldLabel: string): string {
 if (itemNumber !== null) {
 return `Item ${itemNumber} ${fieldLabel}`
 }
 return fieldLabel
}

/**
 * Generate complete accessibility props for dynamic form fields
 * @param prefix - Page prefix (e.g., 'receive', 'ship')
 * @param index - Array index (0-based)
 * @param fieldName - Field identifier
 * @param label - Human-readable label
 * @param required - Whether field is required
 * @returns Object with all necessary accessibility props
 */
export function generateDynamicFieldProps(
 prefix: string,
 index: number,
 fieldName: string,
 label: string,
 required: boolean = false
) {
 const rowNumber = index + 1
 const id = generateFieldId(prefix, rowNumber, fieldName)
 
 return {
 id,
 name: generateFieldName('items', index, fieldName),
 'aria-label': generateAriaLabel(rowNumber, label),
 'aria-describedby': `${id}-help ${id}-error`,
 'aria-required': required,
 }
}

/**
 * Generate props for file upload inputs
 * @param documentType - Type of document (e.g., 'packing-list', 'commercial-invoice')
 * @param label - Human-readable label
 * @param acceptedFormats - Accepted file formats
 * @returns Object with accessibility props for file inputs
 */
export function generateFileUploadProps(
 documentType: string,
 label: string,
 acceptedFormats: string = '.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx'
) {
 const id = `${documentType}-upload`
 
 return {
 id,
 name: `${documentType.replace(/-/g, '')}File`,
 'aria-label': `Upload ${label} (Accepted formats: ${acceptedFormats.replace(/\./g, '').toUpperCase()}, Max 5MB)`,
 'aria-describedby': `${id}-help ${id}-error`,
 }
}

/**
 * Generate props for search inputs
 * @param pageName - Name of the page (e.g., 'inventory', 'invoices')
 * @param searchScope - Description of what can be searched
 * @param resultsId - ID of the results container
 * @returns Object with accessibility props for search inputs
 */
export function generateSearchInputProps(
 pageName: string,
 searchScope: string,
 resultsId: string
) {
 return {
 id: `${pageName}-search`,
 name: 'search',
 type: 'search',
 'aria-label': `Search ${searchScope}`,
 'aria-describedby': `${pageName}-search-help`,
 'aria-controls': resultsId,
 }
}

/**
 * Get screen reader only class name
 * @returns The sr-only class name
 */
export function getSrOnlyClass(): string {
 return 'sr-only'
}

/**
 * Generate error message props
 * @param fieldId - The field ID
 * @param error - Error message (if any)
 * @returns Props for error message span
 */
export function generateErrorProps(fieldId: string, error?: string) {
 return {
 id: `${fieldId}-error`,
 className: error ? 'text-red-600 text-sm mt-1' : 'sr-only',
 'aria-live': 'polite' as const,
 children: error || ''
 }
}

/**
 * Generate help text props
 * @param fieldId - The field ID
 * @param helpText - Help text
 * @param visuallyHidden - Whether to hide visually
 * @returns Props for help text span
 */
export function generateHelpProps(fieldId: string, helpText: string, visuallyHidden: boolean = true) {
 return {
 id: `${fieldId}-help`,
 className: visuallyHidden ? 'sr-only' : 'text-sm text-gray-600 mt-1',
 children: helpText
 }
}

/**
 * Check if form has been submitted for validation states
 * @param formSubmitted - Whether form has been submitted
 * @param value - Current field value
 * @param required - Whether field is required
 * @returns Whether field is invalid
 */
export function isFieldInvalid(formSubmitted: boolean, value: unknown, required: boolean): boolean {
 return formSubmitted && required && !value
}

/**
 * Generate table header accessibility props
 * @param columnName - Name of the column
 * @param sortable - Whether column is sortable
 * @param currentSort - Current sort field
 * @param sortDirection - Current sort direction
 * @returns Props for accessible table headers
 */
export function generateTableHeaderProps(
 columnName: string,
 sortable: boolean = false,
 currentSort?: string,
 sortDirection?: 'asc' | 'desc'
) {
 interface TableHeaderProps {
 scope: string
 'aria-label': string
 'aria-sort'?: string
 role?: string
 tabIndex?: number
 }
 const props: TableHeaderProps = {
 scope: 'col',
 'aria-label': columnName,
 }
 
 if (sortable) {
 const isSorted = currentSort === columnName
 props['aria-sort'] = isSorted ? sortDirection : 'none'
 props.role = 'columnheader'
 props.tabIndex = 0
 props['aria-label'] = `${columnName}. ${isSorted ? `Sorted ${sortDirection}ending` : 'Click to sort'}`
 }
 
 return props
}
