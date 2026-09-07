import { Services } from './services.js';
import { Incidents } from './incidents.js';
import { Monitors } from './monitors.js';
import { Reports } from './reports.js';
import * as s from './schemas.js';

export function createDomain(store) {
  const services = new Services(store);
  const incidents = new Incidents(store);
  const monitors = new Monitors(store, services, incidents);
  const reports = new Reports(store, services);
  const routes = [
    ['GET', '/api/services', 'listServices', 'List monitored services', null, () => store.all('service')],
    ['POST', '/api/services', 'createService', 'Create a monitored service', s.serviceInput, c => services.create(c.body)],
    ['GET', '/api/services/:id', 'getService', 'Read service details', null, c => store.get('service', c.params.id)],
    ['PATCH', '/api/services/:id', 'updateService', 'Update service objectives', s.serviceUpdate, c => services.update(c.params.id, c.body)],
    ['GET', '/api/monitors', 'listMonitors', 'List heartbeat monitors', null, () => store.all('monitor')],
    ['POST', '/api/monitors', 'createMonitor', 'Create a heartbeat monitor', s.monitorInput, c => monitors.create(c.body)],
    ['PATCH', '/api/monitors/:id', 'controlMonitor', 'Enable or disable monitoring', s.monitorControl, c => monitors.control(c.params.id, c.body)],
    ['POST', '/api/monitors/:id/samples', 'submitSample', 'Submit a heartbeat observation', s.sampleInput, c => monitors.sample(c.params.id, c.body)],
    ['GET', '/api/samples', 'listSamples', 'List heartbeat observations', null, c => store.all('sample').filter(s => !c.query.monitorId || s.monitorId === c.query.monitorId)],
    ['GET', '/api/incidents', 'listIncidents', 'List incident records', null, c => store.all('incident').filter(i => !c.query.status || i.status === c.query.status)],
    ['POST', '/api/incidents', 'createIncident', 'Open a manual incident', s.incidentInput, c => incidents.create(c.body)],
    ['GET', '/api/incidents/:id', 'getIncident', 'Read incident details', null, c => store.get('incident', c.params.id)],
    ['POST', '/api/incidents/:id/transition', 'transitionIncident', 'Advance the incident lifecycle', s.transitionInput, c => incidents.transition(c.params.id, c.body)],
    ['POST', '/api/incidents/:id/notes', 'addIncidentNote', 'Append a timeline update', s.noteInput, c => incidents.note(c.params.id, c.body)],
    ['POST', '/api/incidents/:id/assign', 'assignIncident', 'Assign an incident owner', s.assignInput, c => incidents.assign(c.params.id, c.body)],
    ['GET', '/api/incidents/:id/timeline', 'incidentTimeline', 'Read incident audit timeline', null, c => store.events({ resourceId: c.params.id, limit: 200 })],
    ['POST', '/api/incidents/:id/postmortem', 'createPostmortem', 'Publish a resolved incident review', s.postmortemInput, c => incidents.postmortem(c.params.id, c.body)],
    ['GET', '/api/postmortems', 'listPostmortems', 'List incident reviews', null, () => store.all('postmortem')],
    ['GET', '/api/maintenance', 'listMaintenance', 'List maintenance windows', null, () => store.all('maintenance')],
    ['POST', '/api/maintenance', 'createMaintenance', 'Schedule a maintenance window', s.maintenanceInput, c => services.maintenance(c.body)],
    ['POST', '/api/maintenance/:id/cancel', 'cancelMaintenance', 'Cancel a maintenance window', s.empty, c => services.cancelMaintenance(c.params.id)],
    ['POST', '/api/subscribers', 'createSubscriber', 'Register a notification subscriber', s.subscriberInput, c => services.subscribe(c.body)],
    ['GET', '/api/subscribers', 'listSubscribers', 'List notification subscribers', null, () => store.all('subscriber')],
    ['GET', '/api/notifications', 'listNotifications', 'List the notification outbox', null, () => store.all('notification')],
    ['PATCH', '/api/notifications/:id', 'recordDelivery', 'Record an external delivery outcome', s.deliveryInput, c => services.delivery(c.params.id, c.body)],
    ['GET', '/api/status', 'serviceStatus', 'Summarize current service health', null, () => reports.status()],
    ['GET', '/api/services/:id/reliability', 'reliabilityReport', 'Calculate incident-based availability', null, c => reports.reliability(c.params.id, c.query)],
    ['POST', '/api/tick', 'evaluateDeadlines', 'Evaluate missing heartbeat deadlines', s.empty, () => monitors.tick()],
  ];
  return { routes, services, incidents, monitors, reports, tick: () => monitors.tick() };
}
