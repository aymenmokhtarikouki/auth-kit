/**
 * Mapbox Geocoding v5 adapter — the same proxy lineo built and yuma copied,
 * extracted once. Runs SERVER-SIDE so the access token never reaches clients.
 * `fetchImpl` is injectable for tests; defaults to global fetch (Node 18+).
 */
import type { GeocodeResult, Geocoder } from './types'

export interface MapboxGeocoderOptions {
  accessToken: string
  /** ISO country filter, e.g. 'de' or 'de,at'. */
  country?: string
  /** Response language, e.g. 'de'. */
  language?: string
  /** Feature types, default 'address'. */
  types?: string
  /** Default result cap for autocomplete. Default 5. */
  limit?: number
  fetchImpl?: typeof fetch
}

interface MapboxFeature {
  id: string
  place_name: string
  center: [number, number]
  text?: string
  address?: string
  context?: Array<{ id: string; text: string; short_code?: string }>
}

/** Pre-split Mapbox context into address parts (postcode/place/country…). */
function extractParts(feature: MapboxFeature): GeocodeResult['parts'] {
  const parts: NonNullable<GeocodeResult['parts']> = {}
  if (feature.text) parts.street = feature.text
  if (feature.address) parts.houseNumber = feature.address
  for (const ctx of feature.context ?? []) {
    if (ctx.id.startsWith('postcode')) parts.postalCode = ctx.text
    else if (ctx.id.startsWith('place')) parts.city = ctx.text
    else if (ctx.id.startsWith('country')) {
      parts.country = ctx.text
      if (ctx.short_code) parts.countryCode = ctx.short_code.toUpperCase()
    }
  }
  return parts
}

function toResult(feature: MapboxFeature): GeocodeResult {
  return {
    label: feature.place_name,
    lat: feature.center[1],
    lng: feature.center[0],
    placeId: feature.id,
    parts: extractParts(feature),
  }
}

export function mapboxGeocoder(options: MapboxGeocoderOptions): Geocoder {
  const { accessToken, country, language, types = 'address', limit = 5 } = options
  const doFetch = options.fetchImpl ?? fetch

  function buildUrl(path: string, params: Record<string, string>): string {
    const usp = new URLSearchParams({ access_token: accessToken, types, ...params })
    if (country) usp.set('country', country)
    if (language) usp.set('language', language)
    return `https://api.mapbox.com/geocoding/v5/mapbox.places/${path}.json?${usp}`
  }

  async function query(url: string): Promise<MapboxFeature[]> {
    const res = await doFetch(url)
    if (!res.ok) throw new Error(`Mapbox geocoding failed (${res.status})`)
    const body = (await res.json()) as { features?: MapboxFeature[] }
    return body.features ?? []
  }

  return {
    async autocomplete(q, opts) {
      const trimmed = q.trim()
      if (trimmed.length < 3) return []
      const url = buildUrl(encodeURIComponent(trimmed), {
        autocomplete: 'true',
        limit: String(opts?.limit ?? limit),
      })
      return (await query(url)).map(toResult)
    },

    async reverse(lat, lng) {
      const url = buildUrl(`${lng},${lat}`, { limit: '1' })
      const features = await query(url)
      return features.length > 0 ? toResult(features[0]!) : null
    },
  }
}
