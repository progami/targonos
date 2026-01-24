'use client'

import { ReactNode } from 'react'
import { AlertCircle } from '@/lib/lucide-icons'

interface FormFieldProps {
 label: string
 name: string
 error?: string
 required?: boolean
 hint?: string
 children: ReactNode
 className?: string
}

export function FormField({
 label,
 name,
 error,
 required = false,
 hint,
 children,
 className = ''
}: FormFieldProps) {
 return (
 <div className={`space-y-1 ${className}`}>
 <label 
 htmlFor={name}
 className="block text-sm font-medium text-foreground"
 >
 {label}
 {required && <span className="text-red-500 ml-1">*</span>}
 </label>
 
 {children}
 
 {hint && !error && (
 <p className="text-xs text-muted-foreground">{hint}</p>
 )}
 
 {error && (
 <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
 <AlertCircle className="h-3 w-3" />
 <p className="text-xs">{error}</p>
 </div>
 )}
 </div>
 )
}

interface InputFieldProps extends Omit<FormFieldProps, 'children'> {
 type?: string
 value: string | number
 onChange: (value: string) => void
 placeholder?: string
 disabled?: boolean
 min?: number
 max?: number
 step?: number
}

export function InputField({
 type = 'text',
 value,
 onChange,
 placeholder,
 disabled = false,
 min,
 max,
 step,
 ...fieldProps
}: InputFieldProps) {
 return (
 <FormField {...fieldProps}>
 <input
 id={fieldProps.name}
 name={fieldProps.name}
 type={type}
 value={value}
 onChange={(e) => onChange(e.target.value)}
 placeholder={placeholder}
 disabled={disabled}
 min={min}
 max={max}
 step={step}
  className={`
  w-full px-3 py-2 border rounded-lg text-foreground bg-background
  focus:outline-none focus:ring-2 focus:ring-cyan-600
  ${fieldProps.error ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'}
  ${disabled ? 'bg-slate-100 dark:bg-slate-800 cursor-not-allowed' : ''}
  `}
 />
 </FormField>
 )
}

interface SelectFieldProps extends Omit<FormFieldProps, 'children'> {
 value: string
 onChange: (value: string) => void
 options: { value: string; label: string }[]
 placeholder?: string
 disabled?: boolean
}

export function SelectField({
 value,
 onChange,
 options,
 placeholder = 'Select...',
 disabled = false,
 ...fieldProps
}: SelectFieldProps) {
 return (
 <FormField {...fieldProps}>
 <select
 id={fieldProps.name}
 name={fieldProps.name}
 value={value}
 onChange={(e) => onChange(e.target.value)}
 disabled={disabled}
  className={`
  w-full px-3 py-2 border rounded-lg text-foreground bg-background
  focus:outline-none focus:ring-2 focus:ring-cyan-600
  ${fieldProps.error ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'}
  ${disabled ? 'bg-slate-100 dark:bg-slate-800 cursor-not-allowed' : ''}
  `}
 >
 <option value="">{placeholder}</option>
 {options.map((option) => (
 <option key={option.value} value={option.value}>
 {option.label}
 </option>
 ))}
 </select>
 </FormField>
 )
}

interface TextAreaFieldProps extends Omit<FormFieldProps, 'children'> {
 value: string
 onChange: (value: string) => void
 placeholder?: string
 disabled?: boolean
 rows?: number
}

export function TextAreaField({
 value,
 onChange,
 placeholder,
 disabled = false,
 rows = 3,
 ...fieldProps
}: TextAreaFieldProps) {
 return (
 <FormField {...fieldProps}>
 <textarea
 id={fieldProps.name}
 name={fieldProps.name}
 value={value}
 onChange={(e) => onChange(e.target.value)}
 placeholder={placeholder}
 disabled={disabled}
 rows={rows}
  className={`
  w-full px-3 py-2 border rounded-lg text-foreground bg-background
  focus:outline-none focus:ring-2 focus:ring-cyan-600
  ${fieldProps.error ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'}
  ${disabled ? 'bg-slate-100 dark:bg-slate-800 cursor-not-allowed' : ''}
  `}
 />
 </FormField>
 )
}

interface CheckboxFieldProps {
 label: string
 name: string
 checked: boolean
 onChange: (checked: boolean) => void
 disabled?: boolean
 hint?: string
 className?: string
}

export function CheckboxField({
 label,
 name,
 checked,
 onChange,
 disabled = false,
 hint,
 className = ''
}: CheckboxFieldProps) {
 return (
 <div className={`space-y-1 ${className}`}>
 <label className="flex items-center gap-2 cursor-pointer">
 <input
 id={name}
 name={name}
 type="checkbox"
 checked={checked}
 onChange={(e) => onChange(e.target.checked)}
 disabled={disabled}
 className={`
 h-4 w-4 text-cyan-600 rounded
 focus:ring-2 focus:ring-cyan-600
 ${disabled ? 'cursor-not-allowed' : ''}
 `}
 />
 <span className="text-sm font-medium text-foreground">
 {label}
 </span>
 </label>
 
 {hint && (
 <p className="text-xs text-muted-foreground ml-6">{hint}</p>
 )}
 </div>
 )
}