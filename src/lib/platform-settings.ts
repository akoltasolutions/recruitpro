import { promises as fs } from 'fs'
import path from 'path'

const SETTINGS_FILE = path.join(process.cwd(), 'db', 'platform-settings.json')

export async function getPlatformSetting(key: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf-8')
    const settings = JSON.parse(raw)
    return settings[key] ?? null
  } catch {
    return null
  }
}

export async function setPlatformSetting(key: string, value: string): Promise<void> {
  let settings: Record<string, string> = {}
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf-8')
    settings = JSON.parse(raw)
  } catch { /* first time */ }
  settings[key] = value
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8')
}

export async function getAllPlatformSettings(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}
