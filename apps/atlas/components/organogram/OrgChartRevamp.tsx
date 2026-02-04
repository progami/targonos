'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { useRouter } from 'next/navigation'
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Search,
  X,
  Users,
  FolderKanban,
  Mail,
  Phone,
  MapPin,
  Calendar,
  ChevronRight,
  Sparkles,
} from 'lucide-react'
import type { HierarchyEmployee, Project } from '@/lib/api-client'

type OrgEmployee = {
  id: string
  name: string
  role: string
  dept: string
  avatar: string
  isYou: boolean
  managerId: string | null
  projects: string[]
  email: string
  phone: string | null
  location: string
  joinDate: string
  type: string
}

type OrgProject = {
  id: string
  name: string
  code: string
  status: string
  leadId: string | null
}

type OrgNode = OrgEmployee & {
  x: number
  y: number
  depth?: number
  color: string
  originalColor?: string
  directReports: number
  totalReports: number
  isHeader?: boolean
  isProject?: boolean
  isLead?: boolean
  isHead?: boolean
}

type OrgEdge = {
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
}

type LevelScope = 'all' | number

type Props = {
  employees: HierarchyEmployee[]
  projects: Project[]
  currentEmployeeId: string | null
}

// ============================================
// STRICT 4-COLOR PALETTE
// ============================================
const COLORS = {
  teal: '#00C9B1',
  navy: '#0A2540',
  slate: '#64748B',
  white: '#FFFFFF',
  light: '#F1F5F9',
  amber: '#F59E0B',
}

const NODE_W = 156
const NODE_H = 68
const H_GAP = 36
const V_GAP = 52
const HEADER_H = 44
const COLUMN_GAP = 64

function getInitials(firstName: string, lastName: string) {
  let initials = ''
  if (firstName) {
    initials += firstName[0]
  }
  if (lastName) {
    initials += lastName[0]
  }
  return initials.toUpperCase()
}

function formatEmploymentType(value: string) {
  if (value === 'FULL_TIME') return 'Full-time'
  if (value === 'PART_TIME') return 'Part-time'
  if (value === 'CONTRACT') return 'Contract'
  if (value === 'INTERN') return 'Intern'
  return value
}

function formatJoinDate(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(date)
}

function buildLocation(city: string | null | undefined, country: string | null | undefined) {
  if (city && country) return `${city}, ${country}`
  if (city) return city
  if (country) return country
  return ''
}

function computeMaxDepth(employees: OrgEmployee[]) {
  const byId = new Map<string, OrgEmployee>()
  const children = new Map<string, OrgEmployee[]>()

  for (const emp of employees) {
    byId.set(emp.id, emp)
    children.set(emp.id, [])
  }

  for (const emp of employees) {
    if (emp.managerId && byId.has(emp.managerId)) {
      const list = children.get(emp.managerId)
      if (list) list.push(emp)
    }
  }

  const roots: OrgEmployee[] = []
  for (const emp of employees) {
    if (!emp.managerId) {
      roots.push(emp)
      continue
    }
    if (!byId.has(emp.managerId)) {
      roots.push(emp)
    }
  }

  let maxDepth = 0

  const visit = (empId: string, depth: number, path: Set<string>) => {
    if (depth > maxDepth) maxDepth = depth
    if (path.has(empId)) return
    path.add(empId)
    const kids = children.get(empId)
    if (kids) {
      for (const child of kids) {
        visit(child.id, depth + 1, new Set(path))
      }
    }
  }

  for (const root of roots) {
    visit(root.id, 1, new Set())
  }

  return maxDepth
}

const CurvedPath = ({ x1, y1, x2, y2, color, highlighted }: OrgEdge & { highlighted: boolean }) => {
  const midY = y1 + (y2 - y1) * 0.5
  const d = Math.abs(x1 - x2) < 1
    ? `M ${x1} ${y1} L ${x2} ${y2}`
    : `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`
  return (
    <path
      d={d}
      fill="none"
      stroke={highlighted ? color : COLORS.slate}
      strokeWidth={highlighted ? 2 : 1.5}
      strokeLinecap="round"
      strokeOpacity={highlighted ? 1 : 0.25}
      style={{ transition: 'all 0.3s ease' }}
    />
  )
}

const wrapText = (text: string, maxChars: number) => {
  const trimmed = text.trim()
  if (!trimmed) return ['']

  if (trimmed.length <= maxChars) return [trimmed]

  const words = trimmed.split(/\s+/)
  const lines: string[] = []
  let currentLine = ''

  const clamp = (value: string) => {
    if (value.length <= maxChars) return value
    const safeLength = Math.max(1, maxChars - 1)
    return `${value.slice(0, safeLength)}…`
  }

  const pushLine = (value: string) => {
    const normalized = value.trim()
    if (!normalized) return
    lines.push(clamp(normalized))
  }

  for (const word of words) {
    const safeWord = clamp(word)
    const next = currentLine ? `${currentLine} ${safeWord}` : safeWord
    if (next.length <= maxChars) {
      currentLine = next
      continue
    }

    if (currentLine) pushLine(currentLine)
    currentLine = safeWord
    if (lines.length >= 2) break
  }

  if (lines.length < 2 && currentLine) pushLine(currentLine)

  return lines.slice(0, 2)
}

const OrgNodeCard = ({
  node,
  highlighted,
  searchMatch,
  onHover,
  onClick,
  onOpenEmployee,
}: {
  node: OrgNode
  highlighted: boolean
  searchMatch: boolean
  onHover: (node: OrgNode | null) => void
  onClick: (node: OrgNode) => void
  onOpenEmployee: (employeeId: string) => void
}) => {
  const color = node.color ? node.color : COLORS.teal
  const x = node.x - NODE_W / 2
  const y = node.y

  if (node.isHeader) {
    return (
      <g style={{ cursor: 'default' }}>
        <rect x={x} y={y} width={NODE_W} height={HEADER_H} rx={10} fill={color} />
        <text x={node.x} y={y + 17} textAnchor="middle" fontSize={12} fontWeight="600" fill={COLORS.white} style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          {node.name.length > 16 ? `${node.name.slice(0, 15)}…` : node.name}
        </text>
        <text x={node.x} y={y + 32} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.85)" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          {node.role.length > 20 ? `${node.role.slice(0, 19)}…` : node.role}
        </text>
      </g>
    )
  }

  const barColor = node.originalColor ? node.originalColor : color
  const isActive = highlighted ? true : searchMatch
  const roleLines = wrapText(node.role, 16)
  const hasReports = node.directReports > 0

  return (
    <g
      style={{ cursor: 'pointer' }}
      onMouseEnter={() => onHover(node)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(node)}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onOpenEmployee(node.id)
      }}
    >
      <rect x={x + 2} y={y + 2} width={NODE_W} height={NODE_H} rx={10} fill="rgba(0,0,0,0.05)" />
      <rect x={x} y={y} width={NODE_W} height={NODE_H} rx={10} fill={COLORS.white} stroke={isActive ? color : '#E2E8F0'} strokeWidth={isActive ? 2 : 1} style={{ transition: 'all 0.2s ease' }} />
      <rect x={x} y={y} width={4} height={NODE_H} fill={barColor} style={{ clipPath: 'inset(0 0 0 0 round 10px 0 0 10px)' }} />
      <circle
        cx={x + 26}
        cy={y + 26}
        r={14}
        fill={`${barColor}18`}
        onClick={(e) => {
          e.stopPropagation()
          onOpenEmployee(node.id)
        }}
        style={{ cursor: 'pointer' }}
      />
      <text
        x={x + 26}
        y={y + 30}
        textAnchor="middle"
        fontSize={10}
        fontWeight="700"
        fill={barColor}
        style={{ fontFamily: 'system-ui, -apple-system, sans-serif', cursor: 'pointer' }}
        onClick={(e) => {
          e.stopPropagation()
          onOpenEmployee(node.id)
        }}
      >
        {node.avatar?.slice(0, 2)}
      </text>
      <text
        x={x + 48}
        y={y + 18}
        fontSize={11}
        fontWeight="600"
        fill={COLORS.navy}
        style={{ fontFamily: 'system-ui, -apple-system, sans-serif', cursor: 'pointer' }}
        onClick={(e) => {
          e.stopPropagation()
          onOpenEmployee(node.id)
        }}
      >
        {node.name?.length > 13 ? `${node.name.slice(0, 12)}…` : node.name}
      </text>
      {roleLines.map((line, i) => (
        <text key={i} x={x + 48} y={y + 32 + i * 11} fontSize={9} fill={COLORS.slate} style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          {line}
        </text>
      ))}
      {hasReports && (
        <text x={x + 48} y={y + NODE_H - 8} fontSize={9} fill={COLORS.slate} style={{ fontFamily: 'system-ui, -apple-system, sans-serif', opacity: 0.7 }}>
          {node.directReports} direct report{node.directReports > 1 ? 's' : ''}
        </text>
      )}
      <g
        style={{ cursor: 'pointer' }}
        onClick={(e) => {
          e.stopPropagation()
          onOpenEmployee(node.id)
        }}
      >
        <title>Open profile</title>
        <circle
          cx={x + NODE_W - 14}
          cy={y + NODE_H - 14}
          r={9}
          fill={isActive ? `${color}15` : COLORS.light}
        />
        <path
          d={`M ${x + NODE_W - 16} ${y + NODE_H - 18} L ${x + NODE_W - 12} ${y + NODE_H - 14} L ${x + NODE_W - 16} ${y + NODE_H - 10}`}
          fill="none"
          stroke={isActive ? color : COLORS.slate}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      {node.type === 'Contract' && (
        <g>
          <circle cx={x + NODE_W - 12} cy={y + 12} r={8} fill={`${COLORS.amber}20`} />
          <text x={x + NODE_W - 12} y={y + 16} textAnchor="middle" fontSize={9} fontWeight="600" fill={COLORS.amber} style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            C
          </text>
        </g>
      )}
      {node.isYou && (
        <g>
          <rect x={x + NODE_W - 30} y={y - 6} width={28} height={16} rx={6} fill={COLORS.teal} />
          <text x={x + NODE_W - 16} y={y + 6} textAnchor="middle" fontSize={9} fontWeight="700" fill={COLORS.white} style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            YOU
          </text>
        </g>
      )}
      {(() => {
        const isLeader = node.isHead ? true : node.isLead
        if (!isLeader) return null
        if (node.isYou) return null
        return (
          <g>
            <rect x={x + NODE_W - 34} y={y - 6} width={32} height={16} rx={6} fill={color} />
            <text x={x + NODE_W - 18} y={y + 6} textAnchor="middle" fontSize={8} fontWeight="700" fill={COLORS.white} style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
              {node.isHead ? 'HEAD' : 'LEAD'}
            </text>
          </g>
        )
      })()}
    </g>
  )
}

const DetailPanel = ({
  employee,
  onClose,
  getManager,
  getDirectReports,
  projects,
  deptColors,
  onOpenEmployee,
}: {
  employee: OrgEmployee | null
  onClose: () => void
  getManager: (employee: OrgEmployee) => OrgEmployee | null
  getDirectReports: (employee: OrgEmployee) => OrgEmployee[]
  projects: OrgProject[]
  deptColors: Record<string, string>
  onOpenEmployee: (employeeId: string) => void
}) => {
  if (!employee) return null
  const manager = getManager(employee)
  const directReports = getDirectReports(employee)
  const color = deptColors[employee.dept] ? deptColors[employee.dept] : COLORS.teal

  const contactItems: Array<{ icon: ComponentType<{ size?: number; color?: string }>; value: string }> = []
  if (employee.email) contactItems.push({ icon: Mail, value: employee.email })
  if (employee.phone) contactItems.push({ icon: Phone, value: employee.phone })
  if (employee.location) contactItems.push({ icon: MapPin, value: employee.location })
  if (employee.joinDate) contactItems.push({ icon: Calendar, value: `Joined ${employee.joinDate}` })

  return (
    <div style={{ position: 'fixed', bottom: 20, left: 20, right: 20, background: COLORS.white, borderRadius: 16, boxShadow: '0 20px 50px rgba(0,0,0,0.15)', border: '1px solid #E2E8F0', display: 'flex', zIndex: 100, maxWidth: 920, margin: '0 auto', overflow: 'hidden', fontFamily: 'system-ui, -apple-system, sans-serif', animation: 'slideUp 0.3s ease' }}>
      <style>{`@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>

      <div style={{ padding: 22, borderRight: '1px solid #E2E8F0', flex: '1 1 280px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, background: `${color}15`, color, flexShrink: 0 }}>
            {employee.avatar?.slice(0, 2)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => onOpenEmployee(employee.id)}
                style={{ fontSize: 17, fontWeight: 700, color: COLORS.navy, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                {employee.name}
              </button>
              {employee.isYou && <span style={{ fontSize: 10, padding: '3px 7px', background: COLORS.teal, color: COLORS.white, borderRadius: 5, fontWeight: 700 }}>YOU</span>}
            </div>
            <div style={{ fontSize: 13, color: COLORS.slate, marginBottom: 8 }}>{employee.role}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, padding: '4px 8px', background: `${color}12`, color, borderRadius: 6, fontWeight: 600 }}>{employee.dept}</span>
              <span style={{ fontSize: 10, padding: '4px 8px', background: employee.type === 'Contract' ? `${COLORS.amber}15` : COLORS.light, color: employee.type === 'Contract' ? COLORS.amber : COLORS.slate, borderRadius: 6, fontWeight: 500 }}>{employee.type}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ padding: 8, background: COLORS.light, border: 'none', borderRadius: 8, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color={COLORS.slate} />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {contactItems.map(({ icon: Icon, value }, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <Icon size={14} color={COLORS.slate} />
              </span>
              <span style={{ fontSize: 12, color: COLORS.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: 22, borderRight: '1px solid #E2E8F0', flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.slate, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>Reporting</div>
        {manager ? (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: COLORS.slate, marginBottom: 6 }}>Reports to</div>
            <button
              type="button"
              onClick={() => onOpenEmployee(manager.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: COLORS.light, borderRadius: 8, border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}
            >
              <div style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, background: `${COLORS.teal}15`, color: COLORS.teal, flexShrink: 0 }}>
                {manager.avatar?.slice(0, 2)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.navy }}>{manager.name}</div>
                <div style={{ fontSize: 10, color: COLORS.slate }}>{manager.role}</div>
              </div>
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: COLORS.slate, marginBottom: 14, padding: '10px', background: COLORS.light, borderRadius: 8, textAlign: 'center' }}>
            <Sparkles size={14} style={{ marginBottom: 4, opacity: 0.5 }} />
            <div>Top of hierarchy</div>
          </div>
        )}
        <div>
          <div style={{ fontSize: 10, color: COLORS.slate, marginBottom: 6 }}>Direct reports · {directReports.length}</div>
          {directReports.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {directReports.slice(0, 4).map(report => (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => onOpenEmployee(report.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, background: `${COLORS.teal}15`, color: COLORS.teal, flexShrink: 0 }}>
                    {report.avatar?.slice(0, 2)}
                  </div>
                  <span style={{ fontSize: 11, color: COLORS.navy }}>{report.name}</span>
                </button>
              ))}
              {directReports.length > 4 && <div style={{ fontSize: 11, color: COLORS.teal, fontWeight: 600, paddingLeft: 32 }}>+{directReports.length - 4} more</div>}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: COLORS.slate }}>No direct reports</div>
          )}
        </div>
      </div>

      <div style={{ padding: 22, flex: '1 1 180px', minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.slate, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>Projects</div>
        {employee.projects.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {employee.projects.map(projId => {
              const proj = projects.find(p => p.id === projId)
              if (!proj) return null
              return (
                <div key={projId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 12px', background: `${COLORS.teal}08`, borderRadius: 8, border: `1px solid ${COLORS.teal}18` }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.navy }}>{proj.name}</div>
                    <div style={{ fontSize: 10, color: COLORS.slate }}>{proj.code}</div>
                  </div>
                  {proj.leadId === employee.id && <span style={{ fontSize: 9, padding: '2px 6px', background: COLORS.teal, color: COLORS.white, borderRadius: 4, fontWeight: 700, flexShrink: 0 }}>LEAD</span>}
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: COLORS.slate, padding: '12px', background: COLORS.light, borderRadius: 8, textAlign: 'center' }}>No projects assigned</div>
        )}
      </div>
    </div>
  )
}

export function OrgChartRevamp({ employees, projects, currentEmployeeId }: Props) {
  const router = useRouter()
  const [viewMode, setViewMode] = useState<'organization' | 'project'>('organization')
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [hovered, setHovered] = useState<OrgNode | null>(null)
  const [selected, setSelected] = useState<OrgEmployee | null>(null)
  const [search, setSearch] = useState('')
  const [mounted, setMounted] = useState(false)
  const [levelScope, setLevelScope] = useState<LevelScope>('all')
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 })
  const initialViewAppliedRef = useRef(false)
  const pendingFitToViewRef = useRef(false)

  useEffect(() => { setMounted(true) }, [])

  const openEmployee = useCallback(
    (employeeId: string) => {
      router.push(`/employees/${employeeId}`)
    },
    [router]
  )

  useEffect(() => {
    const node = canvasRef.current
    if (!node) return

    let rafId = 0
    const update = () => {
      const rect = node.getBoundingClientRect()
      setCanvasSize({ w: rect.width, h: rect.height })
    }

    const scheduleUpdate = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(update)
    }

    scheduleUpdate()
    const observer = new ResizeObserver(() => scheduleUpdate())
    observer.observe(node)
    return () => {
      cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [])

  const normalizedEmployees = useMemo<OrgEmployee[]>(() => {
    return employees.map((emp) => {
      const projectsList: string[] = []
      if (emp.projects) {
        for (const projectId of emp.projects) {
          projectsList.push(projectId)
        }
      }
      const isYou = currentEmployeeId ? emp.id === currentEmployeeId : false
      const phone = emp.phone !== undefined && emp.phone !== null ? emp.phone : null
      return {
        id: emp.id,
        name: `${emp.firstName} ${emp.lastName}`.trim(),
        role: emp.position,
        dept: emp.department,
        avatar: getInitials(emp.firstName, emp.lastName),
        isYou,
        managerId: emp.reportsToId,
        projects: projectsList,
        email: emp.email,
        phone,
        location: buildLocation(emp.city, emp.country),
        joinDate: formatJoinDate(emp.joinDate),
        type: formatEmploymentType(emp.employmentType),
      }
    })
  }, [employees, currentEmployeeId])

  const normalizedProjects = useMemo<OrgProject[]>(() => {
    return projects.map((proj) => {
      const code = proj.code ? proj.code : ''
      const status = proj.status
      const leadId = proj.leadId ? proj.leadId : null
      return {
        id: proj.id,
        name: proj.name,
        code,
        status,
        leadId,
      }
    })
  }, [projects])

  const deptCount = useMemo(() => {
    const set = new Set<string>()
    for (const emp of normalizedEmployees) {
      if (emp.dept) set.add(emp.dept)
    }
    return set.size
  }, [normalizedEmployees])

  const maxDepth = useMemo(() => {
    const depth = computeMaxDepth(normalizedEmployees)
    if (depth < 1) return 1
    return depth
  }, [normalizedEmployees])

  const levelOptions = useMemo(() => {
    const options: Array<{ label: string; value: LevelScope }> = [{ label: 'All', value: 'all' }]
    let i = 1
    while (i <= maxDepth) {
      options.push({ label: `L${i}`, value: i })
      i += 1
    }
    return options
  }, [maxDepth])

  const reportsMap = useMemo(() => {
    const map = new Map<string, OrgEmployee[]>()
    for (const emp of normalizedEmployees) {
      map.set(emp.id, [])
    }
    for (const emp of normalizedEmployees) {
      const managerId = emp.managerId
      if (managerId && map.has(managerId)) {
        const list = map.get(managerId)
        if (list) list.push(emp)
      }
    }
    return map
  }, [normalizedEmployees])

  const totalReportsMap = useMemo(() => {
    const memo = new Map<string, number>()
    const countReports = (empId: string, path: Set<string>): number => {
      if (memo.has(empId)) return memo.get(empId) as number
      if (path.has(empId)) return 0
      path.add(empId)
      const direct = reportsMap.get(empId)
      const directList = direct ? direct : []
      let total = directList.length
      for (const child of directList) {
        total += countReports(child.id, new Set(path))
      }
      memo.set(empId, total)
      return total
    }
    for (const emp of normalizedEmployees) {
      countReports(emp.id, new Set())
    }
    return memo
  }, [normalizedEmployees, reportsMap])

  const deptColors = useMemo(() => {
    const colors: Record<string, string> = { UNASSIGNED: COLORS.amber, Unassigned: COLORS.amber }
    for (const emp of normalizedEmployees) {
      if (!colors[emp.dept]) {
        colors[emp.dept] = COLORS.teal
      }
    }
    return colors
  }, [normalizedEmployees])

  const projectColors = useMemo(() => {
    const colors: Record<string, string> = { UNASSIGNED: COLORS.amber }
    for (const proj of normalizedProjects) {
      if (!colors[proj.id]) {
        colors[proj.id] = COLORS.teal
      }
    }
    return colors
  }, [normalizedProjects])

  const getDirectCount = (id: string) => {
    const direct = reportsMap.get(id)
    if (direct) return direct.length
    return 0
  }

  const getTotalCount = (id: string) => {
    const total = totalReportsMap.get(id)
    if (total !== undefined) return total
    return 0
  }

  const { nodes, edges } = useMemo(() => {
    if (viewMode === 'project') {
      const nodes: OrgNode[] = []
      const edges: OrgEdge[] = []
      const unassignedEmployees = normalizedEmployees.filter(e => e.projects.length === 0)
      const allProjects: OrgProject[] = []

      for (const proj of normalizedProjects) {
        allProjects.push(proj)
      }
      if (unassignedEmployees.length > 0) {
        allProjects.push({
          id: 'UNASSIGNED',
          name: 'Unassigned',
          code: '—',
          status: 'N/A',
          leadId: null,
        })
      }

      let xOffset = 0

      for (const proj of allProjects) {
        const projEmployees = proj.id === 'UNASSIGNED'
          ? unassignedEmployees
          : normalizedEmployees.filter(e => e.projects.includes(proj.id))
        if (projEmployees.length === 0) continue

        const lead = proj.leadId ? projEmployees.find(e => e.id === proj.leadId) : undefined
        const color = projectColors[proj.id] ? projectColors[proj.id] : COLORS.amber

        const projEmpIds = new Set(projEmployees.map(e => e.id))
        const orphanIds = new Set(
          projEmployees
            .filter(e => {
              if (!lead) return false
              if (e.id === lead.id) return false
              if (!e.managerId) return true
              if (!projEmpIds.has(e.managerId)) return true
              return false
            })
            .map(e => e.id)
        )

        const getChildren = (empId: string, visited = new Set<string>()): OrgEmployee[] => {
          if (visited.has(empId)) return []
          visited.add(empId)
          const direct = projEmployees.filter(e => e.managerId === empId && !orphanIds.has(e.id))
          if (lead && empId === lead.id) {
            return [...direct, ...projEmployees.filter(e => orphanIds.has(e.id))]
          }
          return direct
        }

        const widthCache = new Map<string, number>()
        const getSubtreeWidth = (empId: string, visited = new Set<string>()): number => {
          if (visited.has(empId)) return NODE_W
          if (widthCache.has(empId)) return widthCache.get(empId) as number
          visited.add(empId)
          const children = getChildren(empId, new Set(visited))
          const width: number = children.length === 0
            ? NODE_W
            : Math.max(NODE_W, children.reduce((sum, c, i) => sum + getSubtreeWidth(c.id, new Set(visited)) + (i > 0 ? H_GAP : 0), 0))
          widthCache.set(empId, width)
          return width
        }

        const projWidth = lead
          ? Math.max(NODE_W + 60, getSubtreeWidth(lead.id))
          : Math.max(NODE_W + 60, projEmployees.length * (NODE_W + H_GAP))
        const projCenterX = xOffset + projWidth / 2

        nodes.push({
          id: `proj-${proj.id}`,
          name: proj.name,
          role: proj.status !== 'N/A' ? `${proj.status} · ${projEmployees.length}` : `${projEmployees.length} members`,
          avatar: proj.code.slice(0, 2),
          x: projCenterX,
          y: 40,
          isHeader: true,
          isProject: true,
          color,
          directReports: 0,
          totalReports: 0,
          dept: '',
          isYou: false,
          managerId: null,
          projects: [],
          email: '',
          phone: null,
          location: '',
          joinDate: '',
          type: '',
        })

        const positionedIds = new Set<string>()
        const positionEmployee = (emp: OrgEmployee, depth: number, leftX: number, parentX: number | null, parentY: number | null) => {
          if (positionedIds.has(emp.id)) return
          positionedIds.add(emp.id)
          const subtreeW = getSubtreeWidth(emp.id)
          const x = leftX + subtreeW / 2
          const y = 40 + HEADER_H + depth * (NODE_H + V_GAP)

          nodes.push({
            ...emp,
            x,
            y,
            color,
            isLead: emp.id === proj.leadId,
            originalColor: deptColors[emp.dept],
            directReports: getDirectCount(emp.id),
            totalReports: getTotalCount(emp.id),
          })
          const sourceX = parentX !== null ? parentX : projCenterX
          const sourceY = parentY ? parentY + NODE_H : 40 + HEADER_H
          edges.push({
            x1: sourceX,
            y1: sourceY,
            x2: x,
            y2: y,
            color,
          })

          let childLeft = leftX
          for (const child of getChildren(emp.id, new Set())) {
            if (!positionedIds.has(child.id)) {
              positionEmployee(child, depth + 1, childLeft, x, y)
              childLeft += getSubtreeWidth(child.id) + H_GAP
            }
          }
        }

        if (lead) {
          positionEmployee(lead, 1, xOffset + (projWidth - getSubtreeWidth(lead.id)) / 2, null, null)
        } else {
          let i = 0
          for (const emp of projEmployees) {
            if (!positionedIds.has(emp.id)) {
              positionedIds.add(emp.id)
              const empX = xOffset + (projWidth / projEmployees.length) * i + (projWidth / projEmployees.length) / 2
              nodes.push({
                ...emp,
                x: empX,
                y: 40 + HEADER_H + V_GAP,
                color,
                originalColor: deptColors[emp.dept],
                directReports: getDirectCount(emp.id),
                totalReports: getTotalCount(emp.id),
              })
              edges.push({
                x1: projCenterX,
                y1: 40 + HEADER_H,
                x2: empX,
                y2: 40 + HEADER_H + V_GAP,
                color,
              })
              i += 1
            }
          }
        }

        xOffset += projWidth + COLUMN_GAP
      }

      return { nodes, edges }
    }

    const nodes: OrgNode[] = []
    const edges: OrgEdge[] = []

    const empIds = new Set(normalizedEmployees.map(e => e.id))
    const orphans = normalizedEmployees.filter(e => e.managerId && !empIds.has(e.managerId))
    const treeEmployees = normalizedEmployees.filter(e => !(e.managerId && !empIds.has(e.managerId)))

    const employeeMap = new Map<string, OrgEmployee>()
    for (const emp of treeEmployees) {
      employeeMap.set(emp.id, emp)
    }

    type TreeNode = OrgEmployee & { children: TreeNode[] }
    const treeNodes = new Map<string, TreeNode>()
    for (const emp of treeEmployees) {
      treeNodes.set(emp.id, { ...emp, children: [] })
    }

    const roots: TreeNode[] = []
    for (const emp of treeEmployees) {
      const node = treeNodes.get(emp.id) as TreeNode
      if (emp.managerId && treeNodes.has(emp.managerId)) {
        const parent = treeNodes.get(emp.managerId)
        if (parent) parent.children.push(node)
      } else {
        roots.push(node)
      }
    }

    const maxLevel = levelScope === 'all' ? null : levelScope
    const pruneDepth = (node: TreeNode, depth: number) => {
      if (maxLevel && depth >= maxLevel) {
        node.children = []
        return
      }
      for (const child of node.children) {
        pruneDepth(child, depth + 1)
      }
    }
    for (const root of roots) {
      pruneDepth(root, 1)
    }

    const getSubtreeWidth = (node: TreeNode): number => {
      if (!node.children) return NODE_W
      if (node.children.length === 0) return NODE_W
      return Math.max(
        NODE_W,
        node.children.reduce((sum, c, i) => sum + getSubtreeWidth(c) + (i > 0 ? H_GAP : 0), 0),
      )
    }

    const position = (node: TreeNode, depth: number, leftX: number) => {
      const subtreeW = getSubtreeWidth(node)
      const x = leftX + subtreeW / 2
      const y = depth * (NODE_H + V_GAP) + 50

      const deptColor = deptColors[node.dept] ? deptColors[node.dept] : COLORS.teal
      nodes.push({
        ...node,
        x,
        y,
        depth,
        color: deptColor,
        directReports: getDirectCount(node.id),
        totalReports: getTotalCount(node.id),
      })

      if (node.children && node.children.length > 0) {
        let childLeft = leftX
        for (const child of node.children) {
          const childW = getSubtreeWidth(child)
          edges.push({
            x1: x,
            y1: y + NODE_H,
            x2: childLeft + childW / 2,
            y2: (depth + 1) * (NODE_H + V_GAP) + 50,
            color: deptColor,
          })
          position(child, depth + 1, childLeft)
          childLeft += childW + H_GAP
        }
      }
    }

    let totalWidth = 0
    let startX = 0
    for (const root of roots) {
      const rootWidth = getSubtreeWidth(root)
      position(root, 0, startX)
      startX += rootWidth + H_GAP
      totalWidth = startX - H_GAP
    }

    if (orphans.length > 0) {
      const orphanStartX = totalWidth + COLUMN_GAP * 2
      const orphanWidth = Math.max(NODE_W + 40, orphans.length * (NODE_W + H_GAP))
      const orphanCenterX = orphanStartX + orphanWidth / 2
      nodes.push({
        id: 'orphan-header',
        name: 'Unassigned',
        role: `${orphans.length} members`,
        avatar: '?',
        x: orphanCenterX,
        y: 50,
        isHeader: true,
        color: COLORS.amber,
        directReports: 0,
        totalReports: 0,
        dept: '',
        isYou: false,
        managerId: null,
        projects: [],
        email: '',
        phone: null,
        location: '',
        joinDate: '',
        type: '',
      })
      let index = 0
      for (const orphan of orphans) {
        const orphanX = orphanStartX + (orphanWidth / orphans.length) * index + (orphanWidth / orphans.length) / 2
        nodes.push({
          ...orphan,
          x: orphanX,
          y: 50 + HEADER_H + V_GAP,
          color: COLORS.amber,
          directReports: getDirectCount(orphan.id),
          totalReports: getTotalCount(orphan.id),
        })
        edges.push({
          x1: orphanCenterX,
          y1: 50 + HEADER_H,
          x2: orphanX,
          y2: 50 + HEADER_H + V_GAP,
          color: COLORS.amber,
        })
        index += 1
      }
    }

    return { nodes, edges }
  }, [viewMode, normalizedEmployees, normalizedProjects, levelScope, deptColors, projectColors, reportsMap, totalReportsMap])

  const isGraphView = viewMode === 'organization'

  const highlightedIds = useMemo(() => {
    if (!hovered) return new Set<string>()
    if (hovered.isHeader) return new Set<string>()
    const ids = new Set<string>([hovered.id])
    if (isGraphView) {
      const findChain = (targetId: string, direction: 'up' | 'down') => {
        for (const edge of edges) {
          const parent = nodes.find(n => Math.abs(n.x - edge.x1) < 1 && Math.abs(n.y + NODE_H - edge.y1) < 1)
          const child = nodes.find(n => Math.abs(n.x - edge.x2) < 1 && Math.abs(n.y - edge.y2) < 1)
          if (direction === 'up' && child?.id === targetId && parent && !parent.isHeader) {
            ids.add(parent.id)
            findChain(parent.id, 'up')
          }
          if (direction === 'down' && parent?.id === targetId && child && !child.isHeader) {
            ids.add(child.id)
            findChain(child.id, 'down')
          }
        }
      }
      findChain(hovered.id, 'up')
      findChain(hovered.id, 'down')
    }
    return ids
  }, [hovered, nodes, edges, isGraphView])

  const searchMatches = useMemo(() => {
    if (!search) return new Set<string>()
    const q = search.toLowerCase()
    const matched: string[] = []
    for (const node of nodes) {
      if (node.isHeader) continue
      const nameMatch = node.name.toLowerCase().includes(q)
      const roleMatch = node.role.toLowerCase().includes(q)
      const deptMatch = node.dept.toLowerCase().includes(q)
      let match = false
      if (nameMatch) match = true
      if (roleMatch) match = true
      if (deptMatch) match = true
      if (match) matched.push(node.id)
    }
    return new Set(matched)
  }, [search, nodes])

  const isEdgeHighlighted = (edge: OrgEdge) => {
    if (!isGraphView) return false
    if (!hovered) return false
    if (hovered.isHeader) return false
    const parent = nodes.find(n => Math.abs(n.x - edge.x1) < 1)
    const child = nodes.find(n => Math.abs(n.x - edge.x2) < 1)
    return !!(parent && child && !parent.isHeader && highlightedIds.has(parent.id) && highlightedIds.has(child.id))
  }

  const getManager = (employee: OrgEmployee) => {
    if (!employee.managerId) return null
    const manager = normalizedEmployees.find(e => e.id === employee.managerId)
    if (!manager) return null
    return manager
  }

  const getDirectReports = (employee: OrgEmployee) => {
    const reports = reportsMap.get(employee.id)
    if (reports) return reports
    return []
  }

  const fitToView = useCallback(() => {
    const w = canvasSize.w
    const h = canvasSize.h
    if (!w || !h) return
    if (nodes.length === 0) return

    const padding = 48
    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    for (const node of nodes) {
      const nodeW = NODE_W
      const nodeH = node.isHeader ? HEADER_H : NODE_H
      const left = node.x - nodeW / 2
      const right = node.x + nodeW / 2
      const top = node.y
      const bottom = node.y + nodeH
      if (left < minX) minX = left
      if (right > maxX) maxX = right
      if (top < minY) minY = top
      if (bottom > maxY) maxY = bottom
    }

    const contentW = maxX - minX
    const contentH = maxY - minY
    if (contentW <= 0 || contentH <= 0) return

    const scaleX = (w - padding * 2) / contentW
    const scaleY = (h - padding * 2) / contentH
    const nextScale = Math.max(0.3, Math.min(1.0, Math.min(scaleX, scaleY)))

    const scaledW = contentW * nextScale
    const scaledH = contentH * nextScale
    const extraX = (w - scaledW) / 2
    const extraY = (h - scaledH) / 2

    setScale(nextScale)
    setPan({
      x: extraX - minX * nextScale,
      y: extraY - minY * nextScale,
    })
  }, [canvasSize.h, canvasSize.w, nodes])

  const resetView = () => {
    fitToView()
  }

  useEffect(() => {
    if (!pendingFitToViewRef.current) return
    fitToView()
    pendingFitToViewRef.current = false
  }, [fitToView])

  useEffect(() => {
    if (initialViewAppliedRef.current) return
    if (viewMode !== 'organization') return
    if (!canvasSize.w || !canvasSize.h) return
    if (nodes.length === 0) return

    const target = (() => {
      const byId = currentEmployeeId
        ? nodes.find((n) => !n.isHeader && n.id === currentEmployeeId)
        : undefined
      if (byId) return byId

      let best: OrgNode | null = null
      for (const n of nodes) {
        if (n.isHeader) continue
        if (!best) {
          best = n
          continue
        }
        if (n.y < best.y) {
          best = n
          continue
        }
        if (n.y === best.y && n.x < best.x) {
          best = n
        }
      }
      return best
    })()

    if (!target) return

    const nextScale = 0.95
    setScale(nextScale)
    setPan({
      x: canvasSize.w / 2 - target.x * nextScale,
      y: canvasSize.h / 2 - target.y * nextScale,
    })
    initialViewAppliedRef.current = true
  }, [canvasSize.h, canvasSize.w, currentEmployeeId, nodes, viewMode])

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, -apple-system, sans-serif', opacity: mounted ? 1 : 0, transition: 'opacity 0.4s ease', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #E2E8F0', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: COLORS.navy, margin: 0, lineHeight: 1.2 }}>Org chart</h1>
              <p style={{ fontSize: 12, color: COLORS.slate, margin: 0 }}>{normalizedEmployees.length} people · {deptCount} teams</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, padding: 4, background: COLORS.light, borderRadius: 10 }}>
            {[{ id: 'organization', label: 'Organization', icon: Users }, { id: 'project', label: 'Projects', icon: FolderKanban }].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  const nextMode = tab.id as 'organization' | 'project'
                  if (viewMode === nextMode) {
                    resetView()
                    setSelected(null)
                    return
                  }
                  pendingFitToViewRef.current = true
                  setViewMode(nextMode)
                  setSelected(null)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: viewMode === tab.id ? COLORS.white : 'transparent',
                  color: viewMode === tab.id ? COLORS.navy : COLORS.slate,
                  boxShadow: viewMode === tab.id ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                <tab.icon size={15} />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
          {viewMode === 'organization' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.slate, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Levels</span>
              <div style={{ display: 'flex', gap: 4, padding: 4, background: COLORS.light, borderRadius: 10, flexWrap: 'wrap' }}>
                {levelOptions.map(option => (
                  <button
                    key={String(option.value)}
                    onClick={() => {
                      if (levelScope === option.value) {
                        resetView()
                        return
                      }
                      pendingFitToViewRef.current = true
                      setLevelScope(option.value)
                    }}
                    style={{
                      padding: '6px 10px',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: levelScope === option.value ? COLORS.white : 'transparent',
                      color: levelScope === option.value ? COLORS.navy : COLORS.slate,
                      boxShadow: levelScope === option.value ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div style={{ position: 'relative', width: 'min(320px, 100%)' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: COLORS.slate, pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search people..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '9px 12px 9px 38px', fontSize: 13, background: COLORS.light, border: '1px solid #E2E8F0', borderRadius: 10, outline: 'none', boxSizing: 'border-box', color: COLORS.navy }}
            onFocus={(e) => { e.target.style.borderColor = COLORS.teal }}
            onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}>
              <X size={14} color={COLORS.slate} />
            </button>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', cursor: dragging ? 'grabbing' : 'grab' }}
        onMouseDown={(e) => { setDragging(true); setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y }) }}
        onMouseMove={(e) => { if (dragging) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }) }}
        onMouseUp={() => setDragging(false)}
        onMouseLeave={() => setDragging(false)}
      >
        <div style={{ position: 'absolute', inset: 0, opacity: 0.3, backgroundImage: `radial-gradient(${COLORS.slate}20 1px, transparent 1px)`, backgroundSize: '28px 28px', pointerEvents: 'none' }} />

        <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
            {edges.map((edge, i) => (
              <CurvedPath key={i} x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} color={edge.color} highlighted={isEdgeHighlighted(edge)} />
            ))}
            {nodes.map((node) => (
              <OrgNodeCard
                key={node.id}
                node={node}
                highlighted={highlightedIds.has(node.id)}
                searchMatch={searchMatches.has(node.id)}
                onHover={setHovered}
                onClick={(n) => setSelected(n)}
                onOpenEmployee={openEmployee}
              />
            ))}
          </g>
        </svg>

        {/* Controls */}
        <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', flexDirection: 'column', background: COLORS.white, borderRadius: 10, border: '1px solid #E2E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          {[{ icon: ZoomIn, action: () => setScale(s => Math.min(2, s + 0.15)) }, { icon: ZoomOut, action: () => setScale(s => Math.max(0.3, s - 0.15)) }, { icon: Maximize2, action: resetView }].map(({ icon: Icon, action }, i) => (
            <button
              key={i}
              onClick={action}
              style={{ padding: 10, border: 'none', background: 'none', cursor: 'pointer', borderBottom: i < 2 ? '1px solid #E2E8F0' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.light }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
            >
              <Icon size={16} color={COLORS.slate} />
            </button>
          ))}
        </div>

        <div style={{ position: 'absolute', bottom: 16, left: 16, padding: '6px 12px', background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 11, color: COLORS.slate, display: 'flex', alignItems: 'center', gap: 6 }}>
          {viewMode === 'organization' ? 'Hover to trace reporting chain' : 'Grouped by project'}
        </div>

        <div style={{ position: 'absolute', bottom: 16, right: 16, padding: '6px 12px', background: COLORS.white, borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 11, fontWeight: 600, color: COLORS.slate, fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(scale * 100)}%
        </div>
      </div>

      {selected && (
        <DetailPanel
          employee={selected}
          onClose={() => setSelected(null)}
          getManager={getManager}
          getDirectReports={getDirectReports}
          projects={normalizedProjects}
          deptColors={deptColors}
          onOpenEmployee={openEmployee}
        />
      )}

      {search && searchMatches.size > 0 && (
        <div style={{ position: 'absolute', top: 68, right: 24, width: 280, background: COLORS.white, borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.1)', border: '1px solid #E2E8F0', overflow: 'hidden', zIndex: 50, animation: 'fadeIn 0.2s ease' }}>
          <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #E2E8F0', fontSize: 11, color: COLORS.slate, fontWeight: 600 }}>
            {searchMatches.size} result{searchMatches.size > 1 ? 's' : ''}
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {nodes.filter(n => searchMatches.has(n.id)).map(node => (
              <button
                key={node.id}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #F1F5F9', boxSizing: 'border-box' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.light }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                onClick={() => {
                  setSelected(node)
                  const centerX = canvasSize.w ? canvasSize.w / 2 : 400
                  const centerY = canvasSize.h ? canvasSize.h / 2 : 200
                  setPan({ x: centerX - node.x * scale, y: centerY - node.y * scale })
                  setSearch('')
                }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: `${COLORS.teal}15`, color: COLORS.teal, flexShrink: 0 }}>
                  {node.avatar?.slice(0, 2)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.navy, marginBottom: 2 }}>{node.name}</div>
                  <div style={{ fontSize: 11, color: COLORS.slate }}>{node.role}</div>
                </div>
                <ChevronRight
                  size={14}
                  color={COLORS.slate}
                  style={{ flexShrink: 0 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    openEmployee(node.id)
                  }}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
