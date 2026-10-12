const EARTH_RADIUS_KM = 6371.0088

export function getBrowserCoordinates(geolocation) {
  return new Promise((resolve, reject) => {
    if (!geolocation?.getCurrentPosition) {
      const problem = new Error('La geolocalización no está disponible.')
      problem.code = 0
      reject(problem)
      return
    }

    geolocation.getCurrentPosition(({ coords }) => {
      resolve({ lat: coords.latitude, lng: coords.longitude })
    }, reject, { enableHighAccuracy: false, maximumAge: 60000, timeout: 10000 })
  })
}

export function distanceBetweenKm(first, second) {
  const toRadians = (degrees) => degrees * Math.PI / 180
  const latitudeDelta = toRadians(second.lat - first.lat)
  const longitudeDelta = toRadians(second.lng - first.lng)
  const firstLatitude = toRadians(first.lat)
  const secondLatitude = toRadians(second.lat)
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine))
}

export function filterLocations(locations, { center, radiusKm, serviceType } = {}) {
  const radius = Number(radiusKm)

  return locations.filter((location) => {
    if (serviceType && location.serviceType !== serviceType) return false
    if (!center || !Number.isFinite(radius) || radius <= 0) return true

    return distanceBetweenKm(center, { lat: location.latitude, lng: location.longitude }) <= radius
  })
}