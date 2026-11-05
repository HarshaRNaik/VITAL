import records from './exercise-catalog.json'

const catalog = records.map((record) => ({
  id: record.id,
  name: record.name,
  category: record.category,
  bodyPart: record.body_part,
  equipment: record.equipment,
}))

export function searchExerciseDataset({ query = '', focus = '', equipment = '', limit = 100, offset = 0 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new RangeError('Limit must be an integer between 1 and 500.')
  if (!Number.isInteger(offset) || offset < 0) throw new RangeError('Offset must be a non-negative integer.')
  for (const [value, label] of [[query, 'Query'], [focus, 'Focus'], [equipment, 'Equipment']]) {
    if (typeof value !== 'string') throw new TypeError(`${label} must be a string.`)
  }

  const search = query.trim().toLocaleLowerCase()
  const targetFocus = focus.trim().toLocaleLowerCase()
  const targetEquipment = equipment.trim().toLocaleLowerCase()
  const filtered = catalog.filter((exercise) => (
    (!search || `${exercise.name} ${exercise.category} ${exercise.bodyPart} ${exercise.equipment}`.toLocaleLowerCase().includes(search))
    && (!targetFocus || `${exercise.category} ${exercise.bodyPart}`.toLocaleLowerCase().includes(targetFocus))
    && (!targetEquipment || exercise.equipment.toLocaleLowerCase().includes(targetEquipment))
  ))
  return {
    items: filtered.slice(offset, offset + limit),
    total: filtered.length,
    offset,
    limit,
  }
}
