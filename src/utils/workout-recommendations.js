const BODYWEIGHT = new Set(['Bodyweight only', 'No-equipment cardio'])

export function isEquipmentCompatible(workout, equipment) {
  if (equipment === 'No equipment') return (workout.requiredEquipment || []).length === 0
  if (equipment === 'Dumbbells') {
    return (workout.requiredEquipment || []).every((item) => BODYWEIGHT.has(item) || item === 'Dumbbells')
  }
  if (equipment === 'Resistance bands') {
    return (workout.requiredEquipment || []).every((item) => BODYWEIGHT.has(item) || item === 'Resistance bands')
  }
  return true
}

export function recommendWorkouts(workouts, preferences) {
  return workouts
    .filter((workout) => isEquipmentCompatible(workout, preferences.equipment))
    .filter((workout) => workout.difficulty === preferences.level)
    .filter((workout) => workout.durationMinutes <= Number(preferences.duration))
    .filter((workout) => preferences.muscle === 'Any muscle group'
      || workout.targetMuscles.some((muscle) => muscle.toLowerCase().includes(preferences.muscle.toLowerCase())
        || preferences.muscle.toLowerCase().includes(muscle.toLowerCase())))
    .slice(0, 3)
}
