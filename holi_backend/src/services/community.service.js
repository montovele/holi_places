export async function getPublicCommunityData(database, now = new Date()) {
  const [[congregations], [events], [posts], [moduleUpdates]] = await Promise.all([
    database.execute(`
      SELECT locations.id, locations.organization_id AS organizationId, locations.name, locations.city, locations.address,
        locations.latitude, locations.longitude
      FROM locations
      WHERE EXISTS (
        SELECT 1 FROM subscriptions
        WHERE subscriptions.organization_id = locations.organization_id
          AND subscriptions.status = 'active'
          AND (subscriptions.current_period_end IS NULL OR subscriptions.current_period_end > UTC_TIMESTAMP())
      )
      ORDER BY locations.name
    `),
    database.execute(`
      SELECT events.id, events.name AS title, events.description,
        events.starts_at AS startsAt, events.ends_at AS endsAt,
        locations.id AS locationId, locations.name AS congregation,
        locations.city, locations.address, locations.latitude, locations.longitude,
        COUNT(reservations.id) AS attendeeCount
      FROM events
      JOIN locations ON locations.id = events.location_id AND locations.organization_id = events.organization_id
      LEFT JOIN reservations ON reservations.event_id = events.id AND reservations.status = 'confirmed'
        AND reservations.organization_id = events.organization_id
      WHERE events.status = 'scheduled' AND events.starts_at >= ?
        AND EXISTS (
          SELECT 1 FROM subscriptions
          WHERE subscriptions.organization_id = events.organization_id
            AND subscriptions.status = 'active'
            AND (subscriptions.current_period_end IS NULL OR subscriptions.current_period_end > UTC_TIMESTAMP())
        )
      GROUP BY events.id, events.name, events.description, events.starts_at, events.ends_at,
        locations.id, locations.name, locations.city, locations.address, locations.latitude, locations.longitude
      ORDER BY events.starts_at
      LIMIT 50
    `, [now.toISOString()]),
    database.execute(`
      SELECT community_posts.id, community_posts.type, community_posts.title,
        community_posts.excerpt, community_posts.body,
        community_posts.image_url AS imageUrl, community_posts.published_at AS publishedAt,
        locations.id AS locationId, locations.name AS congregation, locations.city,
        locations.latitude, locations.longitude
      FROM community_posts
      JOIN locations ON locations.id = community_posts.location_id
        AND locations.organization_id = community_posts.organization_id
      WHERE community_posts.status = 'published'
        AND community_posts.organization_id = locations.organization_id
        AND EXISTS (
          SELECT 1 FROM subscriptions
          WHERE subscriptions.organization_id = community_posts.organization_id
            AND subscriptions.status = 'active'
            AND (subscriptions.current_period_end IS NULL OR subscriptions.current_period_end > UTC_TIMESTAMP())
        )
      ORDER BY community_posts.published_at DESC
      LIMIT 50
    `),
    database.execute(`
      SELECT module_records.id, module_records.module_id AS moduleId, module_records.title, module_records.status,
        module_records.description, module_records.detail, module_records.record_date AS recordDate,
        organizations.id AS organizationId, organizations.name AS congregation
      FROM module_records
      JOIN organizations ON organizations.id = module_records.organization_id
      WHERE module_records.is_public = 1
        AND module_records.module_id IN ('groups', 'attendance', 'resources', 'communications', 'reports', 'settings')
        AND EXISTS (
          SELECT 1 FROM subscriptions
          WHERE subscriptions.organization_id = module_records.organization_id
            AND subscriptions.status = 'active'
            AND (subscriptions.current_period_end IS NULL OR subscriptions.current_period_end > UTC_TIMESTAMP())
        )
      ORDER BY module_records.record_date DESC, module_records.title
      LIMIT 100
    `),
  ])

  return { congregations, events, posts, moduleUpdates }
}