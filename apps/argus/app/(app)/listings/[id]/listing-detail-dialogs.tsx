'use client'

import {
  Alert,
  Box,
  Button as MuiButton,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import {
  SNAPSHOT_ZIP_MAX_UPLOAD_BYTES,
  formatBytes,
  type BulletsDraft,
  type EbcModuleDraft,
  type EbcModuleEditorTarget,
  type ListingSummary,
  type PriceDraft,
} from './listing-detail-shared'

interface ListingDetailHeaderProps {
  listing: ListingSummary | null
  onOpenSnapshotIngest: () => void
  onOpenReset: () => void
}

interface ListingDetailDialogsProps {
  listing: ListingSummary | null
  snapshotIngestOpen: boolean
  snapshotIngestBusy: boolean
  snapshotIngestError: string | null
  snapshotIngestFile: File | null
  onSnapshotIngestClose: () => void
  onSnapshotIngestFileChange: (file: File | null) => void
  onSnapshotIngestSubmit: () => void | Promise<void>
  titleEditorOpen: boolean
  titleDraft: string
  onTitleEditorClose: () => void
  onTitleDraftChange: (value: string) => void
  onTitleSubmit: () => void | Promise<void>
  bulletsEditorOpen: boolean
  bulletsDraft: BulletsDraft
  onBulletsEditorClose: () => void
  onBulletsDraftChange: (key: keyof BulletsDraft, value: string) => void
  onBulletsSubmit: () => void | Promise<void>
  priceEditorOpen: boolean
  priceDraft: PriceDraft
  onPriceEditorClose: () => void
  onPriceDraftChange: (key: keyof PriceDraft, value: string) => void
  onPriceSubmit: () => void | Promise<void>
  galleryUploaderOpen: boolean
  galleryFiles: File[]
  onGalleryUploaderClose: () => void
  onGalleryFilesChange: (files: File[]) => void
  onGallerySubmit: () => void | Promise<void>
  videoUploaderOpen: boolean
  videoFile: File | null
  videoPosterFile: File | null
  onVideoUploaderClose: () => void
  onVideoFileChange: (file: File | null) => void
  onVideoPosterFileChange: (file: File | null) => void
  onVideoSubmit: () => void | Promise<void>
  ebcModuleEditorOpen: boolean
  ebcModuleEditorTarget: EbcModuleEditorTarget | null
  ebcModuleDraft: EbcModuleDraft
  ebcModuleFiles: File[]
  onEbcModuleEditorClose: () => void
  onEbcModuleDraftChange: (key: keyof EbcModuleDraft, value: string) => void
  onEbcModuleFilesChange: (files: File[]) => void
  onEbcModuleSubmit: () => void | Promise<void>
  resetDialogOpen: boolean
  resetBusy: boolean
  resetError: string | null
  onResetDialogClose: () => void
  onResetSubmit: () => void | Promise<void>
}

const dialogSlotProps = {
  paper: {
    sx: {
      borderRadius: 3,
      border: '1px solid',
      borderColor: 'divider',
      boxShadow: '0 24px 80px rgba(15, 23, 42, 0.28)',
    },
  },
  backdrop: {
    sx: {
      backdropFilter: 'blur(2px)',
      backgroundColor: 'rgba(15, 23, 42, 0.45)',
    },
  },
} as const

function ListingChip({ listing }: { listing: ListingSummary }) {
  return (
    <Chip
      label={`ASIN ${listing.asin}`}
      size="small"
      color="primary"
      variant="outlined"
      sx={{ fontWeight: 600 }}
    />
  )
}

export function ListingDetailHeader({
  listing,
  onOpenSnapshotIngest,
  onOpenReset,
}: ListingDetailHeaderProps) {
  if (!listing) {
    return null
  }

  return (
    <Box
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        px: 2.5,
        py: 1.25,
        bgcolor: 'rgba(255, 255, 255, 0.92)',
        borderBottom: '1px solid rgba(15, 23, 42, 0.12)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
        <Stack spacing={0.2} sx={{ minWidth: 0 }}>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 800, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}
          >
            {listing.asin}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: { xs: 240, sm: 520, md: 760 },
            }}
          >
            {listing.label}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <MuiButton type="button" size="small" variant="outlined" onClick={onOpenSnapshotIngest}>
            Ingest snapshot zip
          </MuiButton>
          <MuiButton type="button" size="small" variant="outlined" color="error" onClick={onOpenReset}>
            Reset listing
          </MuiButton>
        </Stack>
      </Stack>
    </Box>
  )
}

export function ListingDetailDialogs({
  listing,
  snapshotIngestOpen,
  snapshotIngestBusy,
  snapshotIngestError,
  snapshotIngestFile,
  onSnapshotIngestClose,
  onSnapshotIngestFileChange,
  onSnapshotIngestSubmit,
  titleEditorOpen,
  titleDraft,
  onTitleEditorClose,
  onTitleDraftChange,
  onTitleSubmit,
  bulletsEditorOpen,
  bulletsDraft,
  onBulletsEditorClose,
  onBulletsDraftChange,
  onBulletsSubmit,
  priceEditorOpen,
  priceDraft,
  onPriceEditorClose,
  onPriceDraftChange,
  onPriceSubmit,
  galleryUploaderOpen,
  galleryFiles,
  onGalleryUploaderClose,
  onGalleryFilesChange,
  onGallerySubmit,
  videoUploaderOpen,
  videoFile,
  videoPosterFile,
  onVideoUploaderClose,
  onVideoFileChange,
  onVideoPosterFileChange,
  onVideoSubmit,
  ebcModuleEditorOpen,
  ebcModuleEditorTarget,
  ebcModuleDraft,
  ebcModuleFiles,
  onEbcModuleEditorClose,
  onEbcModuleDraftChange,
  onEbcModuleFilesChange,
  onEbcModuleSubmit,
  resetDialogOpen,
  resetBusy,
  resetError,
  onResetDialogClose,
  onResetSubmit,
}: ListingDetailDialogsProps) {
  return (
    <>
      {snapshotIngestOpen && listing ? (
        <Dialog
          open={snapshotIngestOpen}
          onClose={() => {
            if (snapshotIngestBusy) return
            onSnapshotIngestClose()
          }}
          fullWidth
          maxWidth="sm"
          slotProps={dialogSlotProps}
        >
          <DialogTitle sx={{ pb: 1.5 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
              <Box>
                <Typography variant="h6" sx={{ fontSize: '1.125rem', fontWeight: 700 }}>
                  Ingest snapshot zip
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Chrome → Save Page As → Webpage, Complete. Zip the HTML + the assets folder.
                </Typography>
              </Box>
              <ListingChip listing={listing} />
            </Stack>
          </DialogTitle>
          <DialogContent dividers sx={{ py: 2.5 }}>
            <Stack spacing={1.5}>
              <Stack spacing={1}>
                <MuiButton component="label" variant="outlined" sx={{ alignSelf: 'flex-start', fontWeight: 600 }}>
                  Choose zip
                  <input
                    hidden
                    type="file"
                    accept=".zip,application/zip"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null
                      onSnapshotIngestFileChange(file)
                    }}
                  />
                </MuiButton>
                <Typography
                  variant="caption"
                  sx={{ fontFamily: 'var(--font-mono)', color: snapshotIngestFile ? 'text.primary' : 'text.secondary' }}
                >
                  {snapshotIngestFile
                    ? `${snapshotIngestFile.name} (${formatBytes(snapshotIngestFile.size)})`
                    : `Max zip size: ${formatBytes(SNAPSHOT_ZIP_MAX_UPLOAD_BYTES)}`}
                </Typography>
              </Stack>

              {snapshotIngestError ? (
                <Typography variant="caption" color="error">
                  {snapshotIngestError}
                </Typography>
              ) : null}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
            <MuiButton type="button" variant="text" color="inherit" disabled={snapshotIngestBusy} onClick={onSnapshotIngestClose}>
              Cancel
            </MuiButton>
            <MuiButton
              type="button"
              variant="contained"
              disabled={!snapshotIngestFile || snapshotIngestBusy}
              sx={{ px: 2.5, fontWeight: 600 }}
              onClick={() => {
                void onSnapshotIngestSubmit()
              }}
            >
              {snapshotIngestBusy ? 'Ingesting...' : 'Ingest'}
            </MuiButton>
          </DialogActions>
        </Dialog>
      ) : null}

      {titleEditorOpen && listing ? (
        <Dialog open={titleEditorOpen} onClose={onTitleEditorClose} fullWidth maxWidth="md" slotProps={dialogSlotProps}>
          <DialogTitle sx={{ pb: 1.5 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
              <Box>
                <Typography variant="h6" sx={{ fontSize: '1.125rem', fontWeight: 700 }}>
                  New title version
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Write a concise, keyword-rich title for better search rank.
                </Typography>
              </Box>
              <ListingChip listing={listing} />
            </Stack>
          </DialogTitle>
          <DialogContent dividers sx={{ py: 2.5 }}>
            <TextField
              value={titleDraft}
              onChange={(event) => onTitleDraftChange(event.target.value)}
              multiline
              minRows={4}
              maxRows={8}
              fullWidth
              placeholder="Enter a new title..."
              sx={{
                '& .MuiInputBase-root': {
                  alignItems: 'flex-start',
                  fontSize: 14,
                  lineHeight: 1.45,
                  borderRadius: 2,
                },
              }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
            <MuiButton type="button" variant="text" color="inherit" onClick={onTitleEditorClose}>
              Cancel
            </MuiButton>
            <MuiButton
              type="button"
              variant="contained"
              disabled={titleDraft.trim().length === 0}
              sx={{ px: 2.5, fontWeight: 600 }}
              onClick={() => {
                void onTitleSubmit()
              }}
            >
              Save new version
            </MuiButton>
          </DialogActions>
        </Dialog>
      ) : null}

      {bulletsEditorOpen && listing ? (
        <Dialog open={bulletsEditorOpen} onClose={onBulletsEditorClose} fullWidth maxWidth="md" slotProps={dialogSlotProps}>
          <DialogTitle sx={{ pb: 1.5 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
              <Box>
                <Typography variant="h6" sx={{ fontSize: '1.125rem', fontWeight: 700 }}>
                  New bullets version
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Improve readability and keep each point conversion-focused.
                </Typography>
              </Box>
              <ListingChip listing={listing} />
            </Stack>
          </DialogTitle>
          <DialogContent dividers sx={{ py: 2.5 }}>
            <Stack spacing={2}>
              {([
                ['bullet1', 'Bullet 1'],
                ['bullet2', 'Bullet 2'],
                ['bullet3', 'Bullet 3'],
                ['bullet4', 'Bullet 4'],
                ['bullet5', 'Bullet 5'],
              ] as const).map(([key, label]) => {
                const charCount = bulletsDraft[key].trim().length

                return (
                  <Box key={key}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        {label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {charCount} chars
                      </Typography>
                    </Stack>
                    <TextField
                      value={bulletsDraft[key]}
                      onChange={(event) => onBulletsDraftChange(key, event.target.value)}
                      multiline
                      minRows={3}
                      maxRows={7}
                      fullWidth
                      placeholder="Enter bullet text..."
                      variant="outlined"
                      sx={{
                        '& .MuiInputBase-root': {
                          alignItems: 'flex-start',
                          fontSize: 14,
                          lineHeight: 1.45,
                          borderRadius: 2,
                          backgroundColor: 'background.paper',
                        },
                      }}
                    />
                  </Box>
                )
              })}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
            <MuiButton type="button" variant="text" color="inherit" onClick={onBulletsEditorClose}>
              Cancel
            </MuiButton>
            <MuiButton
              type="button"
              variant="contained"
              sx={{ px: 2.5, fontWeight: 600 }}
              onClick={() => {
                void onBulletsSubmit()
              }}
            >
              Save new version
            </MuiButton>
          </DialogActions>
        </Dialog>
      ) : null}

      {priceEditorOpen && listing ? (
        <Dialog open={priceEditorOpen} onClose={onPriceEditorClose} fullWidth maxWidth="sm" slotProps={dialogSlotProps}>
          <DialogTitle sx={{ pb: 1.5 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
              <Typography variant="h6" sx={{ fontSize: '1.125rem', fontWeight: 700 }}>
                Edit price
              </Typography>
              <ListingChip listing={listing} />
            </Stack>
          </DialogTitle>
          <DialogContent dividers sx={{ py: 2.5 }}>
            <Stack spacing={2}>
              <TextField
                label="Price (USD)"
                value={priceDraft.price}
                onChange={(event) => onPriceDraftChange('price', event.target.value)}
                placeholder="8.99"
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Unit price (optional)"
                  value={priceDraft.perUnitPrice}
                  onChange={(event) => onPriceDraftChange('perUnitPrice', event.target.value)}
                  placeholder="1.50"
                  fullWidth
                />
                <TextField
                  label="Unit (optional)"
                  value={priceDraft.perUnitUnit}
                  onChange={(event) => onPriceDraftChange('perUnitUnit', event.target.value)}
                  placeholder="count"
                  fullWidth
                />
              </Stack>
              <Typography variant="caption" color="text.secondary">
                Unit price renders like <strong>($1.50 / count)</strong>.
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
            <MuiButton type="button" variant="text" color="inherit" onClick={onPriceEditorClose}>
              Cancel
            </MuiButton>
            <MuiButton
              type="button"
              variant="contained"
              disabled={priceDraft.price.trim().length === 0}
              sx={{ px: 2.5, fontWeight: 600 }}
              onClick={() => {
                void onPriceSubmit()
              }}
            >
              Save
            </MuiButton>
          </DialogActions>
        </Dialog>
      ) : null}

      {galleryUploaderOpen && listing ? (
        <Dialog open={galleryUploaderOpen} onClose={onGalleryUploaderClose} fullWidth maxWidth="sm" slotProps={dialogSlotProps}>
          <DialogTitle sx={{ pb: 1.5 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
              <Typography variant="h6" sx={{ fontSize: '1.125rem', fontWeight: 700 }}>
                New gallery version
              </Typography>
              <ListingChip listing={listing} />
            </Stack>
          </DialogTitle>
          <DialogContent dividers sx={{ py: 2.5 }}>
            <Stack spacing={1.5}>
              <MuiButton variant="outlined" component="label" sx={{ alignSelf: 'flex-start' }}>
                Select images
                <input
                  hidden
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => {
                    const files = event.target.files ? Array.from(event.target.files) : []
                    onGalleryFilesChange(files)
                  }}
                />
              </MuiButton>
              <Typography variant="caption" color="text.secondary">
                {galleryFiles.length > 0 ? `${galleryFiles.length} file(s) selected` : 'Select up to 6 JPG/PNG/WebP/AVIF files.'}
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
            <MuiButton type="button" variant="text" color="inherit" onClick={onGalleryUploaderClose}>
              Cancel
            </MuiButton>
            <MuiButton
              type="button"
              variant="contained"
              disabled={galleryFiles.length === 0}
              sx={{ px: 2.5, fontWeight: 600 }}
              onClick={() => {
                void onGallerySubmit()
              }}
            >
              Upload new version
            </MuiButton>
          </DialogActions>
        </Dialog>
      ) : null}

      {videoUploaderOpen && listing ? (
        <Dialog open={videoUploaderOpen} onClose={onVideoUploaderClose} fullWidth maxWidth="sm" slotProps={dialogSlotProps}>
          <DialogTitle sx={{ pb: 1.5 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
              <Typography variant="h6" sx={{ fontSize: '1.125rem', fontWeight: 700 }}>
                New video version
              </Typography>
              <ListingChip listing={listing} />
            </Stack>
          </DialogTitle>
          <DialogContent dividers sx={{ py: 2.5 }}>
            <Stack spacing={2}>
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Video file
                </Typography>
                <MuiButton variant="outlined" component="label" sx={{ alignSelf: 'flex-start' }}>
                  Select video
                  <input
                    hidden
                    type="file"
                    accept="video/mp4,video/webm"
                    onChange={(event) => {
                      const file = event.target.files ? event.target.files[0] : null
                      onVideoFileChange(file)
                    }}
                  />
                </MuiButton>
                <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.75 }}>
                  {videoFile ? videoFile.name : 'Accepted formats: MP4, WebM'}
                </Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Poster image (optional)
                </Typography>
                <MuiButton variant="outlined" component="label" sx={{ alignSelf: 'flex-start' }}>
                  Select poster
                  <input
                    hidden
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.target.files ? event.target.files[0] : null
                      onVideoPosterFileChange(file)
                    }}
                  />
                </MuiButton>
                <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.75 }}>
                  {videoPosterFile ? videoPosterFile.name : 'Optional image shown before playback'}
                </Typography>
              </Box>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
            <MuiButton type="button" variant="text" color="inherit" onClick={onVideoUploaderClose}>
              Cancel
            </MuiButton>
            <MuiButton
              type="button"
              variant="contained"
              disabled={!videoFile}
              sx={{ px: 2.5, fontWeight: 600 }}
              onClick={() => {
                void onVideoSubmit()
              }}
            >
              Upload new version
            </MuiButton>
          </DialogActions>
        </Dialog>
      ) : null}

      {ebcModuleEditorOpen && listing && ebcModuleEditorTarget ? (
        <Dialog open={ebcModuleEditorOpen} onClose={onEbcModuleEditorClose} fullWidth maxWidth="md" slotProps={dialogSlotProps}>
          <DialogTitle sx={{ pb: 1.5 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
              <Box>
                <Typography variant="h6" sx={{ fontSize: '1.125rem', fontWeight: 700 }}>
                  New A+ module version
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {ebcModuleEditorTarget.sectionType} • Module {ebcModuleEditorTarget.modulePosition + 1}
                </Typography>
              </Box>
              <ListingChip listing={listing} />
            </Stack>
          </DialogTitle>
          <DialogContent dividers sx={{ py: 2.5 }}>
            <Stack spacing={2}>
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
                  Headline
                </Typography>
                <TextField
                  value={ebcModuleDraft.headline}
                  onChange={(event) => onEbcModuleDraftChange('headline', event.target.value)}
                  multiline
                  minRows={2}
                  maxRows={4}
                  fullWidth
                  placeholder="Enter headline..."
                />
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
                  Body
                </Typography>
                <TextField
                  value={ebcModuleDraft.bodyText}
                  onChange={(event) => onEbcModuleDraftChange('bodyText', event.target.value)}
                  multiline
                  minRows={5}
                  maxRows={10}
                  fullWidth
                  placeholder="Enter body text..."
                />
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Images (optional)
                </Typography>
                <MuiButton variant="outlined" component="label" sx={{ alignSelf: 'flex-start' }}>
                  Select images
                  <input
                    hidden
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => {
                      const files = event.target.files ? Array.from(event.target.files) : []
                      onEbcModuleFilesChange(files)
                    }}
                  />
                </MuiButton>
                <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.75 }}>
                  {ebcModuleFiles.length > 0 ? `${ebcModuleFiles.length} file(s) selected` : 'Leave empty to keep current images.'}
                </Typography>
              </Box>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
            <MuiButton type="button" variant="text" color="inherit" onClick={onEbcModuleEditorClose}>
              Cancel
            </MuiButton>
            <MuiButton
              type="button"
              variant="contained"
              sx={{ px: 2.5, fontWeight: 600 }}
              onClick={() => {
                void onEbcModuleSubmit()
              }}
            >
              Save new version
            </MuiButton>
          </DialogActions>
        </Dialog>
      ) : null}

      {resetDialogOpen && listing ? (
        <Dialog
          open={resetDialogOpen}
          onClose={() => {
            if (resetBusy) return
            onResetDialogClose()
          }}
          fullWidth
          maxWidth="sm"
          slotProps={dialogSlotProps}
        >
          <DialogTitle sx={{ pb: 1.5 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
              <Box>
                <Typography variant="h6" sx={{ fontSize: '1.125rem', fontWeight: 700 }}>
                  Reset listing state
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  This removes snapshots, revisions, pointers, and media references for this listing.
                </Typography>
              </Box>
              <ListingChip listing={listing} />
            </Stack>
          </DialogTitle>
          <DialogContent dividers sx={{ py: 2.5 }}>
            <Stack spacing={2}>
              <Alert severity="warning" sx={{ borderRadius: 2 }}>
                Reset is destructive. The listing record remains, but all revision history and snapshot ingest data are cleared.
              </Alert>
              {resetError ? (
                <Typography variant="caption" color="error">
                  {resetError}
                </Typography>
              ) : null}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
            <MuiButton type="button" variant="text" color="inherit" disabled={resetBusy} onClick={onResetDialogClose}>
              Cancel
            </MuiButton>
            <MuiButton
              type="button"
              variant="contained"
              color="error"
              disabled={resetBusy}
              sx={{ px: 2.5, fontWeight: 600 }}
              onClick={() => {
                void onResetSubmit()
              }}
            >
              {resetBusy ? 'Resetting...' : 'Reset listing'}
            </MuiButton>
          </DialogActions>
        </Dialog>
      ) : null}
    </>
  )
}
