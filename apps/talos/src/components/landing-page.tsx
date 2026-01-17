'use client'

import {
 Package2,
 ArrowRight,
 CheckCircle2,
 BarChart3,
 Truck,
 FileText,
 Shield,
 Zap,
 Users
} from '@/lib/lucide-icons'
import { portalUrl, redirectToPortal } from '@/lib/portal'

export default function LandingPage() {
 const version = process.env.NEXT_PUBLIC_VERSION ?? '0.0.0'
	 const explicitReleaseUrl = process.env.NEXT_PUBLIC_RELEASE_URL || undefined
	 const commitSha = process.env.NEXT_PUBLIC_COMMIT_SHA || undefined
	 const commitUrl = commitSha ? `https://github.com/progami/targonos/commit/${commitSha}` : undefined
	 const inferredReleaseUrl = `https://github.com/progami/targonos/releases/tag/v${version}`
	 const versionHref = explicitReleaseUrl ?? commitUrl ?? inferredReleaseUrl

 const features = [
 {
 icon: <BarChart3 className="h-6 w-6" />,
 title: 'Real-time Analytics',
 description: 'Track inventory levels, costs, and performance with interactive dashboards'
 },
 {
 icon: <Truck className="h-6 w-6" />,
 title: 'Inventory Management',
 description: 'Manage SKUs, track movements, and optimize warehouse operations'
 },
 {
 icon: <FileText className="h-6 w-6" />,
 title: 'Automated Billing',
 description: 'Generate invoices, track payments, and manage customer accounts'
 },
 {
 icon: <Shield className="h-6 w-6" />,
 title: 'Secure & Reliable',
 description: 'Enterprise-grade security with role-based access control'
 },
 {
 icon: <Zap className="h-6 w-6" />,
 title: 'Fast & Efficient',
 description: 'Optimized for speed with real-time updates and notifications'
 },
 {
 icon: <Users className="h-6 w-6" />,
 title: 'Multi-user Support',
 description: 'Collaborate with your team with different access levels'
 }
 ]

 return (
 <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white ">
 {/* Hero Section */}
 <div className="relative overflow-hidden">
 <div className="absolute inset-0 bg-gradient-to-br from-cyan-50 to-brand-teal-50 " />

 <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 pb-16 text-center">
 <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 mb-6 leading-tight">
 Modern Warehouse
 <span className="block text-transparent bg-clip-text bg-gradient-to-r from-cyan-600 to-brand-teal-600 pb-2">
 Management System
 </span>
 </h1>

 <p className="text-xl text-slate-600 mb-10 max-w-3xl mx-auto">
 Streamline your warehouse operations with our comprehensive inventory tracking,
 automated billing, and real-time analytics platform.
 </p>

 <div className="flex flex-col sm:flex-row gap-4 justify-center">
 <a
 href={portalUrl('/login').toString()}
 onClick={(e) => {
 e.preventDefault()
 redirectToPortal('/login', `${window.location.origin}/dashboard`)
 }}
 className="group inline-flex items-center justify-center gap-2 px-8 py-4 text-lg font-medium text-white bg-gradient-to-r from-cyan-600 to-brand-teal-600 rounded-lg hover:from-cyan-700 hover:to-brand-teal-700 transition-all transform hover:scale-105"
 >
 <Package2 className="h-5 w-5" />
 <span>Sign In</span>
 <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
 </a>
 </div>

 <div className="mt-8 flex items-center justify-center gap-2 text-sm text-slate-600 ">
 <CheckCircle2 className="h-4 w-4 text-green-500" />
 <span>Multi-tenant • Secure • Real-time analytics</span>
 </div>
 </div>
 </div>

 {/* Features Section */}
 <div className="py-20 px-4 sm:px-6 lg:px-8">
 <div className="mx-auto max-w-7xl">
 <div className="text-center mb-16">
 <h2 className="text-3xl font-bold text-slate-900 mb-4">
 Everything you need to manage your warehouse
 </h2>
 <p className="text-lg text-slate-600 ">
 Powerful features designed for modern 3PL operations
 </p>
 </div>
 
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
 {features.map((feature, index) => (
 <div 
 key={index}
 className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-soft hover:shadow-lg transition-shadow"
 >
 <div className="w-12 h-12 bg-cyan-100 rounded-lg flex items-center justify-center mb-4 text-cyan-600 ">
 {feature.icon}
 </div>
 <h3 className="text-xl font-semibold text-slate-900 mb-2">
 {feature.title}
 </h3>
 <p className="text-slate-600 ">
 {feature.description}
 </p>
 </div>
 ))}
 </div>
 </div>
 </div>

 {/* CTA Section */}
 <div className="bg-gradient-to-r from-cyan-600 to-brand-teal-600 py-16 px-4 sm:px-6 lg:px-8">
 <div className="mx-auto max-w-4xl text-center">
 <h2 className="text-3xl font-bold text-white mb-4">
 Ready to transform your warehouse operations?
 </h2>
 <p className="text-xl text-cyan-100 mb-8">
 Sign in to access your warehouse management dashboard
 </p>
 <a
 href={portalUrl('/login').toString()}
 onClick={(e) => {
 e.preventDefault()
 redirectToPortal('/login', `${window.location.origin}/dashboard`)
 }}
 className="inline-flex items-center gap-2 px-8 py-4 text-lg font-medium text-cyan-600 bg-white dark:bg-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
 >
 <span>Get Started</span>
 <ArrowRight className="h-5 w-5" />
 </a>
 </div>
 </div>

 {/* Footer */}
 <footer className="bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 border-t border-slate-200 dark:border-slate-700 ">
 <div className="mx-auto max-w-7xl text-center">
 <div className="flex items-center justify-center gap-2 mb-4">
 <Package2 className="h-8 w-8 text-cyan-600 " />
                  <span className="text-2xl font-bold text-slate-900 ">Talos</span>
 </div>
 <p className="text-slate-600 ">
 Modern warehouse management for the digital age
 </p>
 <p className="mt-4 text-xs text-slate-500">
                  Talos{' '}
 <a
 href={versionHref}
 target="_blank"
 rel="noopener noreferrer"
 className="underline hover:text-cyan-600 transition-colors"
 >
 v{version}
 </a>
 </p>
 </div>
 </footer>
 </div>
 )
}
