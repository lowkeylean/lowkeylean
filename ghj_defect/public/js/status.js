// Shared traffic-light status for the executive hotel overview.
//
// This app is a defect tracker — there is no "last maintained" date per room
// (unlike the preventive-maintenance reference design). So a location's status
// is derived from its OPEN defects (anything not yet 'Completed'):
//
//   red    – has an open Critical or High defect          (needs attention)
//   amber  – has open defects, all Low/Medium             (watch)
//   green  – nothing open                                 (clear)
//
// Keep this rule in one place and import it everywhere a status is shown.

export const STATUS_LABELS = { red: 'Attention', amber: 'Watch', green: 'Clear' };

// Lower sorts first (most urgent first).
export const STATUS_ORDER = { red: 0, amber: 1, green: 2 };

// Priority severity ranking for sorting a location's defect list.
export const PRIORITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };

const URGENT_PRIORITIES = new Set(['Critical', 'High']);

// Roll a location's defects up into one traffic-light status.
// `defects` is every defect recorded for that location (open + completed).
export function locationStatus(defects) {
  const open = defects.filter((d) => d.status !== 'Completed');
  let status = 'green';
  if (open.length > 0) {
    status = open.some((d) => URGENT_PRIORITIES.has(d.priority)) ? 'red' : 'amber';
  }
  return { status, open: open.length, total: defects.length };
}
