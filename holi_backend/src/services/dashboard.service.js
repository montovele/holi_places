export async function getDashboardData(database, now = new Date(), organizationId) {
  const [events] = await database.execute(`
    SELECT events.id, events.name, events.description, events.starts_at AS startsAt,
      locations.name AS location, COUNT(reservations.id) AS reservationCount
    FROM events
    JOIN locations ON locations.id = events.location_id AND locations.organization_id = events.organization_id
    LEFT JOIN reservations ON reservations.event_id = events.id AND reservations.status = 'confirmed'
    WHERE events.status = 'scheduled' AND events.starts_at >= ? AND events.organization_id = ?
    GROUP BY events.id, events.name, events.description, events.starts_at, locations.name
    ORDER BY events.starts_at
    LIMIT 5
  `, [now.toISOString(), organizationId])

  return { events }
}