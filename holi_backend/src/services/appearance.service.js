export const defaultAppearance = {
  brandName: 'Holi Places',
  brandIcon: 'church',
  communityMode: 'editorial',
  colors: {
    primary: '#214F3D',
    accent: '#AD5D48',
    background: '#FAF9F4',
    text: '#20392F',
  },
}

export const brandIconIds = ['church', 'book', 'heart', 'community', 'light']
export const communityModes = ['editorial', 'directory', 'organizational']
const colorPattern = /^#[0-9a-fA-F]{6}$/

function invalid(message) {
  const error = new Error(message)
  error.status = 400
  throw error
}

export function normalizeAppearance(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('La apariencia debe enviarse como un objeto.')

  const brandName = typeof input.brandName === 'string' ? input.brandName.trim() : ''
  const brandIcon = input.brandIcon
  const communityMode = input.communityMode
  const colors = input.colors

  if (!brandName || brandName.length > 48) invalid('El nombre de marca debe tener entre 1 y 48 caracteres.')
  if (!brandIconIds.includes(brandIcon)) invalid('El icono seleccionado no está permitido.')
  if (!communityModes.includes(communityMode)) invalid('El modo de comunidad seleccionado no está permitido.')
  if (!colors || typeof colors !== 'object' || Array.isArray(colors)) invalid('La paleta de colores no es válida.')

  const normalizedColors = {}
  for (const colorKey of Object.keys(defaultAppearance.colors)) {
    const value = colors[colorKey]
    if (typeof value !== 'string' || !colorPattern.test(value)) {
      invalid(`El color ${colorKey} debe ser un hexadecimal de seis caracteres.`)
    }
    normalizedColors[colorKey] = value.toUpperCase()
  }

  return { brandName, brandIcon, communityMode, colors: normalizedColors }
}

function parseSetting(value) {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return defaultAppearance
    }
  }
  return value || defaultAppearance
}

export async function readAppearance(database) {
  const [rows] = await database.execute(
    'SELECT setting_value AS settingValue FROM app_settings WHERE setting_key = ? LIMIT 1',
    ['public_appearance'],
  )
  if (!rows[0]) return structuredClone(defaultAppearance)

  const saved = parseSetting(rows[0].settingValue)
  try {
    return normalizeAppearance({
      ...defaultAppearance,
      ...saved,
      colors: { ...defaultAppearance.colors, ...saved.colors },
    })
  } catch {
    return structuredClone(defaultAppearance)
  }
}

export async function saveAppearance(database, input, actorId) {
  const appearance = normalizeAppearance(input)
  await database.execute(`
    INSERT INTO app_settings (setting_key, setting_value, updated_by)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)
  `, ['public_appearance', JSON.stringify(appearance), actorId || null])
  return appearance
}