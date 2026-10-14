import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const mediaDirectory = fileURLToPath(new URL('../../data/ads/', import.meta.url))

export function detectAdMediaType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: 'jpg', contentType: 'image/jpeg', kind: 'image' }
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { extension: 'png', contentType: 'image/png', kind: 'image' }
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { extension: 'webp', contentType: 'image/webp', kind: 'image' }
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    return { extension: 'mp4', contentType: 'video/mp4', kind: 'video' }
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    return { extension: 'webm', contentType: 'video/webm', kind: 'video' }
  }
  return null
}

export async function saveAdMedia(buffer) {
  const mediaType = detectAdMediaType(buffer)
  if (!mediaType) throw Object.assign(new Error('El archivo debe ser JPEG, PNG, WebP, MP4 o WebM válido.'), { status: 400 })

  const filename = `${randomUUID()}.${mediaType.extension}`
  await mkdir(mediaDirectory, { recursive: true })
  await writeFile(path.join(mediaDirectory, filename), buffer, { flag: 'wx' })
  return {
    filename,
    mediaUrl: `/api/public/media/${filename}`,
    contentType: mediaType.contentType,
    kind: mediaType.kind,
  }
}

export async function deleteAdMedia(mediaUrl) {
  const filename = path.basename(String(mediaUrl || ''))
  if (!/^[0-9a-f-]{36}\.(?:jpg|png|webp|mp4|webm)$/i.test(filename)) return
  try {
    await unlink(path.join(mediaDirectory, filename))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

export function getAdMediaPath(filename) {
  if (!/^[0-9a-f-]{36}\.(?:jpg|png|webp|mp4|webm)$/i.test(filename)) return null
  return path.join(mediaDirectory, filename)
}