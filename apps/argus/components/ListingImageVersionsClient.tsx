'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { withAppBasePath } from '@/lib/base-path';
import { formatRelativeTime, cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowDown,
  ArrowUp,
  Download,
  ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { evaluateListingImageCompliance, type ListingImageSlotMetrics } from '@/lib/listing-images/compliance';

export type ImageVersionListItem = {
  id: string;
  versionNumber: number;
  label: string | null;
  notes: string | null;
  createdAt: string;
  createdByEmail: string | null;
  imageCount: number;
  isActive: boolean;
};

type VersionDetail = {
  version: {
    id: string;
    targetId: string;
    versionNumber: number;
    label: string | null;
    notes: string | null;
    createdAt: string;
    isActive: boolean;
  };
  images: Array<{
    position: number;
    fileName: string;
    sha256: string;
    contentType: string;
    byteSize: number;
    width: number;
    height: number;
    url: string;
  }>;
};

type DraftSlot = {
  key: string;
  fileName: string;
  sha256: string | null;
  contentType: string | null;
  byteSize: number | null;
  width: number | null;
  height: number | null;
  s3PreviewUrl: string | null;
  localPreviewUrl: string | null;
  file: File | null;
};

function initialSelectedVersionId(input: {
  activeId: string | null;
  versions: ImageVersionListItem[];
}): string | null {
  if (input.activeId) return input.activeId;
  if (input.versions.length > 0) return input.versions[0]!.id;
  return null;
}

function bytesToSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(1)} KB`;
}

function aspectRatio(width: number, height: number): string {
  if (height === 0) return '';
  const ratio = width / height;
  return ratio.toFixed(2);
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return hex;
}

async function computeFileMeta(file: File): Promise<{
  sha256: string;
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
}> {
  const contentType = file.type;
  if (contentType !== 'image/jpeg' && contentType !== 'image/png' && contentType !== 'image/webp') {
    throw new Error('Unsupported file type. Use JPG, PNG, or WEBP.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const sha = await sha256Hex(arrayBuffer);

  const bitmap = await createImageBitmap(file);
  const width = bitmap.width;
  const height = bitmap.height;
  bitmap.close();

  return {
    sha256: sha,
    contentType,
    byteSize: file.size,
    width,
    height,
  };
}

export function ListingImageVersionsClient(props: {
  targetId: string;
  targetLabel: string;
  asin: string | null;
  marketplace: string;
  owner: string;
  initialActiveImageVersionId: string | null;
  initialVersions: ImageVersionListItem[];
}) {
  const [versions, setVersions] = useState<ImageVersionListItem[]>(props.initialVersions);
  const [activeId, setActiveId] = useState<string | null>(props.initialActiveImageVersionId);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedVersionId({ activeId: props.initialActiveImageVersionId, versions: props.initialVersions }),
  );

  const [selectedDetails, setSelectedDetails] = useState<VersionDetail | null>(null);
  const [activeDetails, setActiveDetails] = useState<VersionDetail | null>(null);

  const [loadingSelected, setLoadingSelected] = useState(false);
  const [loadingActive, setLoadingActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftSlots, setDraftSlots] = useState<DraftSlot[]>([]);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftBusyKey, setDraftBusyKey] = useState<string | null>(null);
  const [draftPrefilling, setDraftPrefilling] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);

  const addFileInputRef = useRef<HTMLInputElement | null>(null);

  const canEdit = props.owner === 'OURS';

  async function refreshList() {
    setError(null);
    const res = await fetch(withAppBasePath(`/api/targets/${props.targetId}/image-versions`));
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `Request failed (${res.status})`);
    }
    const json = await res.json();
    const nextVersions = (json.versions as ImageVersionListItem[]) ?? [];
    const nextActive = (json.activeImageVersionId as string | null) ?? null;
    setVersions(nextVersions);
    setActiveId(nextActive);

    setSelectedId((prev) => {
      if (prev) return prev;
      return initialSelectedVersionId({ activeId: nextActive, versions: nextVersions });
    });
  }

  useEffect(() => {
    if (!canEdit) return;
    refreshList().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.targetId]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedDetails(null);
      return;
    }
    let cancelled = false;
    setLoadingSelected(true);
    setError(null);
    fetch(withAppBasePath(`/api/image-versions/${selectedId}`))
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Request failed (${res.status})`);
        }
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        setSelectedDetails(json as VersionDetail);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingSelected(false));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!activeId) {
      setActiveDetails(null);
      return;
    }
    if (activeId === selectedId && selectedDetails) {
      setActiveDetails(selectedDetails);
      return;
    }

    let cancelled = false;
    setLoadingActive(true);
    setError(null);
    fetch(withAppBasePath(`/api/image-versions/${activeId}`))
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Request failed (${res.status})`);
        }
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        setActiveDetails(json as VersionDetail);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingActive(false));
    return () => {
      cancelled = true;
    };
  }, [activeId, selectedId, selectedDetails]);

  async function openNewVersionModal() {
    setDraftError(null);
    setDraftLabel('');
    setDraftNotes('');

    setDraftPrefilling(true);

    const baseSlots: DraftSlot[] = [];
    try {
      let base: VersionDetail | null = activeDetails;
      if (!base && activeId) {
        const res = await fetch(withAppBasePath(`/api/image-versions/${activeId}`));
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Request failed (${res.status})`);
        }
        base = (await res.json()) as VersionDetail;
        setActiveDetails(base);
      }

      if (base) {
        for (const img of base.images) {
          baseSlots.push({
            key: `slot-${img.position}-${img.sha256}`,
            fileName: img.fileName,
            sha256: img.sha256,
            contentType: img.contentType,
            byteSize: img.byteSize,
            width: img.width,
            height: img.height,
            s3PreviewUrl: img.url,
            localPreviewUrl: null,
            file: null,
          });
        }
      }

      setDraftSlots(baseSlots);
      setModalOpen(true);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : String(e));
      setDraftSlots([]);
      setModalOpen(true);
    } finally {
      setDraftPrefilling(false);
    }
  }

  function closeNewVersionModal() {
    for (const slot of draftSlots) {
      if (slot.localPreviewUrl) {
        URL.revokeObjectURL(slot.localPreviewUrl);
      }
    }
    setModalOpen(false);
  }

  function moveSlot(from: number, to: number) {
    setDraftSlots((prev) => {
      if (to < 0) return prev;
      if (to >= prev.length) return prev;
      const next = prev.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  function removeSlot(index: number) {
    setDraftSlots((prev) => {
      const next = prev.slice();
      const removed = next.splice(index, 1)[0];
      if (removed && removed.localPreviewUrl) {
        URL.revokeObjectURL(removed.localPreviewUrl);
      }
      return next;
    });
  }

  async function replaceSlotFile(slotKey: string, file: File) {
    setDraftError(null);
    setDraftBusyKey(slotKey);
    try {
      const meta = await computeFileMeta(file);
      const previewUrl = URL.createObjectURL(file);
      setDraftSlots((prev) =>
        prev.map((s) => {
          if (s.key !== slotKey) return s;
          if (s.localPreviewUrl) {
            URL.revokeObjectURL(s.localPreviewUrl);
          }
          return {
            ...s,
            fileName: file.name,
            sha256: meta.sha256,
            contentType: meta.contentType,
            byteSize: meta.byteSize,
            width: meta.width,
            height: meta.height,
            localPreviewUrl: previewUrl,
            file,
          };
        }),
      );
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : String(e));
    } finally {
      setDraftBusyKey(null);
    }
  }

  async function addNewSlotFromFile(file: File) {
    setDraftError(null);
    setDraftBusyKey('add');
    try {
      const meta = await computeFileMeta(file);
      const previewUrl = URL.createObjectURL(file);
      setDraftSlots((prev) => [
        ...prev,
        {
          key: `new-${Date.now()}-${meta.sha256}`,
          fileName: file.name,
          sha256: meta.sha256,
          contentType: meta.contentType,
          byteSize: meta.byteSize,
          width: meta.width,
          height: meta.height,
          s3PreviewUrl: null,
          localPreviewUrl: previewUrl,
          file,
        },
      ]);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : String(e));
    } finally {
      setDraftBusyKey(null);
    }
  }

  const draftMetrics: ListingImageSlotMetrics[] = useMemo(() => {
    const list: ListingImageSlotMetrics[] = [];
    for (let i = 0; i < draftSlots.length; i++) {
      const s = draftSlots[i]!;
      if (s.byteSize === null) continue;
      if (s.width === null) continue;
      if (s.height === null) continue;
      list.push({ position: i + 1, byteSize: s.byteSize, width: s.width, height: s.height });
    }
    return list;
  }, [draftSlots]);

  const compliance = useMemo(() => evaluateListingImageCompliance(draftMetrics), [draftMetrics]);
  const slotComplianceByPosition = useMemo(() => {
    const map = new Map<number, { errors: string[]; warnings: string[] }>();
    for (const entry of compliance.slots) {
      map.set(entry.position, { errors: entry.errors, warnings: entry.warnings });
    }
    return map;
  }, [compliance.slots]);

  async function saveNewVersion() {
    setDraftError(null);
    setDraftSaving(true);
    try {
      if (draftSlots.length === 0) {
        throw new Error('Add at least 1 image.');
      }
      if (draftSlots.length > 9) {
        throw new Error('Max 9 images per version.');
      }

      for (const setError of compliance.setErrors) {
        throw new Error(setError);
      }

      const missing: number[] = [];
      for (let i = 0; i < draftSlots.length; i++) {
        const slot = draftSlots[i]!;
        if (!slot.sha256 || !slot.contentType || slot.byteSize === null || slot.width === null || slot.height === null) {
          missing.push(i + 1);
        }
      }
      if (missing.length > 0) {
        throw new Error(`Missing file metadata for slot(s): ${missing.join(', ')}`);
      }

      for (let i = 0; i < draftSlots.length; i++) {
        const issues = slotComplianceByPosition.get(i + 1);
        if (issues && issues.errors.length > 0) {
          throw new Error(`Slot ${i + 1}: ${issues.errors[0]}`);
        }
      }

      const uniqueBlobs = new Map<
        string,
        { sha256: string; contentType: string; byteSize: number; width: number; height: number; file: File | null }
      >();

      for (const slot of draftSlots) {
        const sha = slot.sha256!;
        if (!uniqueBlobs.has(sha)) {
          uniqueBlobs.set(sha, {
            sha256: sha,
            contentType: slot.contentType!,
            byteSize: slot.byteSize!,
            width: slot.width!,
            height: slot.height!,
            file: slot.file,
          });
        }
      }

      const presignRes = await fetch(withAppBasePath(`/api/targets/${props.targetId}/image-blobs/presign`), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          files: Array.from(uniqueBlobs.values()).map((b) => ({
            sha256: b.sha256,
            contentType: b.contentType,
            byteSize: b.byteSize,
          })),
        }),
      });
      if (!presignRes.ok) {
        const body = await presignRes.json().catch(() => null);
        throw new Error(body?.error ?? `Presign failed (${presignRes.status})`);
      }
      const presignJson = await presignRes.json();
      const presigned = presignJson.blobs as Array<{ sha256: string; exists: boolean; s3Key: string; putUrl?: string }>;
      const presignMap = new Map(presigned.map((b) => [b.sha256, b]));

      for (const b of uniqueBlobs.values()) {
        const presignedBlob = presignMap.get(b.sha256);
        if (!presignedBlob) {
          throw new Error(`Presign response missing sha ${b.sha256}`);
        }
        if (!presignedBlob.exists) {
          if (!presignedBlob.putUrl) {
            throw new Error(`Missing upload URL for ${b.sha256}`);
          }
          if (!b.file) {
            throw new Error(`Missing file for upload ${b.sha256}`);
          }
          const putRes = await fetch(presignedBlob.putUrl, {
            method: 'PUT',
            headers: { 'content-type': b.contentType },
            body: b.file,
          });
          if (!putRes.ok) {
            throw new Error(`Upload failed for ${b.sha256} (${putRes.status})`);
          }
        }
      }

      const createRes = await fetch(withAppBasePath(`/api/targets/${props.targetId}/image-versions`), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          label: draftLabel.trim() ? draftLabel.trim() : undefined,
          notes: draftNotes.trim() ? draftNotes.trim() : undefined,
          blobs: Array.from(uniqueBlobs.values()).map((b) => {
            const p = presignMap.get(b.sha256)!;
            return {
              sha256: b.sha256,
              s3Key: p.s3Key,
              contentType: b.contentType,
              byteSize: b.byteSize,
              width: b.width,
              height: b.height,
            };
          }),
          images: draftSlots.map((s) => ({
            sha256: s.sha256!,
            fileName: s.fileName,
          })),
        }),
      });
      if (!createRes.ok) {
        const body = await createRes.json().catch(() => null);
        throw new Error(body?.error ?? `Create version failed (${createRes.status})`);
      }
      const createJson = await createRes.json();
      const newVersionId = createJson.versionId as string | undefined;
      if (!newVersionId) {
        throw new Error('Malformed response');
      }

      await refreshList();
      setSelectedId(newVersionId);
      closeNewVersionModal();
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : String(e));
    } finally {
      setDraftSaving(false);
    }
  }

  async function setActiveSelected() {
    if (!selectedId) return;
    setError(null);
    const res = await fetch(withAppBasePath(`/api/image-versions/${selectedId}/activate`), { method: 'POST' });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `Request failed (${res.status})`);
    }
    await refreshList();
  }

  function downloadSelectedZip() {
    if (!selectedId) return;
    const url = withAppBasePath(`/api/image-versions/${selectedId}/download`);
    window.open(url, '_blank', 'noreferrer');
  }

  if (!canEdit) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Image Version History</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">
            Image version history is available for <strong>OURS</strong> listings only.
          </p>
        </CardContent>
      </Card>
    );
  }

  const selectedItem = versions.find((v) => v.id === selectedId) ?? null;
  const selectedIsActive = Boolean(selectedItem && selectedItem.isActive);

  const activeByPosition = new Map<number, VersionDetail['images'][number]>();
  if (activeDetails) {
    for (const img of activeDetails.images) {
      activeByPosition.set(img.position, img);
    }
  }

  const selectedCompliance = selectedDetails
    ? evaluateListingImageCompliance(
        selectedDetails.images.map((img) => ({
          position: img.position,
          byteSize: img.byteSize,
          width: img.width,
          height: img.height,
        })),
      )
    : null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <Card className="lg:col-span-4">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold">Versions</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refreshList().catch((e) => setError(e instanceof Error ? e.message : String(e)))}
              >
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() => openNewVersionModal().catch((e) => setDraftError(e instanceof Error ? e.message : String(e)))}
                disabled={draftSaving || draftPrefilling}
              >
                {draftPrefilling ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
                New
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {error && <div className="mb-3 text-sm text-danger-600">{error}</div>}

          {versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <ImageIcon className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No versions yet.</p>
              <Button
                size="sm"
                className="mt-3"
                onClick={() => openNewVersionModal().catch((e) => setDraftError(e instanceof Error ? e.message : String(e)))}
                disabled={draftSaving || draftPrefilling}
              >
                {draftPrefilling ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
                Create first version
              </Button>
            </div>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                Select a version to preview, download, or set active. New versions become active automatically.
              </p>
              <ScrollArea className="h-[520px] pr-2">
                <div className="space-y-2">
                {versions.map((v) => {
                  const active = selectedId === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedId(v.id)}
                      className={cn(
                        'w-full rounded-lg border p-3 text-left transition-colors',
                        active ? 'border-primary bg-primary/5' : 'hover:bg-muted/40',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">v{v.versionNumber}</span>
                            {v.isActive && (
                              <Badge variant="success" className="text-2xs">
                                Active
                              </Badge>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {v.label ? v.label : `Uploaded ${formatRelativeTime(v.createdAt)}`}
                          </p>
                        </div>
                        <div className="shrink-0 text-right text-2xs text-muted-foreground">
                          <div>{formatRelativeTime(v.createdAt)}</div>
                          <div>{v.imageCount} img</div>
                        </div>
                      </div>
                      {v.notes && (
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{v.notes}</p>
                      )}
                    </button>
                  );
                })}
                </div>
              </ScrollArea>
            </>
          )}
        </CardContent>
      </Card>

      <div className="lg:col-span-8 space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="text-sm font-semibold">Selected Version</CardTitle>
                {!selectedItem ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">Select a version on the left.</p>
                ) : (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    v{selectedItem.versionNumber}
                    {selectedItem.label ? ` · ${selectedItem.label}` : ''}
                    {selectedItem.createdByEmail ? ` · ${selectedItem.createdByEmail}` : ''}
                    {` · ${formatRelativeTime(selectedItem.createdAt)}`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveSelected().catch((e) => setError(e instanceof Error ? e.message : String(e)))}
                  disabled={!selectedId || selectedIsActive}
                >
                  Set as active
                </Button>
                <Button variant="outline" size="sm" onClick={downloadSelectedZip} disabled={!selectedId}>
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Download ZIP
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loadingSelected && (
              <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading
              </div>
            )}

            {!selectedId ? (
              <p className="text-sm text-muted-foreground">Select a version to preview, download, or revert.</p>
            ) : !selectedDetails ? (
              <p className="text-sm text-muted-foreground">No data.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Setting active only updates Argus. It does not push changes to Amazon.
                </p>

                {selectedCompliance && selectedCompliance.setWarnings.length > 0 && (
                  <div className="rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-800">
                    {selectedCompliance.setWarnings.join(' ')}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {selectedDetails.images.map((img) => (
                    <a
                      key={`${img.sha256}-${img.position}`}
                      href={img.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border overflow-hidden bg-card hover:bg-muted/20"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt={img.fileName} className="h-28 w-full object-cover" />
                      <div className="p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-2xs font-medium">#{img.position}</span>
                          <span className="text-2xs text-muted-foreground">{bytesToSize(img.byteSize)}</span>
                        </div>
                        <p className="mt-0.5 truncate text-2xs text-muted-foreground">
                          {img.width}x{img.height} ({aspectRatio(img.width, img.height)})
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={modalOpen} onOpenChange={(open) => (open ? setModalOpen(true) : closeNewVersionModal())}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>New Image Version</DialogTitle>
            <DialogDescription>
              Upload a full ordered image set (max 9). New versions become active automatically.
            </DialogDescription>
          </DialogHeader>

          {draftError && <div className="text-sm text-danger-600">{draftError}</div>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Label (optional)</Label>
              <Input value={draftLabel} onChange={(e) => setDraftLabel(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Input value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">Images</p>
                <Badge variant="outline" className="text-2xs">{draftSlots.length}/9</Badge>
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={addFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                    e.target.value = '';
                    if (!file) return;
                    if (draftSlots.length >= 9) return;
                    addNewSlotFromFile(file).catch(() => null);
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (draftSlots.length >= 9) return;
                    const el = addFileInputRef.current;
                    if (!el) return;
                    el.click();
                  }}
                  disabled={draftBusyKey === 'add' || draftSlots.length >= 9}
                >
                  {draftBusyKey === 'add' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
                  Add image
                </Button>
              </div>
            </div>

            {compliance.setWarnings.length > 0 && (
              <div className="rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-800">
                {compliance.setWarnings.join(' ')}
              </div>
            )}
            {compliance.setErrors.length > 0 && (
              <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-800">
                {compliance.setErrors.join(' ')}
              </div>
            )}

            {draftSlots.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Add up to 9 images to create a version snapshot.
              </div>
            ) : (
              <div className="space-y-2">
                {draftSlots.map((slot, idx) => {
                  const position = idx + 1;
                  const issues = slotComplianceByPosition.get(position);
                  const preview = slot.localPreviewUrl ? slot.localPreviewUrl : slot.s3PreviewUrl;
                  const busy = draftBusyKey === slot.key;
                  const replaceInputId = `replace-${slot.key}`;
                  return (
                    <div key={slot.key} className="flex items-start gap-3 rounded-lg border p-3">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted">
                        {preview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={preview} alt={slot.fileName} className="h-16 w-16 object-cover" />
                        ) : (
                          <div className="flex h-16 w-16 items-center justify-center text-muted-foreground">
                            <ImageIcon className="h-5 w-5" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">Slot {position}{position === 1 ? ' (main)' : ''}</p>
                            <p className="truncate text-xs text-muted-foreground">{slot.fileName}</p>
                            {slot.width !== null && slot.height !== null && slot.byteSize !== null && (
                              <p className="mt-0.5 text-2xs text-muted-foreground">
                                {slot.width}x{slot.height} ({aspectRatio(slot.width, slot.height)}) · {bytesToSize(slot.byteSize)}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => moveSlot(idx, idx - 1)}
                              disabled={idx === 0}
                              aria-label="Move up"
                            >
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => moveSlot(idx, idx + 1)}
                              disabled={idx === draftSlots.length - 1}
                              aria-label="Move down"
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => removeSlot(idx)}
                              aria-label="Remove"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <input
                            id={replaceInputId}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                              e.target.value = '';
                              if (!f) return;
                              replaceSlotFile(slot.key, f).catch(() => null);
                            }}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const input = document.getElementById(replaceInputId) as HTMLInputElement | null;
                              if (!input) return;
                              input.click();
                            }}
                          >
                            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                            Replace
                          </Button>

                          {issues && issues.warnings.length > 0 && (
                            <span className="text-2xs text-warning-700">
                              {issues.warnings.join(' ')}
                            </span>
                          )}
                          {issues && issues.errors.length > 0 && (
                            <span className="text-2xs text-danger-700">
                              {issues.errors.join(' ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeNewVersionModal} disabled={draftSaving}>
              Cancel
            </Button>
            <Button onClick={saveNewVersion} disabled={draftSaving || draftBusyKey !== null}>
              {draftSaving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Create version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
