'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { EmptyState } from '@/components/ui/empty-state';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { PageHeader } from '@/components/page-header';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type ConnectionStatus = { connected: boolean; error?: string };
type MarketplaceId = 'amazon.com' | 'amazon.co.uk';
type AuditUpload = { id: string; filename: string; rowCount: number; invoiceCount: number; uploadedAt: string };
type AdsUpload = {
  id: string;
  reportType: string;
  marketplace: MarketplaceId;
  filename: string;
  startDate: string;
  endDate: string;
  rowCount: number;
  skuCount: number;
  uploadedAt: string;
};
type AwdUpload = {
  id: string;
  reportType: string;
  marketplace: MarketplaceId;
  filename: string;
  startDate: string;
  endDate: string;
  rowCount: number;
  skuCount: number;
  uploadedAt: string;
};

function marketLabel(marketplace: MarketplaceId): string {
  if (marketplace === 'amazon.com') {
    return 'US';
  }
  return 'UK';
}

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const response = await fetch(`${basePath}/api/qbo/status`);
  return response.json();
}

async function fetchAuditUploads(): Promise<{ uploads: AuditUpload[] }> {
  const response = await fetch(`${basePath}/api/plutus/audit-data`);
  return response.json();
}

async function fetchAdsUploads(): Promise<{ uploads: AdsUpload[] }> {
  const response = await fetch(`${basePath}/api/plutus/ads-data`);
  return response.json();
}

async function fetchAwdUploads(): Promise<{ uploads: AwdUpload[] }> {
  const response = await fetch(`${basePath}/api/plutus/awd-data`);
  return response.json();
}

function readApiError(payload: unknown, fallback: string): string {
  if (typeof payload !== 'object' || payload === null) {
    return fallback;
  }
  const details = (payload as Record<string, unknown>).details;
  if (typeof details === 'string' && details.trim() !== '') {
    return details;
  }
  const error = (payload as Record<string, unknown>).error;
  if (typeof error === 'string' && error.trim() !== '') {
    return error;
  }
  return fallback;
}

export default function DataSourcesPage() {
  const queryClient = useQueryClient();
  const auditInputRef = useRef<HTMLInputElement>(null);
  const adsInputRef = useRef<HTMLInputElement>(null);
  const awdInputRef = useRef<HTMLInputElement>(null);

  const [isUploadingAudit, setIsUploadingAudit] = useState(false);
  const [isUploadingAds, setIsUploadingAds] = useState(false);
  const [isUploadingAwd, setIsUploadingAwd] = useState(false);

  const [auditMessage, setAuditMessage] = useState<string | null>(null);
  const [adsMessage, setAdsMessage] = useState<string | null>(null);
  const [awdMessage, setAwdMessage] = useState<string | null>(null);

  const [adsMarketplace, setAdsMarketplace] = useState<MarketplaceId>('amazon.com');
  const [adsStartDate, setAdsStartDate] = useState('');
  const [adsEndDate, setAdsEndDate] = useState('');
  const [awdMarketplace, setAwdMarketplace] = useState<MarketplaceId>('amazon.com');

  const { data: connection, isLoading: connectionLoading } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 30 * 1000,
  });

  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ['audit-data-uploads'],
    queryFn: fetchAuditUploads,
    enabled: connection !== undefined && connection.connected === true,
    staleTime: 10 * 1000,
  });

  const { data: adsData, isLoading: adsLoading } = useQuery({
    queryKey: ['ads-data-uploads'],
    queryFn: fetchAdsUploads,
    enabled: connection !== undefined && connection.connected === true,
    staleTime: 10 * 1000,
  });

  const { data: awdData, isLoading: awdLoading } = useQuery({
    queryKey: ['awd-data-uploads'],
    queryFn: fetchAwdUploads,
    enabled: connection !== undefined && connection.connected === true,
    staleTime: 10 * 1000,
  });

  async function uploadAudit() {
    const input = auditInputRef.current;
    const file = input?.files?.[0];
    if (!file) {
      setAuditMessage('Choose an Audit Data file first.');
      return;
    }
    setIsUploadingAudit(true);
    setAuditMessage(null);
    try {
      const formData = new FormData();
      formData.set('file', file);
      const response = await fetch(`${basePath}/api/plutus/audit-data/upload`, {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) {
        setAuditMessage(readApiError(payload, 'Audit upload failed.'));
        return;
      }
      setAuditMessage(`Uploaded ${file.name}`);
      input.value = '';
      await queryClient.invalidateQueries({ queryKey: ['audit-data-uploads'] });
    } catch (error) {
      setAuditMessage(error instanceof Error ? error.message : 'Audit upload failed.');
    } finally {
      setIsUploadingAudit(false);
    }
  }

  async function uploadAds() {
    const input = adsInputRef.current;
    const file = input?.files?.[0];
    if (!file) {
      setAdsMessage('Choose an Ads report file first.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(adsStartDate) || !/^\d{4}-\d{2}-\d{2}$/.test(adsEndDate) || adsStartDate > adsEndDate) {
      setAdsMessage('Set valid start/end dates (YYYY-MM-DD).');
      return;
    }

    setIsUploadingAds(true);
    setAdsMessage(null);
    try {
      const formData = new FormData();
      formData.set('file', file);
      formData.set('marketplace', adsMarketplace);
      formData.set('startDate', adsStartDate);
      formData.set('endDate', adsEndDate);
      const response = await fetch(`${basePath}/api/plutus/ads-data/upload`, {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) {
        setAdsMessage(readApiError(payload, 'Ads upload failed.'));
        return;
      }
      setAdsMessage(`Uploaded ${file.name}`);
      input.value = '';
      await queryClient.invalidateQueries({ queryKey: ['ads-data-uploads'] });
    } catch (error) {
      setAdsMessage(error instanceof Error ? error.message : 'Ads upload failed.');
    } finally {
      setIsUploadingAds(false);
    }
  }

  async function uploadAwd() {
    const input = awdInputRef.current;
    const file = input?.files?.[0];
    if (!file) {
      setAwdMessage('Choose an AWD fee report file first.');
      return;
    }

    setIsUploadingAwd(true);
    setAwdMessage(null);
    try {
      const formData = new FormData();
      formData.set('file', file);
      formData.set('marketplace', awdMarketplace);
      const response = await fetch(`${basePath}/api/plutus/awd-data/upload`, {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) {
        setAwdMessage(readApiError(payload, 'AWD upload failed.'));
        return;
      }
      setAwdMessage(`Uploaded ${file.name}`);
      input.value = '';
      await queryClient.invalidateQueries({ queryKey: ['awd-data-uploads'] });
    } catch (error) {
      setAwdMessage(error instanceof Error ? error.message : 'AWD upload failed.');
    } finally {
      setIsUploadingAwd(false);
    }
  }

  if (connectionLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  if (connection?.connected === false) {
    return <NotConnectedScreen title="Data Sources" error={connection.error} />;
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <PageHeader
        title="Data Sources"
        description="Upload settlement source reports in one place. Fee allocations use uploaded report data, not unit-based splits."
      />

      <Box sx={{ display: 'grid', gap: 2, mt: 2 }}>
        <Card>
          <CardContent sx={{ display: 'grid', gap: 1.5 }}>
            <Typography sx={{ fontWeight: 600 }}>LMB Audit Data</Typography>
            <input ref={auditInputRef} type="file" accept=".csv,.zip" />
            <Button variant="contained" onClick={uploadAudit} disabled={isUploadingAudit}>
              {isUploadingAudit ? 'Uploading...' : 'Upload Audit Data'}
            </Button>
            {auditMessage && <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>{auditMessage}</Typography>}
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              Latest uploads: {auditLoading ? 'Loading...' : (auditData?.uploads.length ?? 0)}
            </Typography>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ display: 'grid', gap: 1.5 }}>
            <Typography sx={{ fontWeight: 600 }}>Amazon Ads Report</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '220px 1fr 1fr' }, gap: 1 }}>
              <FormControl size="small">
                <InputLabel>Marketplace</InputLabel>
                <Select
                  label="Marketplace"
                  value={adsMarketplace}
                  onChange={(event) => setAdsMarketplace(event.target.value as MarketplaceId)}
                >
                  <MenuItem value="amazon.com">US</MenuItem>
                  <MenuItem value="amazon.co.uk">UK</MenuItem>
                </Select>
              </FormControl>
              <TextField size="small" label="Start Date" placeholder="YYYY-MM-DD" value={adsStartDate} onChange={(event) => setAdsStartDate(event.target.value)} />
              <TextField size="small" label="End Date" placeholder="YYYY-MM-DD" value={adsEndDate} onChange={(event) => setAdsEndDate(event.target.value)} />
            </Box>
            <input ref={adsInputRef} type="file" accept=".csv,.zip,.xlsx" />
            <Button variant="contained" onClick={uploadAds} disabled={isUploadingAds}>
              {isUploadingAds ? 'Uploading...' : 'Upload Ads Report'}
            </Button>
            {adsMessage && <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>{adsMessage}</Typography>}
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              Latest uploads: {adsLoading ? 'Loading...' : (adsData?.uploads.length ?? 0)}
            </Typography>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ display: 'grid', gap: 1.5 }}>
            <Typography sx={{ fontWeight: 600 }}>AWD Monthly Fee Report</Typography>
            <FormControl size="small" sx={{ maxWidth: 220 }}>
              <InputLabel>Marketplace</InputLabel>
              <Select
                label="Marketplace"
                value={awdMarketplace}
                onChange={(event) => setAwdMarketplace(event.target.value as MarketplaceId)}
              >
                <MenuItem value="amazon.com">US</MenuItem>
                <MenuItem value="amazon.co.uk">UK</MenuItem>
              </Select>
            </FormControl>
            <input ref={awdInputRef} type="file" accept=".csv,.zip,.xlsx" />
            <Button variant="contained" onClick={uploadAwd} disabled={isUploadingAwd}>
              {isUploadingAwd ? 'Uploading...' : 'Upload AWD Report'}
            </Button>
            {awdMessage && <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>{awdMessage}</Typography>}
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              Latest uploads: {awdLoading ? 'Loading...' : (awdData?.uploads.length ?? 0)}
            </Typography>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography sx={{ fontWeight: 600, mb: 1 }}>Recent Uploads</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Marketplace</TableCell>
                  <TableCell>File</TableCell>
                  <TableCell>Range</TableCell>
                  <TableCell align="right">Rows</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {auditData?.uploads.slice(0, 3).map((upload) => (
                  <TableRow key={upload.id}>
                    <TableCell>Audit</TableCell>
                    <TableCell>Mixed</TableCell>
                    <TableCell>{upload.filename}</TableCell>
                    <TableCell>-</TableCell>
                    <TableCell align="right">{upload.rowCount.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {adsData?.uploads.slice(0, 3).map((upload) => (
                  <TableRow key={upload.id}>
                    <TableCell>Ads</TableCell>
                    <TableCell>{marketLabel(upload.marketplace)}</TableCell>
                    <TableCell>{upload.filename}</TableCell>
                    <TableCell>
                      {upload.startDate} - {upload.endDate}
                    </TableCell>
                    <TableCell align="right">{upload.rowCount.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {awdData?.uploads.slice(0, 3).map((upload) => (
                  <TableRow key={upload.id}>
                    <TableCell>AWD</TableCell>
                    <TableCell>{marketLabel(upload.marketplace)}</TableCell>
                    <TableCell>{upload.filename}</TableCell>
                    <TableCell>
                      {upload.startDate} - {upload.endDate}
                    </TableCell>
                    <TableCell align="right">{upload.rowCount.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!auditLoading && !adsLoading && !awdLoading && (auditData?.uploads.length ?? 0) + (adsData?.uploads.length ?? 0) + (awdData?.uploads.length ?? 0) === 0 ? (
              <EmptyState title="No uploads yet" description="Upload Audit, Ads, or AWD reports to start deterministic fee allocations." />
            ) : null}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
