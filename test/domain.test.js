import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, api } from './helpers.js';

function setup(f, options = {}) {
  const service = f.call('createService', { name: 'Checkout' });
  const monitor = f.call('createMonitor', { serviceId: service.id, name: 'Checkout worker', intervalMs: 1000, graceMs: 0, failureThreshold: 2, recoveryThreshold: 2, ...options });
  return { service, monitor };
}
function sample(f, monitor, ok) { return f.call('submitSample', { ok }, { id: monitor.id }); }
function incident(f, service, title = 'Checkout outage') { return f.call('createIncident', { serviceId: service.id, title, description: 'Requests are failing' }); }

test('failure threshold opens one incident and recovery threshold resolves it', t => {
  const f = fixture(t);
  const { monitor } = setup(f);
  sample(f, monitor, false);
  assert.equal(f.store.all('incident').length, 0);
  sample(f, monitor, false);
  sample(f, monitor, false);
  assert.equal(f.store.all('incident').length, 1);
  sample(f, monitor, true);
  assert.equal(f.store.all('incident')[0].status, 'open');
  sample(f, monitor, true);
  assert.equal(f.store.all('incident')[0].status, 'resolved');
});

test('success resets consecutive failure counts', t => {
  const f = fixture(t);
  const { monitor } = setup(f);
  sample(f, monitor, false);
  sample(f, monitor, true);
  sample(f, monitor, false);
  assert.equal(f.store.all('incident').length, 0);
  assert.equal(f.store.get('monitor', monitor.id).failures, 1);
});

test('missing heartbeat deadlines produce one synthetic failure per evaluation interval', t => {
  const f = fixture(t);
  const { monitor } = setup(f);
  f.advance(1000);
  assert.equal(f.call('evaluateDeadlines').missed, 1);
  assert.equal(f.call('evaluateDeadlines').missed, 0);
  f.advance(1000);
  f.call('evaluateDeadlines');
  assert.equal(f.store.all('incident').length, 1);
  assert.ok(f.store.all('sample').every(s => s.synthetic));
  assert.equal(f.store.get('monitor', monitor.id).lastSeenAt, null);
});

test('maintenance suppresses incident creation and recovery transitions', t => {
  const f = fixture(t);
  const { service, monitor } = setup(f);
  f.call('createMaintenance', { serviceId: service.id, title: 'Deploy', startsAt: f.now(), endsAt: f.now() + 5000 });
  sample(f, monitor, false);
  sample(f, monitor, false);
  assert.equal(f.store.all('incident').length, 0);
  assert.equal(f.call('serviceStatus')[0].status, 'maintenance');
  f.advance(5000);
  sample(f, monitor, false);
  sample(f, monitor, false);
  assert.equal(f.store.all('incident').length, 1);
});

test('disabled monitors retain observations without generating incidents', t => {
  const f = fixture(t);
  const { monitor } = setup(f);
  f.call('controlMonitor', { enabled: false, revision: monitor.revision }, { id: monitor.id });
  sample(f, monitor, false);
  sample(f, monitor, false);
  f.advance(5000);
  assert.equal(f.call('evaluateDeadlines').missed, 0);
  assert.equal(f.store.all('incident').length, 0);
  assert.equal(f.store.all('sample').length, 2);
});

test('incident state machine rejects backwards transitions and stale edits', t => {
  const f = fixture(t);
  const { service } = setup(f);
  const issue = incident(f, service);
  const acknowledged = f.call('transitionIncident', { status: 'acknowledged', message: 'On call engaged', revision: issue.revision }, { id: issue.id });
  assert.equal(acknowledged.acknowledgedAt, f.now());
  assert.throws(() => f.call('transitionIncident', { status: 'investigating', message: 'Starting', revision: 1 }, { id: issue.id }), { code: 'revision_conflict' });
  const resolved = f.call('transitionIncident', { status: 'resolved', message: 'Fixed', revision: acknowledged.revision }, { id: issue.id });
  assert.throws(() => f.call('transitionIncident', { status: 'investigating', message: 'Again', revision: resolved.revision }, { id: issue.id }), { code: 'invalid_transition' });
});

test('notes and assignments append an ordered incident timeline', t => {
  const f = fixture(t);
  const { service } = setup(f);
  const issue = incident(f, service);
  f.call('assignIncident', { owner: 'oncall-primary', revision: issue.revision }, { id: issue.id });
  f.call('addIncidentNote', { message: 'Database pool exhausted' }, { id: issue.id });
  const timeline = f.call('incidentTimeline', {}, { id: issue.id });
  assert.deepEqual(timeline.map(e => e.type), ['incident.opened', 'incident.assigned', 'incident.note']);
});

test('subscriber outbox is atomic with incident transitions', t => {
  const f = fixture(t);
  const { service } = setup(f);
  f.call('createSubscriber', { name: 'Operations', serviceIds: [service.id] });
  const issue = incident(f, service);
  assert.equal(f.store.all('notification').length, 1);
  assert.throws(() => f.call('transitionIncident', { status: 'resolved', message: 'Wrong revision', revision: 99 }, { id: issue.id }), { code: 'revision_conflict' });
  assert.equal(f.store.all('notification').length, 1);
  f.call('transitionIncident', { status: 'resolved', message: 'Recovered', revision: 1 }, { id: issue.id });
  assert.equal(f.store.all('notification').length, 2);
  const notification = f.store.all('notification')[0];
  const failed = f.call('recordDelivery', { status: 'failed', detail: 'Provider unavailable', revision: 1 }, { id: notification.id });
  const delivered = f.call('recordDelivery', { status: 'delivered', detail: 'Receipt 123', revision: failed.revision }, { id: notification.id });
  assert.throws(() => f.call('recordDelivery', { status: 'delivered', detail: 'Again', revision: delivered.revision }, { id: notification.id }), { code: 'already_delivered' });
});

test('overlapping incident windows count downtime once', t => {
  const f = fixture(t);
  const { service } = setup(f);
  const from = f.now();
  f.advance(1000);
  const first = incident(f, service, 'First');
  f.advance(1000);
  const second = incident(f, service, 'Second');
  f.advance(1000);
  f.call('transitionIncident', { status: 'resolved', message: 'Fixed', revision: 1 }, { id: first.id });
  f.advance(1000);
  f.call('transitionIncident', { status: 'resolved', message: 'Fixed', revision: 1 }, { id: second.id });
  f.advance(1000);
  const report = f.call('reliabilityReport', {}, { id: service.id }, { from: String(from), to: String(f.now()) });
  assert.equal(report.durationMs, 5000);
  assert.equal(report.downtimeMs, 3000);
  assert.equal(report.availabilityBps, 4000);
  assert.equal(report.meanTimeToResolveMs, 2000);
});

test('reliability report clips open incidents to the requested interval', t => {
  const f = fixture(t);
  const { service } = setup(f);
  incident(f, service);
  f.advance(5000);
  const report = f.call('reliabilityReport', {}, { id: service.id }, { from: String(f.now() - 1000), to: String(f.now()) });
  assert.equal(report.downtimeMs, 1000);
  assert.equal(report.resolvedIncidents, 0);
  assert.equal(report.meanTimeToResolveMs, null);
  assert.throws(() => f.call('reliabilityReport', {}, { id: service.id }, { from: '0', to: '1' }), { code: 'invalid_range' });
});

test('postmortems require resolution and cannot be duplicated', t => {
  const f = fixture(t);
  const { service } = setup(f);
  const issue = incident(f, service);
  const body = { summary: 'Checkout unavailable', rootCause: 'Connection leak', prevention: ['Bound connection lifetime'] };
  assert.throws(() => f.call('createPostmortem', body, { id: issue.id }), { code: 'unresolved_incident' });
  f.call('transitionIncident', { status: 'resolved', message: 'Fixed', revision: 1 }, { id: issue.id });
  assert.equal(f.call('createPostmortem', body, { id: issue.id }).incidentId, issue.id);
  assert.throws(() => f.call('createPostmortem', body, { id: issue.id }), { code: 'postmortem_exists' });
});

test('HTTP heartbeat idempotency prevents duplicate threshold increments', async t => {
  const f = await api(t);
  const { monitor } = setup(f);
  const options = { method: 'POST', body: { ok: false }, headers: { 'idempotency-key': 'heartbeat-1' } };
  const first = await f.request('/api/monitors/' + monitor.id + '/samples', options);
  const replay = await f.request('/api/monitors/' + monitor.id + '/samples', options);
  assert.deepEqual(first.data, replay.data);
  assert.equal(f.store.all('sample').length, 1);
  assert.equal(f.store.all('incident').length, 0);
});
