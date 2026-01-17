'use client'

import React, { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface Tab {
 id: string
 label: string
 icon?: React.ReactNode
 hasError?: boolean
 disabled?: boolean
}

interface TabbedContainerProps {
 tabs: Tab[]
 children: React.ReactNode
 defaultTab?: string
 value?: string
 onChange?: (tabId: string) => void
}

export function TabbedContainer({ tabs, children, defaultTab, value, onChange }: TabbedContainerProps) {
 const [internalActiveTab, setInternalActiveTab] = useState(defaultTab || tabs[0]?.id)

 const isControlled = value !== undefined
 const activeTab = isControlled ? value : internalActiveTab

 useEffect(() => {
   if (!tabs.find(t => t.id === activeTab) && tabs.length > 0) {
     const newTab = tabs[0].id
     if (isControlled) {
       onChange?.(newTab)
     } else {
       setInternalActiveTab(newTab)
     }
   }
 }, [tabs, activeTab, isControlled, onChange])

 const handleTabChange = (tabId: string) => {
   if (isControlled) {
     onChange?.(tabId)
   } else {
     setInternalActiveTab(tabId)
     onChange?.(tabId)
   }
 }

 const childrenArray = React.Children.toArray(children)

 return (
 <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-soft">
 {/* Tab Headers */}
 <div className="border-b border-slate-200 dark:border-slate-700">
 <nav className="flex space-x-6 px-6" aria-label="Tabs">
 {tabs.map((tab) => (
 <button
 key={tab.id}
 type="button"
 onClick={() => handleTabChange(tab.id)}
 disabled={tab.disabled}
 className={cn(
 'py-4 px-1 border-b-2 font-medium text-sm transition-colors relative',
 activeTab === tab.id
 ? 'border-cyan-600 text-cyan-700 dark:text-cyan-400'
 : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600',
 tab.disabled && 'opacity-50 cursor-not-allowed'
 )}
 >
 <span className="flex items-center gap-2">
 {tab.icon}
 {tab.label}
 {tab.hasError && (
 <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full"></span>
 )}
 </span>
 </button>
 ))}
 </nav>
 </div>

 {/* Tab Content */}
 <div className="p-6">
 {tabs.map((tab, index) => (
 <div
 key={tab.id}
 className={cn(
 'tab-panel',
 activeTab === tab.id ? 'block' : 'hidden'
 )}
 role="tabpanel"
 aria-labelledby={`tab-${tab.id}`}
 >
 {childrenArray[index]}
 </div>
 ))}
 </div>
 </div>
 )
}

interface TabPanelProps {
 children: React.ReactNode
 className?: string
}

export function TabPanel({ children, className }: TabPanelProps) {
 return <div className={className}>{children}</div>
}