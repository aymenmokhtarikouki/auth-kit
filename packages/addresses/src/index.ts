/**
 * @authkit/addresses — generic address book + geocoding seam.
 *
 * Quick start:
 *   const addresses = createAddressService({
 *     store: myAddressStore,           // maps to your addresses table
 *     hooks: {
 *       // yuma: keep H3 cells populated for map clustering
 *       buildExtra: (input) => ({ ...computeCells(input.lat, input.lng) }),
 *     },
 *   })
 *   const geocoder = mapboxGeocoder({ accessToken: env.MAPBOX_TOKEN, country: 'de' })
 */
export type {
  Address,
  AddressInput,
  AddressStore,
  AddressErrorCode,
  GeocodeResult,
  Geocoder,
} from './types'
export { AddressError } from './types'

export { createAddressService } from './service'
export type { AddressService, AddressHooks, CreateAddressServiceArgs } from './service'

export { mapboxGeocoder } from './mapbox'
export type { MapboxGeocoderOptions } from './mapbox'

export { createInMemoryAddressStore } from './memory'
