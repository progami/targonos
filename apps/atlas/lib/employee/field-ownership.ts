export type AttributePermission = 'GOOGLE_CONTROLLED' | 'USER_EDITABLE' | 'MANAGER_EDITABLE'

export type EmployeeFieldEditableBy = 'SYSTEM' | 'SELF' | 'MANAGER' | 'HR' | 'ADMIN'

export type EmployeeFieldOwnership = {
  permission: AttributePermission
  editableBy: EmployeeFieldEditableBy
  requiresApproval: boolean
  uiLabel: string
  lockedReason: string
}

export const EMPLOYEE_FIELD_OWNERSHIP: Record<string, EmployeeFieldOwnership> = {
  // System-managed identifiers
  employeeNumber: {
    permission: 'GOOGLE_CONTROLLED',
    editableBy: 'SYSTEM',
    requiresApproval: false,
    uiLabel: 'Auto-generated',
    lockedReason: 'Auto-generated',
  },
  employeeId: {
    permission: 'GOOGLE_CONTROLLED',
    editableBy: 'SYSTEM',
    requiresApproval: false,
    uiLabel: 'Auto-generated',
    lockedReason: 'Auto-generated',
  },

  // Google controlled (read-only, comes from Google Admin)
  firstName: {
    permission: 'GOOGLE_CONTROLLED',
    editableBy: 'SYSTEM',
    requiresApproval: false,
    uiLabel: 'Synced from Google Workspace',
    lockedReason: 'Synced from Google Workspace',
  },
  lastName: {
    permission: 'GOOGLE_CONTROLLED',
    editableBy: 'SYSTEM',
    requiresApproval: false,
    uiLabel: 'Synced from Google Workspace',
    lockedReason: 'Synced from Google Workspace',
  },
  email: {
    permission: 'GOOGLE_CONTROLLED',
    editableBy: 'SYSTEM',
    requiresApproval: false,
    uiLabel: 'Synced from Google Workspace',
    lockedReason: 'Synced from Google Workspace',
  },
  googleId: {
    permission: 'GOOGLE_CONTROLLED',
    editableBy: 'SYSTEM',
    requiresApproval: false,
    uiLabel: 'Synced from Google Workspace',
    lockedReason: 'Synced from Google Workspace',
  },
  avatar: {
    permission: 'GOOGLE_CONTROLLED',
    editableBy: 'SYSTEM',
    requiresApproval: false,
    uiLabel: 'Synced from Google Workspace',
    lockedReason: 'Synced from Google Workspace',
  },

  // User editable (employee can edit own)
  phone: {
    permission: 'USER_EDITABLE',
    editableBy: 'SELF',
    requiresApproval: false,
    uiLabel: 'Editable by you',
    lockedReason: 'You can only edit your own profile for this field',
  },
  address: {
    permission: 'USER_EDITABLE',
    editableBy: 'SELF',
    requiresApproval: false,
    uiLabel: 'Editable by you',
    lockedReason: 'You can only edit your own profile for this field',
  },
  city: {
    permission: 'USER_EDITABLE',
    editableBy: 'SELF',
    requiresApproval: false,
    uiLabel: 'Editable by you',
    lockedReason: 'You can only edit your own profile for this field',
  },
  country: {
    permission: 'USER_EDITABLE',
    editableBy: 'SELF',
    requiresApproval: false,
    uiLabel: 'Editable by you',
    lockedReason: 'You can only edit your own profile for this field',
  },
  postalCode: {
    permission: 'USER_EDITABLE',
    editableBy: 'SELF',
    requiresApproval: false,
    uiLabel: 'Editable by you',
    lockedReason: 'You can only edit your own profile for this field',
  },
  emergencyContact: {
    permission: 'USER_EDITABLE',
    editableBy: 'SELF',
    requiresApproval: false,
    uiLabel: 'Editable by you',
    lockedReason: 'You can only edit your own profile for this field',
  },
  emergencyPhone: {
    permission: 'USER_EDITABLE',
    editableBy: 'SELF',
    requiresApproval: false,
    uiLabel: 'Editable by you',
    lockedReason: 'You can only edit your own profile for this field',
  },
  dateOfBirth: {
    permission: 'USER_EDITABLE',
    editableBy: 'SELF',
    requiresApproval: false,
    uiLabel: 'Editable by you',
    lockedReason: 'You can only edit your own profile for this field',
  },
  gender: {
    permission: 'USER_EDITABLE',
    editableBy: 'SELF',
    requiresApproval: false,
    uiLabel: 'Editable by you',
    lockedReason: 'You can only edit your own profile for this field',
  },
  maritalStatus: {
    permission: 'USER_EDITABLE',
    editableBy: 'SELF',
    requiresApproval: false,
    uiLabel: 'Editable by you',
    lockedReason: 'You can only edit your own profile for this field',
  },
  nationality: {
    permission: 'USER_EDITABLE',
    editableBy: 'SELF',
    requiresApproval: false,
    uiLabel: 'Editable by you',
    lockedReason: 'You can only edit your own profile for this field',
  },

  // HR editable (org / employment)
  department: {
    permission: 'MANAGER_EDITABLE',
    editableBy: 'HR',
    requiresApproval: false,
    uiLabel: 'Editable by HR only',
    lockedReason: 'Only HR and Super Admin can edit this field',
  },
  departmentId: {
    permission: 'MANAGER_EDITABLE',
    editableBy: 'HR',
    requiresApproval: false,
    uiLabel: 'Editable by HR only',
    lockedReason: 'Only HR and Super Admin can edit this field',
  },
  position: {
    permission: 'MANAGER_EDITABLE',
    editableBy: 'HR',
    requiresApproval: false,
    uiLabel: 'Editable by HR only',
    lockedReason: 'Only HR and Super Admin can edit this field',
  },
  employmentType: {
    permission: 'MANAGER_EDITABLE',
    editableBy: 'HR',
    requiresApproval: false,
    uiLabel: 'Editable by HR only',
    lockedReason: 'Only HR and Super Admin can edit this field',
  },
  joinDate: {
    permission: 'MANAGER_EDITABLE',
    editableBy: 'HR',
    requiresApproval: false,
    uiLabel: 'Editable by HR only',
    lockedReason: 'Only HR and Super Admin can edit this field',
  },
  status: {
    permission: 'MANAGER_EDITABLE',
    editableBy: 'HR',
    requiresApproval: false,
    uiLabel: 'Editable by HR only',
    lockedReason: 'Only HR and Super Admin can edit this field',
  },
  region: {
    permission: 'MANAGER_EDITABLE',
    editableBy: 'HR',
    requiresApproval: false,
    uiLabel: 'Editable by HR only',
    lockedReason: 'Only HR and Super Admin can edit this field',
  },
  exitReason: {
    permission: 'MANAGER_EDITABLE',
    editableBy: 'HR',
    requiresApproval: false,
    uiLabel: 'Editable by HR only',
    lockedReason: 'Only HR and Super Admin can edit this field',
  },
  lastWorkingDay: {
    permission: 'MANAGER_EDITABLE',
    editableBy: 'HR',
    requiresApproval: false,
    uiLabel: 'Editable by HR only',
    lockedReason: 'Only HR and Super Admin can edit this field',
  },
  exitNotes: {
    permission: 'MANAGER_EDITABLE',
    editableBy: 'HR',
    requiresApproval: false,
    uiLabel: 'Editable by HR only',
    lockedReason: 'Only HR and Super Admin can edit this field',
  },
  reportsToId: {
    permission: 'MANAGER_EDITABLE',
    editableBy: 'HR',
    requiresApproval: false,
    uiLabel: 'Editable by HR only',
    lockedReason: 'Only HR and Super Admin can edit this field',
  },
  salary: {
    permission: 'MANAGER_EDITABLE',
    editableBy: 'HR',
    requiresApproval: false,
    uiLabel: 'Editable by HR only',
    lockedReason: 'Only HR and Super Admin can edit this field',
  },
  currency: {
    permission: 'MANAGER_EDITABLE',
    editableBy: 'HR',
    requiresApproval: false,
    uiLabel: 'Editable by HR only',
    lockedReason: 'Only HR and Super Admin can edit this field',
  },

  // Admin-only toggles
  permissionLevel: {
    permission: 'MANAGER_EDITABLE',
    editableBy: 'ADMIN',
    requiresApproval: false,
    uiLabel: 'Editable by Super Admin',
    lockedReason: 'Only HR and Super Admin can edit this field',
  },
  isSuperAdmin: {
    permission: 'MANAGER_EDITABLE',
    editableBy: 'ADMIN',
    requiresApproval: false,
    uiLabel: 'Editable by Super Admin',
    lockedReason: 'Only HR and Super Admin can edit this field',
  },
}

export const FIELD_PERMISSIONS: Record<string, AttributePermission> = Object.fromEntries(
  Object.entries(EMPLOYEE_FIELD_OWNERSHIP).map(([field, meta]) => [field, meta.permission])
)

export function getEmployeeFieldOwnership(fieldName: string): EmployeeFieldOwnership | null {
  return EMPLOYEE_FIELD_OWNERSHIP[fieldName] ?? null
}

