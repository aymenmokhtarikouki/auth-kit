/**
 * Address flows — the behavior both apps reimplement today:
 * first address becomes default, setting a default flips the others off,
 * deleting the default promotes the newest remaining one, coordinates are
 * validated, and `buildExtra` lets the app enrich rows on every write
 * (yuma: compute H3 cells from lat/lng via @clustermap/core's computeCells).
 */
import type { Address, AddressInput, AddressStore } from './types'
import { AddressError } from './types'

export interface AddressHooks<E> {
  /**
   * Compute the app-extension payload on create/update (runs on every write
   * whose lat/lng changed). Receives the full input; returns the extra to store.
   */
  buildExtra?: (input: AddressInput, previous?: Address<E>) => E | Promise<E>
}

export interface AddressService<E = unknown> {
  list(userId: string): Promise<Address<E>[]>
  get(userId: string, id: string): Promise<Address<E>>
  create(userId: string, input: AddressInput): Promise<Address<E>>
  update(userId: string, id: string, input: Partial<AddressInput>): Promise<Address<E>>
  remove(userId: string, id: string): Promise<void>
  setDefault(userId: string, id: string): Promise<Address<E>>
}

export interface CreateAddressServiceArgs<E> {
  store: AddressStore<E>
  hooks?: AddressHooks<E>
}

function assertValidCoordinates(lat: number, lng: number): void {
  const ok =
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  if (!ok) throw new AddressError('INVALID_COORDINATES', 400, 'Invalid latitude/longitude')
}

export function createAddressService<E = unknown>(
  args: CreateAddressServiceArgs<E>,
): AddressService<E> {
  const { store, hooks } = args

  async function get(userId: string, id: string): Promise<Address<E>> {
    const address = await store.findById(userId, id)
    if (!address) throw new AddressError('NOT_FOUND', 404, 'Address not found')
    return address
  }

  return {
    list: (userId) => store.listByUser(userId),
    get,

    async create(userId, input) {
      assertValidCoordinates(input.lat, input.lng)
      const existing = await store.listByUser(userId)
      // First address is always the default; an explicit default flips the rest.
      const isDefault = existing.length === 0 || input.isDefault === true
      if (isDefault && existing.length > 0) await store.clearDefault(userId)

      const extra = hooks?.buildExtra ? await hooks.buildExtra(input) : (undefined as E)
      return store.create(userId, { ...input, isDefault, extra })
    },

    async update(userId, id, input) {
      const previous = await get(userId, id)
      const lat = input.lat ?? previous.lat
      const lng = input.lng ?? previous.lng
      assertValidCoordinates(lat, lng)

      const coordsChanged = lat !== previous.lat || lng !== previous.lng
      const extra =
        hooks?.buildExtra && coordsChanged
          ? await hooks.buildExtra({ ...input, lat, lng }, previous)
          : undefined

      if (input.isDefault === true && !previous.isDefault) await store.clearDefault(userId)

      return store.update(userId, id, {
        ...input,
        ...(extra !== undefined ? { extra } : {}),
      })
    },

    async remove(userId, id) {
      const address = await get(userId, id)
      await store.delete(userId, id)
      // Deleting the default promotes the newest remaining address.
      if (address.isDefault) {
        const rest = await store.listByUser(userId)
        if (rest.length > 0) {
          const newest = [...rest].sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
          )[0]!
          await store.update(userId, newest.id, { isDefault: true })
        }
      }
    },

    async setDefault(userId, id) {
      await get(userId, id) // 404 guard
      await store.clearDefault(userId)
      return store.update(userId, id, { isDefault: true })
    },
  }
}
