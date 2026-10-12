import dotenv from 'dotenv'
import { createPool } from 'mysql2/promise'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { hashPassword } from '../services/auth.service.js'

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })

const schema = [
  `CREATE TABLE IF NOT EXISTS organizations (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS saas_plans (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(64) NOT NULL UNIQUE,
    nombre VARCHAR(120) NOT NULL,
    descripcion TEXT NULL,
    estado VARCHAR(16) NOT NULL DEFAULT 'draft',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_saas_plans_status (estado, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS saas_plan_prices (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    plan_id BIGINT UNSIGNED NOT NULL,
    environment VARCHAR(8) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency CHAR(3) NOT NULL,
    interval_unit VARCHAR(8) NOT NULL,
    interval_count TINYINT UNSIGNED NOT NULL DEFAULT 1,
    stripe_price_id VARCHAR(255) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'draft',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_saas_plan_prices_plan FOREIGN KEY (plan_id) REFERENCES saas_plans(id),
    INDEX idx_saas_plan_prices_lookup (plan_id, environment, status),
    UNIQUE KEY uq_saas_plan_prices_stripe (environment, stripe_price_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS saas_plan_entitlements (
    plan_id BIGINT UNSIGNED NOT NULL,
    feature_key VARCHAR(64) NOT NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 0,
    limits_json JSON NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (plan_id, feature_key),
    CONSTRAINT fk_saas_plan_entitlements_plan FOREIGN KEY (plan_id) REFERENCES saas_plans(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL,
    provider VARCHAR(24) NOT NULL DEFAULT 'stripe',
    status VARCHAR(32) NOT NULL DEFAULT 'pending_payment',
    saas_plan_id BIGINT UNSIGNED NULL,
    saas_plan_price_id BIGINT UNSIGNED NULL,
    stripe_price_id VARCHAR(255) NULL,
    stripe_checkout_session_id VARCHAR(255) NULL,
    stripe_customer_id VARCHAR(255) NULL,
    stripe_subscription_id VARCHAR(255) NULL UNIQUE,
    current_period_start DATETIME NULL,
    current_period_end DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_subscriptions_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    INDEX idx_subscriptions_access (organization_id, status, current_period_end)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS billing_webhook_events (
    id VARCHAR(255) PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    setting_key VARCHAR(80) PRIMARY KEY,
    setting_value JSON NOT NULL,
    updated_by VARCHAR(64) NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
      record_date VARCHAR(40) NOT NULL DEFAULT '',
      is_public TINYINT(1) NOT NULL DEFAULT 0,
    email VARCHAR(320) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    role VARCHAR(24) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    INDEX idx_users_organization_role (organization_id, role)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS locations (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    city VARCHAR(255) NOT NULL,
    address VARCHAR(500) NOT NULL,
    latitude DOUBLE NOT NULL DEFAULT 19.4326,
    longitude DOUBLE NOT NULL DEFAULT -99.1332
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS members (
    id VARCHAR(64) PRIMARY KEY,
    first_name VARCHAR(150) NOT NULL,
    last_name VARCHAR(150) NOT NULL,
    email VARCHAR(320) NOT NULL UNIQUE,
    status VARCHAR(40) NOT NULL DEFAULT 'active'
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS events (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    starts_at VARCHAR(40) NOT NULL,
    ends_at VARCHAR(40) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'scheduled',
    location_id VARCHAR(64) NOT NULL,
    CONSTRAINT fk_events_location FOREIGN KEY (location_id) REFERENCES locations(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS reservations (
    id VARCHAR(64) PRIMARY KEY,
    event_id VARCHAR(64) NOT NULL,
    member_id VARCHAR(64) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'confirmed',
    UNIQUE KEY uq_reservations_event_member (event_id, member_id),
    CONSTRAINT fk_reservations_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT fk_reservations_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS space_reservations (
    id VARCHAR(64) PRIMARY KEY,
    location_id VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255) NOT NULL,
    starts_at VARCHAR(40) NOT NULL,
    ends_at VARCHAR(40) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'confirmed',
    notes TEXT NOT NULL,
    CONSTRAINT fk_space_reservations_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
    INDEX idx_space_reservations_schedule (location_id, status, starts_at, ends_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS module_records (
    id VARCHAR(64) PRIMARY KEY,
    module_id VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    detail TEXT NOT NULL,
    record_date VARCHAR(40) NOT NULL DEFAULT '',
    INDEX idx_module_records_module_date (module_id, record_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS community_posts (
    id VARCHAR(64) PRIMARY KEY,
    location_id VARCHAR(64) NOT NULL,
    type VARCHAR(24) NOT NULL DEFAULT 'article',
    title VARCHAR(255) NOT NULL,
    excerpt VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,
    image_url VARCHAR(1000) NOT NULL DEFAULT '',
    status VARCHAR(24) NOT NULL DEFAULT 'published',
    published_at VARCHAR(40) NOT NULL,
    CONSTRAINT fk_community_posts_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
    INDEX idx_community_posts_publication (status, published_at),
    INDEX idx_community_posts_location (location_id, status, published_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
]

export const database = createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || 'holi_app',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'holi_places',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
})

const tenantTables = ['locations', 'members', 'events', 'reservations', 'space_reservations', 'module_records', 'community_posts']

async function ensureTenantColumns() {
  for (const table of tenantTables) {
    const [columns] = await database.execute(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'organization_id'
    `, [table])
    if (!columns.length) await database.query(`ALTER TABLE \`${table}\` ADD COLUMN organization_id VARCHAR(64) NULL`)

    const [unassignedRows] = await database.execute(`SELECT COUNT(*) AS total FROM \`${table}\` WHERE organization_id IS NULL`)
    if (Number(unassignedRows[0].total) > 0) {
      const [organizations] = await database.execute('SELECT id FROM organizations')
      if (organizations.length !== 1) {
        throw new Error(`No se pueden asignar registros antiguos de ${table}: hay que asociarlos manualmente a una organización.`)
      }
      await database.execute(`UPDATE \`${table}\` SET organization_id = ? WHERE organization_id IS NULL`, [organizations[0].id])
    }

    await database.query(`ALTER TABLE \`${table}\` MODIFY organization_id VARCHAR(64) NOT NULL`)

    const [indexes] = await database.execute(`
      SELECT INDEX_NAME FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
    `, [table, `idx_${table}_organization`])
    if (!indexes.length) await database.query(`ALTER TABLE \`${table}\` ADD INDEX idx_${table}_organization (organization_id)`)
  }
}

  async function ensureModulePublicColumn() {
    const [columns] = await database.execute(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'module_records' AND COLUMN_NAME = 'is_public'
    `)
    if (!columns.length) await database.query('ALTER TABLE module_records ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 0')
  }

async function ensureSubscriptionPriceIsOptional() {
  const [columns] = await database.execute(`
    SELECT IS_NULLABLE AS isNullable FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscriptions' AND COLUMN_NAME = 'stripe_price_id'
  `)
  if (columns[0]?.isNullable === 'NO') {
    await database.query('ALTER TABLE subscriptions MODIFY stripe_price_id VARCHAR(255) NULL')
  }
}

async function ensureSubscriptionPlanColumns() {
  const columnsToAdd = [
    ['saas_plan_id', 'BIGINT UNSIGNED NULL'],
    ['saas_plan_price_id', 'BIGINT UNSIGNED NULL'],
  ]
  for (const [columnName, definition] of columnsToAdd) {
    const [columns] = await database.execute(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscriptions' AND COLUMN_NAME = ?
    `, [columnName])
    if (!columns.length) await database.query(`ALTER TABLE subscriptions ADD COLUMN ${columnName} ${definition}`)
  }
  const [indexes] = await database.execute(`
    SELECT INDEX_NAME FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscriptions' AND INDEX_NAME = 'idx_subscriptions_saas_plan'
  `)
  if (!indexes.length) await database.query('ALTER TABLE subscriptions ADD INDEX idx_subscriptions_saas_plan (saas_plan_id, saas_plan_price_id)')
}

async function ensureExistingTenantSubscriptions() {
  await database.execute(`
    INSERT INTO subscriptions (id, organization_id, status, stripe_price_id)
    SELECT CONCAT('sub-migrated-', organizations.id), organizations.id, 'pending_payment', ?
    FROM organizations
    LEFT JOIN subscriptions ON subscriptions.organization_id = organizations.id
    WHERE subscriptions.id IS NULL
  `, [process.env.STRIPE_PRICE_ID || null])
}

export async function ensureDefaultSaasPlans(databasePool = database) {
  const defaultPlans = [
    { codigo: 'starter', nombre: 'Starter', descripcion: 'Plan base para congregaciones pequeñas.', estado: 'active', amount: 199, currency: 'MXN', interval_unit: 'month', interval_count: 1, modules: ['events', 'locations', 'members'] },
    { codigo: 'pro', nombre: 'Pro', descripcion: 'Plan completo para crecimiento y administración.', estado: 'active', amount: 499, currency: 'MXN', interval_unit: 'month', interval_count: 1, modules: ['events', 'reservations', 'members', 'groups', 'attendance', 'locations', 'resources', 'communications', 'reports', 'subscription', 'settings'] },
  ]

  for (const plan of defaultPlans) {
    const [existing] = await databasePool.execute('SELECT id FROM saas_plans WHERE codigo = ? LIMIT 1', [plan.codigo])
    if (existing.length) continue

    const [inserted] = await databasePool.execute(
      'INSERT INTO saas_plans (codigo, nombre, descripcion, estado) VALUES (?, ?, ?, ?)',
      [plan.codigo, plan.nombre, plan.descripcion, plan.estado],
    )

    await databasePool.execute(
      'INSERT INTO saas_plan_prices (plan_id, environment, amount, currency, interval_unit, interval_count, stripe_price_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [inserted.insertId, 'test', plan.amount, plan.currency, plan.interval_unit, plan.interval_count, null, 'active'],
    )

    const moduleEntries = plan.modules.map((featureKey) => [inserted.insertId, featureKey, 1])
    for (const [planId, featureKey, enabled] of moduleEntries) {
      await databasePool.execute(
        'INSERT INTO saas_plan_entitlements (plan_id, feature_key, enabled) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)',
        [planId, featureKey, enabled],
      )
    }
  }
}

export async function ensureBootstrapSuperadmin(databasePool = database, configuration = process.env, logger = console) {
  const [existing] = await databasePool.execute("SELECT id FROM users WHERE role = 'superadmin' LIMIT 1")
  if (existing.length) return

  const email = configuration.INITIAL_SUPERADMIN_EMAIL?.trim().toLowerCase()
  const password = configuration.INITIAL_SUPERADMIN_PASSWORD
  if (!email || !password || password.length < 12) {
    logger.warn('No se creó una cuenta superadmin inicial: INITIAL_SUPERADMIN_EMAIL e INITIAL_SUPERADMIN_PASSWORD válidos son opcionales. La API continuará sin superadmin.')
    return
  }

  await databasePool.execute(`
    INSERT INTO users (id, email, password_hash, role, status)
    VALUES (?, ?, ?, 'superadmin', 'active')
  `, [randomUUID(), email, await hashPassword(password)])
}

export async function initializeDatabase() {
  for (const statement of schema) await database.query(statement)
  await ensureTenantColumns()
  await ensureModulePublicColumn()
  await ensureSubscriptionPriceIsOptional()
  await ensureSubscriptionPlanColumns()
  await ensureExistingTenantSubscriptions()
  await ensureDefaultSaasPlans()
  await ensureBootstrapSuperadmin()
  await database.execute('SELECT 1')
}