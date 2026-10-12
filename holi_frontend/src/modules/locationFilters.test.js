import assert from 'node:assert/strict'
import test from 'node:test'
import { distanceBetweenKm, filterLocations, getBrowserCoordinates } from './locationFilters.js'

const locations = [
  { id: 'central', latitude: 19.4326, longitude: -99.1332, serviceType: 'meeting-space' },
  { id: 'north', latitude: 19.4838, longitude: -99.1350, serviceType: 'community-center' },
]

test('distance calculation uses latitude and longitude in kilometers', () => {
  assert.ok(distanceBetweenKm({ lat: 19.4326, lng: -99.1332 }, { lat: 19.4838, lng: -99.1350 }) > 5)
  assert.equal(distanceBetweenKm({ lat: 19.4326, lng: -99.1332 }, { lat: 19.4326, lng: -99.1332 }), 0)
})

test('distance filters are skipped without a center and applied when present', () => {
  assert.deepEqual(filterLocations(locations, { radiusKm: 1 }).map(({ id }) => id), ['central', 'north'])
  assert.deepEqual(filterLocations(locations, {
    center: { lat: 19.4326, lng: -99.1332 },
    radiusKm: 1,
  }).map(({ id }) => id), ['central'])
})

test('service type and radius filters can be combined', () => {
  assert.deepEqual(filterLocations(locations, {
    center: { lat: 19.4326, lng: -99.1332 },
    radiusKm: 10,
    serviceType: 'community-center',
  }), [locations[1]])
})

test('geolocation returns normalized coordinates and reports denied permission', async () => {
  const geolocation = {
    getCurrentPosition(resolve) {
      resolve({ coords: { latitude: 19.4, longitude: -99.1 } })
    },
  }
  assert.deepEqual(await getBrowserCoordinates(geolocation), { lat: 19.4, lng: -99.1 })

  await assert.rejects(getBrowserCoordinates({
    getCurrentPosition(resolve, reject) {
      reject({ code: 1 })
    },
  }), (problem) => problem.code === 1)
  await assert.rejects(getBrowserCoordinates(undefined), (problem) => problem.code === 0)
})