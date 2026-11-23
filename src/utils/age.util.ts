export const MIN_ADULT_AGE = 18

/** Latest date of birth (YYYY-MM-DD, local time) for someone who is at least `years` old today. */
export const latestDobForAge = (years: number = MIN_ADULT_AGE): string => {
  const now = new Date()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear() - years}-${m}-${d}`
}

/** True when a YYYY-MM-DD date of birth makes the person at least `years` old today. */
export const isAtLeastAge = (dob: string, years: number = MIN_ADULT_AGE): boolean =>
  String(dob).trim().slice(0, 10) <= latestDobForAge(years)

export const ADULT_DOB_MESSAGE = `Age must be ${MIN_ADULT_AGE} years or above`
