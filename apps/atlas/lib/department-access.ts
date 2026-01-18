import { prisma } from '@/lib/prisma'

export type DepartmentRef = {
  name: string
  code: string | null
}

export const PASSWORD_DEPARTMENTS = ['OPS', 'SALES_MARKETING', 'LEGAL', 'HR', 'FINANCE'] as const
export type PasswordDepartment = (typeof PASSWORD_DEPARTMENTS)[number]

type EmployeeDepartmentQuery = {
  department: string
  dept: { name: string; code: string | null } | null
  departments: { department: { name: string; code: string | null } }[]
}

export async function getDepartmentRefsForEmployee(employeeId: string): Promise<DepartmentRef[] | null> {
  const employee: EmployeeDepartmentQuery | null = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      department: true,
      dept: { select: { name: true, code: true } },
      departments: { select: { department: { select: { name: true, code: true } } } },
    },
  })

  if (!employee) return null

  const refs: DepartmentRef[] = []
  refs.push({ name: employee.department, code: null })

  if (employee.dept) {
    refs.push({ name: employee.dept.name, code: employee.dept.code })
  }

  for (const membership of employee.departments) {
    refs.push({ name: membership.department.name, code: membership.department.code })
  }

  const seen = new Set<string>()
  const unique: DepartmentRef[] = []
  for (const ref of refs) {
    const key = `${ref.name.trim().toLowerCase()}|${ref.code?.trim().toLowerCase() ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(ref)
  }

  return unique
}

function normalizeDepartmentToken(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/&/g, 'AND')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function mapDepartmentRefToPasswordDepartment(ref: DepartmentRef): PasswordDepartment | null {
  if (ref.code) {
    const code = normalizeDepartmentToken(ref.code)
    if (code === 'OPS') return 'OPS'
    if (code === 'HR') return 'HR'
    if (code === 'LEGAL') return 'LEGAL'
    if (code === 'FIN') return 'FINANCE'
    if (code === 'FINANCE') return 'FINANCE'
    if (code === 'SALES') return 'SALES_MARKETING'
    if (code === 'SALES_MARKETING') return 'SALES_MARKETING'
  }

  const name = normalizeDepartmentToken(ref.name)
  if (name === 'OPERATIONS') return 'OPS'
  if (name === 'OPS') return 'OPS'
  if (name === 'HR') return 'HR'
  if (name === 'HUMAN_RESOURCES') return 'HR'
  if (name === 'HR_AND_TRAINING') return 'HR'
  if (name === 'LEGAL') return 'LEGAL'
  if (name === 'FIN') return 'FINANCE'
  if (name === 'FINANCE') return 'FINANCE'
  if (name === 'ACCOUNTING') return 'FINANCE'
  if (name === 'SALES') return 'SALES_MARKETING'
  if (name === 'SALES_AND_MARKETING') return 'SALES_MARKETING'
  if (name === 'SALES_MARKETING') return 'SALES_MARKETING'
  if (name === 'MARKETING') return 'SALES_MARKETING'

  return null
}

export function getAllowedPasswordDepartments(refs: DepartmentRef[]): PasswordDepartment[] {
  const unique = new Set<PasswordDepartment>()
  for (const ref of refs) {
    const mapped = mapDepartmentRefToPasswordDepartment(ref)
    if (!mapped) continue
    unique.add(mapped)
  }
  return Array.from(unique)
}

export function getAllowedDepartmentStrings(refs: DepartmentRef[]): string[] {
  const unique = new Map<string, string>()

  function add(value: string) {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return
    if (unique.has(normalized)) return
    unique.set(normalized, value.trim())
  }

  for (const ref of refs) {
    add(ref.name)
    if (ref.code) add(ref.code)
  }

  return Array.from(unique.values())
}
