export function getHealthStatus(now = new Date()) {
  return {
    status: 'ok',
    service: 'holi-places-api',
    timestamp: now.toISOString(),
  }
}