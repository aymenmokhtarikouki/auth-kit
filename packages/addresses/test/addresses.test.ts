import { describe, expect, it } from 'vitest'
import {
  createAddressService,
  createInMemoryAddressStore,
  mapboxGeocoder,
  AddressError,
} from '../src/index'

const BERLIN = { lat: 52.52, lng: 13.405 }

describe('address service — default flipping', () => {
  it('first address becomes default automatically', async () => {
    const svc = createAddressService({ store: createInMemoryAddressStore() })
    const a = await svc.create('u1', { label: 'Home', ...BERLIN })
    expect(a.isDefault).toBe(true)
  })

  it('creating with isDefault flips the previous default off', async () => {
    const svc = createAddressService({ store: createInMemoryAddressStore() })
    const a = await svc.create('u1', { label: 'Home', ...BERLIN })
    const b = await svc.create('u1', { label: 'Work', lat: 52.5, lng: 13.4, isDefault: true })

    const list = await svc.list('u1')
    expect(list.find((x) => x.id === a.id)!.isDefault).toBe(false)
    expect(list.find((x) => x.id === b.id)!.isDefault).toBe(true)
  })

  it('setDefault flips exactly one on', async () => {
    const svc = createAddressService({ store: createInMemoryAddressStore() })
    const a = await svc.create('u1', { ...BERLIN })
    const b = await svc.create('u1', { lat: 52.5, lng: 13.4 })
    await svc.setDefault('u1', b.id)

    const list = await svc.list('u1')
    expect(list.filter((x) => x.isDefault)).toHaveLength(1)
    expect(list.find((x) => x.isDefault)!.id).toBe(b.id)
    expect(list.find((x) => x.id === a.id)!.isDefault).toBe(false)
  })

  it('deleting the default promotes the newest remaining address', async () => {
    const svc = createAddressService({ store: createInMemoryAddressStore() })
    const a = await svc.create('u1', { label: 'first', ...BERLIN })
    await new Promise((r) => setTimeout(r, 5))
    const b = await svc.create('u1', { label: 'second', lat: 52.5, lng: 13.4 })
    await svc.setDefault('u1', a.id)

    await svc.remove('u1', a.id)
    const list = await svc.list('u1')
    expect(list).toHaveLength(1)
    expect(list[0]!.id).toBe(b.id)
    expect(list[0]!.isDefault).toBe(true)
  })

  it('users are isolated', async () => {
    const svc = createAddressService({ store: createInMemoryAddressStore() })
    const a = await svc.create('u1', { ...BERLIN })
    await expect(svc.get('u2', a.id)).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
  })
})

describe('address service — validation + extras hook', () => {
  it('rejects invalid coordinates', async () => {
    const svc = createAddressService({ store: createInMemoryAddressStore() })
    await expect(svc.create('u1', { lat: 123, lng: 13 })).rejects.toBeInstanceOf(AddressError)
    await expect(svc.create('u1', { lat: 52, lng: 999 })).rejects.toMatchObject({
      code: 'INVALID_COORDINATES',
    })
  })

  it('buildExtra enriches rows on create and on coordinate change (yuma H3 case)', async () => {
    type Extra = { cell: string }
    const svc = createAddressService<Extra>({
      store: createInMemoryAddressStore<Extra>(),
      hooks: { buildExtra: (input) => ({ cell: `h3:${input.lat.toFixed(2)}` }) },
    })

    const a = await svc.create('u1', { ...BERLIN })
    expect(a.extra).toEqual({ cell: 'h3:52.52' })

    // label-only update keeps extra untouched…
    const renamed = await svc.update('u1', a.id, { label: 'Home' })
    expect(renamed.extra).toEqual({ cell: 'h3:52.52' })

    // …coordinate change recomputes it
    const moved = await svc.update('u1', a.id, { lat: 48.14, lng: 11.58 })
    expect(moved.extra).toEqual({ cell: 'h3:48.14' })
  })
})

describe('mapboxGeocoder', () => {
  const feature = {
    id: 'address.123',
    place_name: 'Gullweg 12, 12203 Berlin, Germany',
    center: [13.405, 52.52] as [number, number],
    text: 'Gullweg',
    address: '12',
    context: [
      { id: 'postcode.1', text: '12203' },
      { id: 'place.2', text: 'Berlin' },
      { id: 'country.3', text: 'Germany', short_code: 'de' },
    ],
  }

  function fakeFetch(capture: string[]) {
    return (async (url: RequestInfo | URL) => {
      capture.push(String(url))
      return {
        ok: true,
        json: async () => ({ features: [feature] }),
      } as Response
    }) as typeof fetch
  }

  it('autocomplete maps features with pre-split parts, forwards token/filters', async () => {
    const urls: string[] = []
    const geo = mapboxGeocoder({
      accessToken: 'tok',
      country: 'de',
      language: 'de',
      fetchImpl: fakeFetch(urls),
    })
    const results = await geo.autocomplete('Gullweg 12')

    expect(results[0]).toMatchObject({
      label: 'Gullweg 12, 12203 Berlin, Germany',
      lat: 52.52,
      lng: 13.405,
      placeId: 'address.123',
      parts: {
        street: 'Gullweg',
        houseNumber: '12',
        postalCode: '12203',
        city: 'Berlin',
        country: 'Germany',
        countryCode: 'DE',
      },
    })
    expect(urls[0]).toContain('access_token=tok')
    expect(urls[0]).toContain('country=de')
    expect(urls[0]).toContain('autocomplete=true')
  })

  it('short queries return [] without hitting the API; reverse uses lng,lat', async () => {
    const urls: string[] = []
    const geo = mapboxGeocoder({ accessToken: 'tok', fetchImpl: fakeFetch(urls) })

    expect(await geo.autocomplete('ab')).toEqual([])
    expect(urls).toHaveLength(0)

    const r = await geo.reverse(52.52, 13.405)
    expect(r!.lat).toBe(52.52)
    expect(urls[0]).toContain('/13.405,52.52.json')
  })
})
