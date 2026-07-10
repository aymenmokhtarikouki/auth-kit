/**
 * Generic address book. `E` is the app's extension payload — yuma stores
 * placeId/city/postal + 9 precomputed H3 cell columns there; lineo stores
 * nothing extra. The kit owns the BEHAVIOR every app reimplements (default
 * flipping, validation, geocoding); the app owns the table.
 */

export interface Address<E = unknown> {
  id: string
  userId: string
  /** User-facing label ("Home", "Work"). */
  label?: string | null
  /** Formatted address line. */
  line?: string | null
  lat: number
  lng: number
  isDefault: boolean
  /** App-specific fields (placeId, city, H3 cells, …). */
  extra: E
  createdAt: Date
  updatedAt: Date
}

export interface AddressInput {
  label?: string | null
  line?: string | null
  lat: number
  lng: number
  isDefault?: boolean
}

export interface AddressStore<E = unknown> {
  listByUser(userId: string): Promise<Address<E>[]>
  findById(userId: string, id: string): Promise<Address<E> | null>
  create(
    userId: string,
    data: AddressInput & { isDefault: boolean; extra: E },
  ): Promise<Address<E>>
  update(
    userId: string,
    id: string,
    data: Partial<AddressInput & { extra: E }>,
  ): Promise<Address<E>>
  delete(userId: string, id: string): Promise<void>
  /** Unset isDefault on every address of the user (the flip's first half). */
  clearDefault(userId: string): Promise<void>
}

export type AddressErrorCode = 'NOT_FOUND' | 'INVALID_COORDINATES'

export class AddressError extends Error {
  readonly code: AddressErrorCode
  readonly status: number
  constructor(code: AddressErrorCode, status: number, message: string) {
    super(message)
    this.name = 'AddressError'
    this.code = code
    this.status = status
  }
}

// ── Geocoding seam ───────────────────────────────────────────────────────────

/** One suggestion / resolved place, with pre-split components when available. */
export interface GeocodeResult {
  /** Human-readable full address. */
  label: string
  lat: number
  lng: number
  /** Provider place id (Mapbox feature id, Google place_id, …). */
  placeId?: string
  parts?: {
    street?: string
    houseNumber?: string
    postalCode?: string
    city?: string
    country?: string
    countryCode?: string
  }
}

export interface Geocoder {
  autocomplete(query: string, opts?: { limit?: number }): Promise<GeocodeResult[]>
  reverse(lat: number, lng: number): Promise<GeocodeResult | null>
}
