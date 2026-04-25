import test from 'node:test'
import assert from 'node:assert/strict'
import { buildListingsViewModel } from './view-model'

const baseListing = {
  id: 'listing-1',
  asin: 'B09HXC3NL8',
  marketplace: 'US',
  label: 'B09HXC3NL8',
  brandName: null,
  enabled: true,
  createdAt: new Date('2026-04-20T10:00:00.000Z'),
  updatedAt: new Date('2026-04-21T10:00:00.000Z'),
  titleRevisions: [],
  _count: {
    snapshots: 0,
    titleRevisions: 0,
    bulletsRevisions: 0,
    galleryRevisions: 0,
    videoRevisions: 0,
    ebcRevisions: 0,
  },
}

test('buildListingsViewModel summarizes listings for the table', () => {
  const viewModel = buildListingsViewModel([
    {
      ...baseListing,
      label: 'Greenhouse 12 x 9',
      _count: {
        snapshots: 2,
        titleRevisions: 1,
        bulletsRevisions: 1,
        galleryRevisions: 1,
        videoRevisions: 0,
        ebcRevisions: 1,
      },
    },
  ])

  assert.equal(viewModel.totalListings, 1)
  assert.equal(viewModel.totalSnapshots, 2)
  assert.equal(viewModel.totalRevisions, 4)
  assert.equal(viewModel.metadataRefreshCount, 0)
  assert.equal(viewModel.rows[0].displayName, 'Greenhouse 12 x 9')
  assert.equal(viewModel.rows[0].revisionTotal, 4)
})

test('buildListingsViewModel marks ASIN-only rows for metadata refresh', () => {
  const viewModel = buildListingsViewModel([baseListing])

  assert.equal(viewModel.metadataRefreshCount, 1)
  assert.equal(viewModel.rows[0].displayName, 'B09HXC3NL8')
  assert.equal(viewModel.rows[0].needsMetadataRefresh, true)
})

test('buildListingsViewModel uses latest title for generic brand labels', () => {
  const viewModel = buildListingsViewModel([
    {
      ...baseListing,
      label: 'HomeNest',
      brandName: 'HomeNest',
      titleRevisions: [{ title: 'HomeNest Portable greenhouse kit with reinforced frame and shelves' }],
      _count: {
        snapshots: 0,
        titleRevisions: 1,
        bulletsRevisions: 0,
        galleryRevisions: 0,
        videoRevisions: 0,
        ebcRevisions: 0,
      },
    },
  ])

  assert.equal(viewModel.metadataRefreshCount, 0)
  assert.equal(viewModel.rows[0].displayName, 'Portable greenhouse kit with reinforced frame')
  assert.equal(viewModel.rows[0].needsMetadataRefresh, false)
})
