import { text, integer, boolean, enumeration, object, list } from '../core/validation.js';

export const identifier = text('Resource identifier', { maxLength: 80, pattern: '^[A-Za-z0-9_-]+$' });
export const revision = integer('Expected current revision', { minimum: 1 });
export const serviceInput = object({
  name: text('Unique service name', { maxLength: 100 }),
  description: text('Service responsibilities', { maxLength: 2000, default: 'No description provided' }),
  tier: enumeration('Operational importance', ['critical', 'standard', 'internal'], { default: 'standard' }),
  targetBps: integer('Availability target in basis points', { minimum: 1, maximum: 10_000, default: 9990 }),
}, ['name']);
export const serviceUpdate = object({
  description: serviceInput.properties.description,
  targetBps: serviceInput.properties.targetBps, revision,
}, ['description', 'targetBps', 'revision']);
export const monitorInput = object({
  serviceId: identifier, name: text('Monitor name'),
  intervalMs: integer('Expected heartbeat interval', { minimum: 1000, maximum: 86_400_000, default: 60_000 }),
  graceMs: integer('Allowed heartbeat lateness', { maximum: 86_400_000, default: 10_000 }),
  failureThreshold: integer('Consecutive failing samples to open an incident', { minimum: 1, maximum: 100, default: 3 }),
  recoveryThreshold: integer('Consecutive successful samples to resolve', { minimum: 1, maximum: 100, default: 2 }),
}, ['serviceId', 'name']);
export const monitorControl = object({ enabled: boolean('Enable incident evaluation'), revision });
export const sampleInput = object({
  ok: boolean('Whether the observed check succeeded'),
  latencyMs: integer('Observed latency', { maximum: 3_600_000, default: 0 }),
  message: text('Observation context', { maxLength: 1000, default: 'Heartbeat received' }),
}, ['ok']);
export const incidentInput = object({
  serviceId: identifier, title: text('Incident title'),
  severity: enumeration('Incident urgency', ['critical', 'major', 'minor'], { default: 'major' }),
  description: text('Initial impact and symptoms', { maxLength: 4000 }),
}, ['serviceId', 'title', 'description']);
export const transitionInput = object({
  status: enumeration('Next incident state', ['acknowledged', 'investigating', 'monitoring', 'resolved']),
  message: text('Reason for this transition', { maxLength: 4000 }), revision,
});
export const noteInput = object({ message: text('Timeline update', { maxLength: 4000 }) });
export const assignInput = object({ owner: text('Incident owner'), revision });
export const maintenanceInput = object({
  serviceId: identifier, title: text('Maintenance description'),
  startsAt: integer('UTC Unix time in milliseconds', { maximum: 8_640_000_000_000_000 }),
  endsAt: integer('UTC Unix time in milliseconds', { maximum: 8_640_000_000_000_000 }),
});
export const subscriberInput = object({
  name: text('Notification recipient label'),
  serviceIds: list(identifier, { maxItems: 100 }),
});
export const deliveryInput = object({
  status: enumeration('Delivery outcome', ['delivered', 'failed']),
  detail: text('Delivery receipt or failure context', { maxLength: 1000 }), revision,
});
export const postmortemInput = object({
  summary: text('Customer impact summary', { maxLength: 8000 }),
  rootCause: text('Confirmed root cause', { maxLength: 8000 }),
  prevention: list(text('Follow-up action', { maxLength: 1000 }), { maxItems: 30 }),
});
export const empty = object({});
