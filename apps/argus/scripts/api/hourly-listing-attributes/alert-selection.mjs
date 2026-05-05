export const BSR_CHANGE_FIELDS = new Set([
  'root_bsr_rank',
  'root_bsr_category_id',
  'sub_bsr_rank',
  'sub_bsr_category_id',
])

export function eventHasBsrChange(event) {
  const changedFields = Array.isArray(event?.changed_fields) ? event.changed_fields : []
  return changedFields.some((field) => BSR_CHANGE_FIELDS.has(field))
}

export function shouldEmailEvent(event) {
  if (eventHasBsrChange(event)) return true
  return event?.severity === 'critical' || event?.severity === 'high'
}

export function selectEmailEvents(events) {
  return events.filter((event) => shouldEmailEvent(event))
}
