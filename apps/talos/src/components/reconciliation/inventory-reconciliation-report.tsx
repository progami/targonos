'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, AlertTriangle, CheckCircle, XCircle, Calculator } from '@/lib/lucide-icons';
import { formatDistanceToNow } from 'date-fns';

interface ReconciliationReport {
 id: string;
 started_at: string;
 completed_at: string | null;
 status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
 total_warehouses: number;
 total_skus: number;
 total_discrepancies: number;
 critical_discrepancies: number;
 summary_statistics: Record<string, unknown>;
 error_message?: string;
 users: {
 full_name: string;
 email: string;
 };
}

interface Discrepancy {
 id: string;
 warehouse_id: string;
 sku_id: string;
 batch_lot: string;
 recorded_balance: number;
 calculated_balance: number;
 difference: number;
 severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
 warehouses: {
 name: string;
 code: string;
 };
 skus: {
 sku_code: string;
 description: string;
 };
}

export function InventoryReconciliationReport() {
 const [reports, setReports] = useState<ReconciliationReport[]>([]);
 const [selectedReport, setSelectedReport] = useState<ReconciliationReport | null>(null);
 const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
 const [loading, setLoading] = useState(true);
 const [triggering, setTriggering] = useState(false);
 const [error, setError] = useState<string | null>(null);

 useEffect(() => {
 fetchReports();
 }, []);

 const fetchReports = async () => {
 try {
 setLoading(true);
 const response = await fetch('/api/reconciliation/inventory?limit=5');
 if (!response.ok) throw new Error('Failed to fetch reports');
 const data = await response.json();
 setReports(data.reports);
 } catch (err) {
 setError(err instanceof Error ? err.message : 'Failed to load reports');
 } finally {
 setLoading(false);
 }
 };

 const fetchReportDetails = async (reportId: string) => {
 try {
 const response = await fetch(`/api/reconciliation/inventory?reportId=${reportId}`);
 if (!response.ok) throw new Error('Failed to fetch report details');
 const data = await response.json();
 setSelectedReport(data.report);
 
 // Fetch discrepancies
 const discrepResponse = await fetch(`/api/reconciliation/inventory/discrepancies?reportId=${reportId}`);
 if (!discrepResponse.ok) throw new Error('Failed to fetch discrepancies');
 const discrepData = await discrepResponse.json();
 setDiscrepancies(discrepData.discrepancies);
 } catch (err) {
 setError(err instanceof Error ? err.message : 'Failed to load report details');
 }
 };

 const triggerReconciliation = async () => {
 try {
 setTriggering(true);
 setError(null);
 
 // Get CSRF token
 const csrfResponse = await fetch('/api/csrf');
 const { csrfToken } = await csrfResponse.json();
 
 const response = await fetch('/api/reconciliation/inventory', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'x-csrf-token': csrfToken,
 },
 });
 
 if (!response.ok) {
 const data = await response.json();
 throw new Error(data.error || 'Failed to trigger reconciliation');
 }
 
 // Refresh reports
 await fetchReports();
 } catch (err) {
 setError(err instanceof Error ? err.message : 'Failed to trigger reconciliation');
 } finally {
 setTriggering(false);
 }
 };

 const getSeverityColor = (severity: string) => {
 switch (severity) {
 case 'CRITICAL': return 'bg-red-500';
 case 'HIGH': return 'bg-orange-500';
 case 'MEDIUM': return 'bg-yellow-500';
 case 'LOW': return 'bg-cyan-500';
 default: return 'bg-slate-500';
 }
 };

 const getStatusIcon = (status: string) => {
 switch (status) {
 case 'COMPLETED': return <CheckCircle className="h-4 w-4 text-green-500" />;
 case 'FAILED': return <XCircle className="h-4 w-4 text-red-500" />;
 case 'IN_PROGRESS': return <Loader2 className="h-4 w-4 animate-spin" />;
 default: return null;
 }
 };

 if (loading) {
 return (
 <div className="flex items-center justify-center p-8">
 <Loader2 className="h-8 w-8 animate-spin" />
 </div>
 );
 }

 return (
 <div className="space-y-6">
 <div className="flex justify-between items-center">
 <h2 className="text-2xl font-bold">Inventory Reconciliation</h2>
 <Button
 onClick={triggerReconciliation}
 disabled={triggering || reports.some(r => r.status === 'IN_PROGRESS')}
 >
 {triggering ? (
 <>
 <Loader2 className="mr-2 h-4 w-4 animate-spin" />
 Starting...
 </>
	 ) : (
	 <>
	 <Calculator className="mr-2 h-4 w-4" />
	 Run Reconciliation
	 </>
	 )}
	 </Button>
 </div>

 {error && (
 <Alert variant="destructive">
 <AlertTriangle className="h-4 w-4" />
 <AlertTitle>Error</AlertTitle>
 <AlertDescription>{error}</AlertDescription>
 </Alert>
 )}

 {/* Recent Reports */}
 <Card>
 <CardHeader>
 <CardTitle>Recent Reports</CardTitle>
 <CardDescription>Click on a report to view details</CardDescription>
 </CardHeader>
 <CardContent>
 <div className="space-y-2">
 {reports.map((report) => (
 <div
 key={report.id}
 className="p-4 border rounded-lg cursor-pointer hover:bg-slate-50 transition-colors"
 onClick={() => fetchReportDetails(report.id)}
 >
 <div className="flex items-center justify-between">
 <div className="flex items-center space-x-2">
 {getStatusIcon(report.status)}
 <span className="font-medium">
 {formatDistanceToNow(new Date(report.started_at), { addSuffix: true })}
 </span>
 </div>
 <div className="flex items-center space-x-4">
 {report.critical_discrepancies > 0 && (
 <Badge variant="destructive">
 {report.critical_discrepancies} Critical
 </Badge>
 )}
 <Badge variant="outline">
 {report.total_discrepancies} Total Discrepancies
 </Badge>
 </div>
 </div>
 {report.status === 'FAILED' && report.error_message && (
 <p className="text-sm text-red-600 mt-2">{report.error_message}</p>
 )}
 </div>
 ))}
 </div>
 </CardContent>
 </Card>

 {/* Selected Report Details */}
 {selectedReport && (
 <Card>
 <CardHeader>
 <CardTitle>Report Details</CardTitle>
 <CardDescription>
 Report ID: {selectedReport.id}
 </CardDescription>
 </CardHeader>
 <CardContent>
 {selectedReport.summary_statistics && (
 <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
 <div className="text-center">
 <p className="text-2xl font-bold">{selectedReport.total_warehouses}</p>
 <p className="text-sm text-slate-600">Warehouses</p>
 </div>
 <div className="text-center">
 <p className="text-2xl font-bold">{selectedReport.total_skus}</p>
 <p className="text-sm text-slate-600">SKUs</p>
 </div>
 <div className="text-center">
 <p className="text-2xl font-bold">{selectedReport.total_discrepancies}</p>
 <p className="text-sm text-slate-600">Discrepancies</p>
 </div>
 <div className="text-center">
 <p className="text-2xl font-bold text-red-600">{selectedReport.critical_discrepancies}</p>
 <p className="text-sm text-slate-600">Critical</p>
 </div>
 </div>
 )}

 {/* Discrepancies Table */}
 {discrepancies.length > 0 && (
 <div className="overflow-x-auto">
 <table className="w-full border-collapse">
 <thead>
 <tr className="border-b">
 <th className="text-left p-2">Warehouse</th>
 <th className="text-left p-2">SKU</th>
 <th className="text-left p-2">Batch</th>
 <th className="text-right p-2">Recorded</th>
 <th className="text-right p-2">Calculated</th>
 <th className="text-right p-2">Difference</th>
 <th className="text-center p-2">Severity</th>
 </tr>
 </thead>
 <tbody>
 {discrepancies.map((disc) => (
 <tr key={disc.id} className="border-b hover:bg-slate-50">
 <td className="p-2">{disc.warehouses.name}</td>
 <td className="p-2">
 <div>
 <p className="font-medium">{disc.skus.sku_code}</p>
 <p className="text-sm text-slate-600">{disc.skus.description}</p>
 </div>
 </td>
 <td className="p-2">{disc.batch_lot}</td>
 <td className="p-2 text-right">{disc.recorded_balance}</td>
 <td className="p-2 text-right">{disc.calculated_balance}</td>
 <td className="p-2 text-right font-medium">
 {disc.difference > 0 ? '+' : ''}{disc.difference}
 </td>
 <td className="p-2 text-center">
 <Badge className={getSeverityColor(disc.severity)}>
 {disc.severity}
 </Badge>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </CardContent>
 </Card>
 )}
 </div>
 );
}
