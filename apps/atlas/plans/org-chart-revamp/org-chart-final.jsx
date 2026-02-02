import React, { useState, useMemo, useEffect } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Search, X, Users, FolderKanban, Mail, Phone, MapPin, Calendar, ChevronRight, Sparkles } from 'lucide-react';

// ============================================
// DATA
// ============================================

const employees = [
  { id: 1, name: 'Jarrar Amjad', role: 'Founder', dept: 'Executive', avatar: 'JA', isYou: true, managerId: null, projects: ['PROJ-X'], email: 'jarrar@targonglobal.com', phone: '+92 300 111 0001', location: 'Lahore, PK', joinDate: '2020-01-15', type: 'Full-time' },
  { id: 2, name: 'Hamad Khan', role: 'Operations Head', dept: 'Operations', avatar: 'HK', managerId: 1, projects: ['DS-UK'], email: 'hamad@targonglobal.com', phone: '+92 300 111 0002', location: 'Lahore, PK', joinDate: '2020-03-01', type: 'Full-time' },
  { id: 3, name: 'Imran Sharif', role: 'Project Manager', dept: 'Executive', avatar: 'IS', managerId: 1, projects: ['PROJ-X'], email: 'imran@targonglobal.com', phone: '+92 300 111 0003', location: 'Karachi, PK', joinDate: '2021-02-10', type: 'Full-time' },
  { id: 4, name: 'Muhammad Mehdi', role: 'Project Manager', dept: 'Executive', avatar: 'MM', managerId: 1, projects: ['DS-US'], email: 'mehdi@targonglobal.com', phone: '+92 300 111 0004', location: 'Lahore, PK', joinDate: '2021-06-15', type: 'Contract' },
  { id: 5, name: 'Shoaib Gondal', role: 'Executive Assistant', dept: 'Executive', avatar: 'SG', managerId: 1, projects: [], email: 'shoaib@targonglobal.com', phone: '+92 300 111 0005', location: 'Lahore, PK', joinDate: '2022-01-10', type: 'Full-time' },
  { id: 6, name: 'Zeeshan Azam', role: 'Finance Head', dept: 'Finance', avatar: 'ZA', managerId: 1, projects: [], email: 'zeeshan@targonglobal.com', phone: '+92 300 111 0006', location: 'Lahore, PK', joinDate: '2020-04-01', type: 'Full-time' },
  { id: 7, name: 'Asad Umar', role: 'Operations Manager', dept: 'Operations', avatar: 'AU', managerId: 1, projects: ['DS-UK', 'DS-US'], email: 'asad@targonglobal.com', phone: '+92 300 111 0007', location: 'Islamabad, PK', joinDate: '2021-01-05', type: 'Full-time' },
  { id: 8, name: 'Farah Deeba', role: 'HR Head', dept: 'HR', avatar: 'FD', managerId: 1, projects: [], email: 'farah@targonglobal.com', phone: '+92 300 111 0008', location: 'Lahore, PK', joinDate: '2021-03-20', type: 'Full-time' },
  
  { id: 20, name: 'Sara Ahmed', role: 'Ops Coordinator', dept: 'Operations', avatar: 'SA', managerId: 2, projects: ['DS-UK'], email: 'sara@targonglobal.com', phone: '+92 300 111 0020', location: 'Lahore, PK', joinDate: '2021-08-01', type: 'Full-time' },
  { id: 21, name: 'Ali Hassan', role: 'Logistics Lead', dept: 'Operations', avatar: 'AH', managerId: 2, projects: ['DS-UK'], email: 'ali@targonglobal.com', phone: '+92 300 111 0021', location: 'Lahore, PK', joinDate: '2021-09-15', type: 'Full-time' },
  { id: 22, name: 'Umair Afzal', role: 'Ops Assistant', dept: 'Operations', avatar: 'UA', managerId: 2, projects: ['PROJ-X'], email: 'umair@targonglobal.com', phone: '+92 300 111 0022', location: 'Lahore, PK', joinDate: '2022-02-01', type: 'Full-time' },
  { id: 23, name: 'Hina Tariq', role: 'Admin Coordinator', dept: 'Operations', avatar: 'HT', managerId: 2, projects: [], email: 'hina@targonglobal.com', phone: '+92 300 111 0023', location: 'Lahore, PK', joinDate: '2022-05-10', type: 'Contract' },
  
  { id: 30, name: 'Fatima Noor', role: 'Logistics Associate', dept: 'Operations', avatar: 'FN', managerId: 21, projects: ['DS-UK'], email: 'fatima@targonglobal.com', phone: '+92 300 111 0030', location: 'Lahore, PK', joinDate: '2022-03-01', type: 'Full-time' },
  { id: 31, name: 'Bilal Siddiqui', role: 'Warehouse Manager', dept: 'Operations', avatar: 'BS', managerId: 21, projects: ['DS-UK'], email: 'bilal@targonglobal.com', phone: '+92 300 111 0031', location: 'Lahore, PK', joinDate: '2022-04-15', type: 'Full-time' },
  
  { id: 25, name: 'Nadia Malik', role: 'Senior Developer', dept: 'IT', avatar: 'NM', managerId: 3, projects: ['PROJ-X'], email: 'nadia@targonglobal.com', phone: '+92 300 111 0025', location: 'Lahore, PK', joinDate: '2021-05-01', type: 'Full-time' },
  { id: 26, name: 'Raza Khan', role: 'QA Lead', dept: 'IT', avatar: 'RK', managerId: 3, projects: ['PROJ-X'], email: 'raza@targonglobal.com', phone: '+92 300 111 0026', location: 'Lahore, PK', joinDate: '2021-07-10', type: 'Full-time' },
  
  { id: 33, name: 'Kamran Younis', role: 'Frontend Developer', dept: 'IT', avatar: 'KY', managerId: 25, projects: ['PROJ-X', 'DS-US'], email: 'kamran@targonglobal.com', phone: '+92 300 111 0033', location: 'Lahore, PK', joinDate: '2022-01-15', type: 'Full-time' },
  { id: 34, name: 'Ayesha Qureshi', role: 'Backend Developer', dept: 'IT', avatar: 'AQ', managerId: 25, projects: ['PROJ-X'], email: 'ayesha@targonglobal.com', phone: '+92 300 111 0034', location: 'Karachi, PK', joinDate: '2022-02-20', type: 'Full-time' },
  { id: 36, name: 'Sana Javed', role: 'QA Engineer', dept: 'IT', avatar: 'SJ', managerId: 26, projects: ['PROJ-X'], email: 'sana@targonglobal.com', phone: '+92 300 111 0036', location: 'Lahore, PK', joinDate: '2022-06-01', type: 'Contract' },
  
  { id: 27, name: 'Tariq Jamil', role: 'Full Stack Developer', dept: 'IT', avatar: 'TJ', managerId: 4, projects: ['DS-US'], email: 'tariq@targonglobal.com', phone: '+92 300 111 0027', location: 'Lahore, PK', joinDate: '2022-03-10', type: 'Full-time' },
  { id: 28, name: 'Bushra Nawaz', role: 'UI/UX Designer', dept: 'IT', avatar: 'BN', managerId: 4, projects: ['DS-US', 'PROJ-X'], email: 'bushra@targonglobal.com', phone: '+92 300 111 0028', location: 'Lahore, PK', joinDate: '2022-04-01', type: 'Full-time' },
  
  { id: 29, name: 'Maryam Javed', role: 'Accounts Executive', dept: 'Finance', avatar: 'MJ', managerId: 6, projects: [], email: 'maryam@targonglobal.com', phone: '+92 300 111 0029', location: 'Lahore, PK', joinDate: '2021-10-01', type: 'Full-time' },
  { id: 39, name: 'Junaid Akram', role: 'Payroll Officer', dept: 'Finance', avatar: 'JK', managerId: 6, projects: [], email: 'junaid@targonglobal.com', phone: '+92 300 111 0039', location: 'Lahore, PK', joinDate: '2022-01-20', type: 'Full-time' },
  
  { id: 44, name: 'Layla Hassan', role: 'Operations Lead', dept: 'Operations', avatar: 'LH', managerId: 7, projects: ['DS-UK'], email: 'layla@targonglobal.com', phone: '+92 300 111 0044', location: 'Islamabad, PK', joinDate: '2021-11-15', type: 'Full-time' },
  { id: 45, name: 'Naveed Akhtar', role: 'Business Development', dept: 'Operations', avatar: 'NA', managerId: 7, projects: ['DS-US'], email: 'naveed@targonglobal.com', phone: '+92 300 111 0045', location: 'Karachi, PK', joinDate: '2022-02-01', type: 'Full-time' },
  { id: 50, name: 'Omar Farooq', role: 'Operations Associate', dept: 'Operations', avatar: 'OF', managerId: 44, projects: ['DS-UK'], email: 'omar@targonglobal.com', phone: '+92 300 111 0050', location: 'Islamabad, PK', joinDate: '2022-07-01', type: 'Full-time' },
  { id: 51, name: 'Zara Sheikh', role: 'Operations Associate', dept: 'Operations', avatar: 'ZS', managerId: 44, projects: ['DS-UK'], email: 'zara@targonglobal.com', phone: '+92 300 111 0051', location: 'Islamabad, PK', joinDate: '2022-08-15', type: 'Contract' },
  
  { id: 46, name: 'Ghazala Karim', role: 'HR Manager', dept: 'HR', avatar: 'GK', managerId: 8, projects: [], email: 'ghazala@targonglobal.com', phone: '+92 300 111 0046', location: 'Lahore, PK', joinDate: '2021-12-01', type: 'Full-time' },
  { id: 47, name: 'Erum Shahid', role: 'Training Lead', dept: 'HR', avatar: 'ES', managerId: 8, projects: [], email: 'erum@targonglobal.com', phone: '+92 300 111 0047', location: 'Lahore, PK', joinDate: '2022-05-20', type: 'Full-time' },
  
  { id: 60, name: 'Ahmed Raza', role: 'Legal Counsel', dept: 'Legal', avatar: 'AR', managerId: 1, projects: [], email: 'ahmed.raza@targonglobal.com', phone: '+92 300 111 0060', location: 'Lahore, PK', joinDate: '2022-09-01', type: 'Full-time' },
  { id: 61, name: 'Sobia Malik', role: 'Compliance Officer', dept: 'Legal', avatar: 'SM', managerId: 60, projects: [], email: 'sobia@targonglobal.com', phone: '+92 300 111 0061', location: 'Lahore, PK', joinDate: '2023-01-15', type: 'Contract' },
];

const departments = [
  { id: 'Executive', name: 'Executive', headId: 1 },
  { id: 'Operations', name: 'Operations', headId: 2 },
  { id: 'Finance', name: 'Finance', headId: 6 },
  { id: 'HR', name: 'HR', headId: 8 },
  { id: 'Legal', name: 'Legal', headId: 60 },
  { id: 'IT', name: 'IT', headId: 25 },
];

const projects = [
  { id: 'DS-UK', name: 'Dust Sheets (UK)', code: 'DS-UK', status: 'ACTIVE', leadId: 2 },
  { id: 'DS-US', name: 'Dust Sheets (US)', code: 'DS-US', status: 'ACTIVE', leadId: 4 },
  { id: 'PROJ-X', name: 'Project X', code: 'PROJ-X', status: 'ACTIVE', leadId: 3 },
];

// ============================================
// STRICT 4-COLOR PALETTE
// ============================================
const COLORS = {
  teal: '#00C9B1',      // Primary accent
  navy: '#0A2540',      // Text, headings  
  slate: '#64748B',     // Secondary text
  white: '#FFFFFF',     // Card backgrounds
  light: '#F1F5F9',     // Page background
  amber: '#F59E0B',     // Warnings, contract
};

const deptColors = {
  'Executive': COLORS.teal,
  'Operations': COLORS.teal,
  'Finance': COLORS.teal,
  'HR': COLORS.teal,
  'Legal': COLORS.teal,
  'IT': COLORS.teal,
  'UNASSIGNED': COLORS.amber,
};

const projectColors = {
  'DS-UK': COLORS.teal,
  'DS-US': COLORS.teal,
  'PROJ-X': COLORS.teal,
  'UNASSIGNED': COLORS.amber,
};

// Layout constants - taller cards for 2-line roles
const NODE_W = 156;
const NODE_H = 68;
const H_GAP = 36;
const V_GAP = 52;
const HEADER_H = 44;
const COLUMN_GAP = 64;

// Helpers
const getManager = (emp) => employees.find(e => e.id === emp.managerId);
const getDirectReports = (emp) => employees.filter(e => e.managerId === emp.id);
const getTotalReports = (empId) => {
  const direct = employees.filter(e => e.managerId === empId);
  return direct.length + direct.reduce((sum, d) => sum + getTotalReports(d.id), 0);
};

const buildTree = (items, parentId = null) => {
  return items.filter(item => item.managerId === parentId).map(item => ({ ...item, children: buildTree(items, item.id) }));
};

// Layout functions
const layoutOverview = () => {
  const nodes = [];
  const edges = [];
  const empIds = employees.map(e => e.id);
  const orphans = employees.filter(e => e.managerId !== null && !empIds.includes(e.managerId));
  const tree = buildTree(employees);
  
  const getSubtreeWidth = (node) => {
    if (!node.children || node.children.length === 0) return NODE_W;
    return Math.max(NODE_W, node.children.reduce((sum, c, i) => sum + getSubtreeWidth(c) + (i > 0 ? H_GAP : 0), 0));
  };
  
  const position = (node, depth, leftX) => {
    const subtreeW = getSubtreeWidth(node);
    const x = leftX + subtreeW / 2;
    const y = depth * (NODE_H + V_GAP) + 50;
    
    nodes.push({ ...node, x, y, depth, color: deptColors[node.dept] || COLORS.teal, directReports: getDirectReports(node).length, totalReports: getTotalReports(node.id) });
    
    if (node.children?.length > 0) {
      let childLeft = leftX;
      node.children.forEach(child => {
        const childW = getSubtreeWidth(child);
        edges.push({ x1: x, y1: y + NODE_H, x2: childLeft + childW / 2, y2: (depth + 1) * (NODE_H + V_GAP) + 50, color: deptColors[child.dept] || COLORS.teal });
        position(child, depth + 1, childLeft);
        childLeft += childW + H_GAP;
      });
    }
  };
  
  let totalWidth = 0;
  if (tree.length > 0) { totalWidth = getSubtreeWidth(tree[0]); position(tree[0], 0, 0); }
  
  if (orphans.length > 0) {
    const orphanStartX = totalWidth + COLUMN_GAP * 2;
    const orphanWidth = Math.max(NODE_W + 40, orphans.length * (NODE_W + H_GAP));
    const orphanCenterX = orphanStartX + orphanWidth / 2;
    nodes.push({ id: 'orphan-header', name: 'Unassigned', role: `${orphans.length} members`, avatar: '?', x: orphanCenterX, y: 50, isHeader: true, color: COLORS.amber });
    orphans.forEach((orphan, i) => {
      const orphanX = orphanStartX + (orphanWidth / orphans.length) * i + (orphanWidth / orphans.length) / 2;
      nodes.push({ ...orphan, x: orphanX, y: 50 + HEADER_H + V_GAP, color: COLORS.amber, directReports: getDirectReports(orphan).length, totalReports: getTotalReports(orphan.id) });
      edges.push({ x1: orphanCenterX, y1: 50 + HEADER_H, x2: orphanX, y2: 50 + HEADER_H + V_GAP, color: COLORS.amber });
    });
    totalWidth = orphanStartX + orphanWidth;
  }
  
  return { nodes, edges, width: totalWidth, height: (Math.max(...nodes.map(n => n.depth || 0), 0) + 1) * (NODE_H + V_GAP) + 120 };
};

const layoutProject = () => {
  const nodes = [];
  const edges = [];
  const unassignedEmployees = employees.filter(e => e.projects.length === 0);
  const allProjects = [...projects, ...(unassignedEmployees.length > 0 ? [{ id: 'UNASSIGNED', name: 'Unassigned', code: '—', status: 'N/A', leadId: null }] : [])];
  
  let xOffset = 0;
  
  allProjects.forEach((proj) => {
    const projEmployees = proj.id === 'UNASSIGNED' ? unassignedEmployees : employees.filter(e => e.projects.includes(proj.id));
    if (projEmployees.length === 0) return;
    
    const lead = projEmployees.find(e => e.id === proj.leadId);
    const color = projectColors[proj.id] || COLORS.amber;
    const projEmpIds = new Set(projEmployees.map(e => e.id));
    const orphanIds = new Set(projEmployees.filter(e => lead && e.id !== lead.id && !projEmpIds.has(e.managerId)).map(e => e.id));
    
    const getChildren = (empId, visited = new Set()) => {
      if (visited.has(empId)) return [];
      visited.add(empId);
      const direct = projEmployees.filter(e => e.managerId === empId && !orphanIds.has(e.id));
      return lead && empId === lead.id ? [...direct, ...projEmployees.filter(e => orphanIds.has(e.id))] : direct;
    };
    
    const widthCache = new Map();
    const getSubtreeWidth = (empId, visited = new Set()) => {
      if (visited.has(empId) || widthCache.has(empId)) return widthCache.get(empId) || NODE_W;
      visited.add(empId);
      const children = getChildren(empId, new Set());
      const width = children.length === 0 ? NODE_W : Math.max(NODE_W, children.reduce((sum, c, i) => sum + getSubtreeWidth(c.id, new Set(visited)) + (i > 0 ? H_GAP : 0), 0));
      widthCache.set(empId, width);
      return width;
    };
    
    const projWidth = lead ? Math.max(NODE_W + 60, getSubtreeWidth(lead.id)) : Math.max(NODE_W + 60, projEmployees.length * (NODE_W + H_GAP));
    const projCenterX = xOffset + projWidth / 2;
    
    nodes.push({ id: `proj-${proj.id}`, name: proj.name, role: proj.status !== 'N/A' ? `${proj.status} · ${projEmployees.length}` : `${projEmployees.length} members`, avatar: proj.code.slice(0, 2), x: projCenterX, y: 40, isHeader: true, isProject: true, color, status: proj.status });
    
    const positionedIds = new Set();
    const positionEmployee = (emp, depth, leftX, parentX, parentY) => {
      if (positionedIds.has(emp.id)) return;
      positionedIds.add(emp.id);
      const subtreeW = getSubtreeWidth(emp.id);
      const x = leftX + subtreeW / 2;
      const y = 40 + HEADER_H + depth * (NODE_H + V_GAP);
      
      nodes.push({ ...emp, x, y, color, isLead: emp.id === proj.leadId, originalColor: deptColors[emp.dept], directReports: getDirectReports(emp).length, totalReports: getTotalReports(emp.id) });
      edges.push({ x1: parentX ?? projCenterX, y1: parentY ? parentY + NODE_H : 40 + HEADER_H, x2: x, y2: y, color });
      
      let childLeft = leftX;
      getChildren(emp.id, new Set()).forEach(child => {
        if (!positionedIds.has(child.id)) { positionEmployee(child, depth + 1, childLeft, x, y); childLeft += getSubtreeWidth(child.id) + H_GAP; }
      });
    };
    
    if (lead) { positionEmployee(lead, 1, xOffset + (projWidth - getSubtreeWidth(lead.id)) / 2, null, null); }
    else { projEmployees.forEach((emp, i) => { if (!positionedIds.has(emp.id)) { positionedIds.add(emp.id); const empX = xOffset + (projWidth / projEmployees.length) * i + (projWidth / projEmployees.length) / 2; nodes.push({ ...emp, x: empX, y: 40 + HEADER_H + V_GAP, color, originalColor: deptColors[emp.dept], directReports: getDirectReports(emp).length, totalReports: getTotalReports(emp.id) }); edges.push({ x1: projCenterX, y1: 40 + HEADER_H, x2: empX, y2: 40 + HEADER_H + V_GAP, color }); } }); }
    
    xOffset += projWidth + COLUMN_GAP;
  });
  
  return { nodes, edges, width: xOffset, height: Math.max(...nodes.map(n => n.y), 200) + NODE_H + 100 };
};

// Components
const CurvedPath = ({ x1, y1, x2, y2, color, highlighted }) => {
  const midY = y1 + (y2 - y1) * 0.5;
  const d = Math.abs(x1 - x2) < 1 ? `M ${x1} ${y1} L ${x2} ${y2}` : `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
  return <path d={d} fill="none" stroke={highlighted ? color : COLORS.slate} strokeWidth={highlighted ? 2 : 1.5} strokeLinecap="round" strokeOpacity={highlighted ? 1 : 0.25} style={{ transition: 'all 0.3s ease' }} />;
};

// Helper to wrap text into lines
const wrapText = (text, maxChars) => {
  if (!text) return [''];
  if (text.length <= maxChars) return [text];
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  
  words.forEach(word => {
    if ((currentLine + ' ' + word).trim().length <= maxChars) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  });
  if (currentLine) lines.push(currentLine);
  return lines.slice(0, 2);
};

const OrgNode = ({ node, highlighted, searchMatch, onHover, onClick }) => {
  const color = node.color || COLORS.teal;
  const x = node.x - NODE_W / 2;
  const y = node.y;
  
  if (node.isHeader) {
    return (
      <g style={{ cursor: 'default' }}>
        <rect x={x} y={y} width={NODE_W} height={HEADER_H} rx={10} fill={color} />
        <text x={node.x} y={y + 17} textAnchor="middle" fontSize={12} fontWeight="600" fill={COLORS.white} style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>{node.name.length > 16 ? node.name.slice(0, 15) + '…' : node.name}</text>
        <text x={node.x} y={y + 32} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.85)" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>{node.role}</text>
      </g>
    );
  }
  
  const barColor = node.originalColor || color;
  const isActive = highlighted || searchMatch;
  const roleLines = wrapText(node.role, 16);
  const hasReports = node.directReports > 0;
  
  return (
    <g style={{ cursor: 'pointer' }} onMouseEnter={() => onHover(node)} onMouseLeave={() => onHover(null)} onClick={() => onClick(node)}>
      {/* Shadow */}
      <rect x={x + 2} y={y + 2} width={NODE_W} height={NODE_H} rx={10} fill="rgba(0,0,0,0.05)" />
      
      {/* Card */}
      <rect x={x} y={y} width={NODE_W} height={NODE_H} rx={10} fill={COLORS.white} stroke={isActive ? color : '#E2E8F0'} strokeWidth={isActive ? 2 : 1} style={{ transition: 'all 0.2s ease' }} />
      
      {/* Accent bar */}
      <rect x={x} y={y} width={4} height={NODE_H} fill={barColor} style={{ clipPath: 'inset(0 0 0 0 round 10px 0 0 10px)' }} />
      
      {/* Avatar */}
      <circle cx={x + 26} cy={y + 26} r={14} fill={`${barColor}18`} />
      <text x={x + 26} y={y + 30} textAnchor="middle" fontSize={10} fontWeight="700" fill={barColor} style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>{node.avatar?.slice(0, 2)}</text>
      
      {/* Name */}
      <text x={x + 48} y={y + 18} fontSize={11} fontWeight="600" fill={COLORS.navy} style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>{node.name?.length > 13 ? node.name.slice(0, 12) + '…' : node.name}</text>
      
      {/* Role - up to 2 lines */}
      {roleLines.map((line, i) => (
        <text key={i} x={x + 48} y={y + 32 + i * 11} fontSize={9} fill={COLORS.slate} style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>{line}</text>
      ))}
      
      {/* Reports count - subtle text */}
      {hasReports && (
        <text x={x + 48} y={y + NODE_H - 8} fontSize={9} fill={COLORS.slate} style={{ fontFamily: 'system-ui, -apple-system, sans-serif', opacity: 0.7 }}>
          {node.directReports} direct report{node.directReports > 1 ? 's' : ''}
        </text>
      )}
      
      {/* Contract indicator */}
      {node.type === 'Contract' && (
        <g>
          <circle cx={x + NODE_W - 12} cy={y + 12} r={8} fill={`${COLORS.amber}20`} />
          <text x={x + NODE_W - 12} y={y + 16} textAnchor="middle" fontSize={9} fontWeight="600" fill={COLORS.amber} style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>C</text>
        </g>
      )}
      
      {/* YOU badge */}
      {node.isYou && (
        <g>
          <rect x={x + NODE_W - 30} y={y - 6} width={28} height={16} rx={6} fill={COLORS.teal} />
          <text x={x + NODE_W - 16} y={y + 6} textAnchor="middle" fontSize={9} fontWeight="700" fill={COLORS.white} style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>YOU</text>
        </g>
      )}
      
      {/* HEAD/LEAD badge */}
      {(node.isHead || node.isLead) && !node.isYou && (
        <g>
          <rect x={x + NODE_W - 34} y={y - 6} width={32} height={16} rx={6} fill={color} />
          <text x={x + NODE_W - 18} y={y + 6} textAnchor="middle" fontSize={8} fontWeight="700" fill={COLORS.white} style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>{node.isHead ? 'HEAD' : 'LEAD'}</text>
        </g>
      )}
    </g>
  );
};

const DetailPanel = ({ employee, onClose }) => {
  if (!employee || employee.isHeader) return null;
  const manager = getManager(employee);
  const directReports = getDirectReports(employee);
  const color = deptColors[employee.dept] || COLORS.teal;
  
  return (
    <div style={{ position: 'fixed', bottom: 20, left: 20, right: 20, background: COLORS.white, borderRadius: 16, boxShadow: '0 20px 50px rgba(0,0,0,0.15)', border: '1px solid #E2E8F0', display: 'flex', zIndex: 100, maxWidth: 920, margin: '0 auto', overflow: 'hidden', fontFamily: 'system-ui, -apple-system, sans-serif', animation: 'slideUp 0.3s ease' }}>
      <style>{`@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
      
      <div style={{ padding: 22, borderRight: '1px solid #E2E8F0', flex: '1 1 280px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, background: `${color}15`, color, flexShrink: 0 }}>{employee.avatar?.slice(0, 2)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: COLORS.navy }}>{employee.name}</span>
              {employee.isYou && <span style={{ fontSize: 10, padding: '3px 7px', background: COLORS.teal, color: COLORS.white, borderRadius: 5, fontWeight: 700 }}>YOU</span>}
            </div>
            <div style={{ fontSize: 13, color: COLORS.slate, marginBottom: 8 }}>{employee.role}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, padding: '4px 8px', background: `${color}12`, color, borderRadius: 6, fontWeight: 600 }}>{employee.dept}</span>
              <span style={{ fontSize: 10, padding: '4px 8px', background: employee.type === 'Contract' ? `${COLORS.amber}15` : COLORS.light, color: employee.type === 'Contract' ? COLORS.amber : COLORS.slate, borderRadius: 6, fontWeight: 500 }}>{employee.type}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ padding: 8, background: COLORS.light, border: 'none', borderRadius: 8, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} color={COLORS.slate} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[{ icon: Mail, value: employee.email }, { icon: Phone, value: employee.phone }, { icon: MapPin, value: employee.location }, { icon: Calendar, value: `Joined ${employee.joinDate}` }].map(({ icon: Icon, value }, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon size={14} color={COLORS.slate} style={{ flexShrink: 0 }} />
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: COLORS.light, borderRadius: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, background: `${COLORS.teal}15`, color: COLORS.teal, flexShrink: 0 }}>{manager.avatar?.slice(0, 2)}</div>
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 600, color: COLORS.navy }}>{manager.name}</div><div style={{ fontSize: 10, color: COLORS.slate }}>{manager.role}</div></div>
            </div>
          </div>
        ) : <div style={{ fontSize: 12, color: COLORS.slate, marginBottom: 14, padding: '10px', background: COLORS.light, borderRadius: 8, textAlign: 'center' }}><Sparkles size={14} style={{ marginBottom: 4, opacity: 0.5 }} /><div>Top of hierarchy</div></div>}
        <div>
          <div style={{ fontSize: 10, color: COLORS.slate, marginBottom: 6 }}>Direct reports · {directReports.length}</div>
          {directReports.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {directReports.slice(0, 4).map(report => (
                <div key={report.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, background: `${COLORS.teal}15`, color: COLORS.teal, flexShrink: 0 }}>{report.avatar?.slice(0, 2)}</div>
                  <span style={{ fontSize: 11, color: COLORS.navy }}>{report.name}</span>
                </div>
              ))}
              {directReports.length > 4 && <div style={{ fontSize: 11, color: COLORS.teal, fontWeight: 600, paddingLeft: 32 }}>+{directReports.length - 4} more</div>}
            </div>
          ) : <div style={{ fontSize: 12, color: COLORS.slate }}>No direct reports</div>}
        </div>
      </div>
      
      <div style={{ padding: 22, flex: '1 1 180px', minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.slate, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>Projects</div>
        {employee.projects?.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {employee.projects.map(projId => {
              const proj = projects.find(p => p.id === projId);
              if (!proj) return null;
              return (
                <div key={projId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 12px', background: `${COLORS.teal}08`, borderRadius: 8, border: `1px solid ${COLORS.teal}18` }}>
                  <div style={{ minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 600, color: COLORS.navy }}>{proj.name}</div><div style={{ fontSize: 10, color: COLORS.slate }}>{proj.code}</div></div>
                  {proj.leadId === employee.id && <span style={{ fontSize: 9, padding: '2px 6px', background: COLORS.teal, color: COLORS.white, borderRadius: 4, fontWeight: 700, flexShrink: 0 }}>LEAD</span>}
                </div>
              );
            })}
          </div>
        ) : <div style={{ fontSize: 12, color: COLORS.slate, padding: '12px', background: COLORS.light, borderRadius: 8, textAlign: 'center' }}>No projects assigned</div>}
      </div>
    </div>
  );
};

// Main Component
export default function OrgChart() {
  const [viewMode, setViewMode] = useState('organization');
  const [scale, setScale] = useState(0.85);
  const [pan, setPan] = useState({ x: 60, y: 30 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const { nodes, edges } = useMemo(() => viewMode === 'project' ? layoutProject() : layoutOverview(), [viewMode]);
  const isGraphView = viewMode === 'organization';

  const highlightedIds = useMemo(() => {
    if (!hovered || hovered.isHeader) return new Set();
    const ids = new Set([hovered.id]);
    if (isGraphView) {
      const findChain = (targetId, direction) => {
        edges.forEach(e => {
          const parent = nodes.find(n => Math.abs(n.x - e.x1) < 1 && Math.abs(n.y + NODE_H - e.y1) < 1);
          const child = nodes.find(n => Math.abs(n.x - e.x2) < 1 && Math.abs(n.y - e.y2) < 1);
          if (direction === 'up' && child?.id === targetId && parent && !parent.isHeader) { ids.add(parent.id); findChain(parent.id, 'up'); }
          if (direction === 'down' && parent?.id === targetId && child && !child.isHeader) { ids.add(child.id); findChain(child.id, 'down'); }
        });
      };
      findChain(hovered.id, 'up');
      findChain(hovered.id, 'down');
    }
    return ids;
  }, [hovered, nodes, edges, isGraphView]);

  const searchMatches = useMemo(() => {
    if (!search) return new Set();
    const q = search.toLowerCase();
    return new Set(nodes.filter(n => !n.isHeader && (n.name?.toLowerCase().includes(q) || n.role?.toLowerCase().includes(q) || n.dept?.toLowerCase().includes(q))).map(n => n.id));
  }, [search, nodes]);

  const isEdgeHighlighted = (edge) => {
    if (!isGraphView || !hovered || hovered.isHeader) return false;
    const parent = nodes.find(n => Math.abs(n.x - edge.x1) < 1);
    const child = nodes.find(n => Math.abs(n.x - edge.x2) < 1);
    return parent && child && !parent.isHeader && highlightedIds.has(parent.id) && highlightedIds.has(child.id);
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: COLORS.light, fontFamily: 'system-ui, -apple-system, sans-serif', opacity: mounted ? 1 : 0, transition: 'opacity 0.4s ease' }}>
      
      {/* Header */}
      <div style={{ background: COLORS.white, borderBottom: '1px solid #E2E8F0', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: COLORS.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={COLORS.white} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="6" r="2.5" /><circle cx="6" cy="17" r="2.5" /><circle cx="18" cy="17" r="2.5" /><path d="M12 8.5V12M12 12L6 14.5M12 12L18 14.5" /></svg>
            </div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: COLORS.navy, margin: 0, lineHeight: 1.2 }}>Targon Global</h1>
              <p style={{ fontSize: 12, color: COLORS.slate, margin: 0 }}>{employees.length} people · {departments.length} teams</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, padding: 4, background: COLORS.light, borderRadius: 10 }}>
            {[{ id: 'organization', label: 'Organization', icon: Users }, { id: 'project', label: 'Projects', icon: FolderKanban }].map(tab => (
              <button key={tab.id} onClick={() => { setViewMode(tab.id); setPan({ x: 60, y: 30 }); setScale(0.85); setSelected(null); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s', background: viewMode === tab.id ? COLORS.white : 'transparent', color: viewMode === tab.id ? COLORS.navy : COLORS.slate, boxShadow: viewMode === tab.id ? '0 1px 2px rgba(0,0,0,0.06)' : 'none' }}>
                <tab.icon size={15} /><span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: COLORS.slate, pointerEvents: 'none' }} />
          <input type="text" placeholder="Search people..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 200, padding: '9px 12px 9px 38px', fontSize: 13, background: COLORS.light, border: '1px solid #E2E8F0', borderRadius: 10, outline: 'none', boxSizing: 'border-box', color: COLORS.navy }} onFocus={(e) => { e.target.style.borderColor = COLORS.teal; }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0'; }} />
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}><X size={14} color={COLORS.slate} /></button>}
        </div>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: dragging ? 'grabbing' : 'grab' }} onMouseDown={(e) => { setDragging(true); setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y }); }} onMouseMove={(e) => { if (dragging) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); }} onMouseUp={() => setDragging(false)} onMouseLeave={() => setDragging(false)}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.4, backgroundImage: `radial-gradient(${COLORS.slate}30 1px, transparent 1px)`, backgroundSize: '28px 28px', pointerEvents: 'none' }} />
        
        <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
            {edges.map((edge, i) => <CurvedPath key={i} x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} color={edge.color} highlighted={isEdgeHighlighted(edge)} />)}
            {nodes.map((node, i) => <OrgNode key={node.id || i} node={node} highlighted={highlightedIds.has(node.id)} searchMatch={searchMatches.has(node.id)} onHover={setHovered} onClick={setSelected} />)}
          </g>
        </svg>

        {/* Controls */}
        <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', flexDirection: 'column', background: COLORS.white, borderRadius: 10, border: '1px solid #E2E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          {[{ icon: ZoomIn, action: () => setScale(s => Math.min(2, s + 0.15)) }, { icon: ZoomOut, action: () => setScale(s => Math.max(0.3, s - 0.15)) }, { icon: Maximize2, action: () => { setScale(0.85); setPan({ x: 60, y: 30 }); } }].map(({ icon: Icon, action }, i) => (
            <button key={i} onClick={action} style={{ padding: 10, border: 'none', background: 'none', cursor: 'pointer', borderBottom: i < 2 ? '1px solid #E2E8F0' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={(e) => e.currentTarget.style.background = COLORS.light} onMouseLeave={(e) => e.currentTarget.style.background = 'none'}><Icon size={16} color={COLORS.slate} /></button>
          ))}
        </div>

        <div style={{ position: 'absolute', bottom: 16, left: 16, padding: '8px 14px', background: COLORS.white, borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 12, color: COLORS.slate, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{viewMode === 'organization' ? '🔗' : '📁'}</span>
          {viewMode === 'organization' ? 'Hover to trace reporting chain' : 'Grouped by project'}
        </div>

        <div style={{ position: 'absolute', bottom: 16, right: 16, padding: '6px 12px', background: COLORS.white, borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 11, fontWeight: 600, color: COLORS.slate, fontVariantNumeric: 'tabular-nums' }}>{Math.round(scale * 100)}%</div>
      </div>

      {selected && !selected.isHeader && <DetailPanel employee={selected} onClose={() => setSelected(null)} />}

      {search && searchMatches.size > 0 && (
        <div style={{ position: 'absolute', top: 68, right: 24, width: 280, background: COLORS.white, borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.1)', border: '1px solid #E2E8F0', overflow: 'hidden', zIndex: 50, animation: 'fadeIn 0.2s ease' }}>
          <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #E2E8F0', fontSize: 11, color: COLORS.slate, fontWeight: 600 }}>{searchMatches.size} result{searchMatches.size > 1 ? 's' : ''}</div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {nodes.filter(n => searchMatches.has(n.id)).map(node => (
              <button key={node.id} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #F1F5F9', boxSizing: 'border-box' }} onMouseEnter={(e) => e.currentTarget.style.background = COLORS.light} onMouseLeave={(e) => e.currentTarget.style.background = 'none'} onClick={() => { setSelected(node); setPan({ x: 400 - node.x * scale, y: 200 - node.y * scale }); setSearch(''); }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: `${COLORS.teal}15`, color: COLORS.teal, flexShrink: 0 }}>{node.avatar?.slice(0, 2)}</div>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, color: COLORS.navy, marginBottom: 2 }}>{node.name}</div><div style={{ fontSize: 11, color: COLORS.slate }}>{node.role}</div></div>
                <ChevronRight size={14} color={COLORS.slate} style={{ flexShrink: 0 }} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
