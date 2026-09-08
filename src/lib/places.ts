import places from '../data/places.json'

export const WORLD_COUNTRIES = places.countries as string[]

const STATES = places.states as Record<string, string[]>

export function statesForCountry(country: string) {
  const list = STATES[country] || []
  return list.length ? list : country ? [country] : []
}
