import { Transport } from './transport.js';

/** Named operations for the application API. Generated from route definitions. */
export class Client extends Transport {

  /** List monitored services. */
  listServices(options = {}) {
    return this.request('GET', "/api/services", { ...options });
  }

  /** Create a monitored service. */
  createService(body, options = {}) {
    return this.request('POST', "/api/services", { ...options, body });
  }

  /** Read service details. */
  getService(id, options = {}) {
    return this.request('GET', '/api/services/' + encodeURIComponent(id) + '', { ...options });
  }

  /** Update service objectives. */
  updateService(id, body, options = {}) {
    return this.request('PATCH', '/api/services/' + encodeURIComponent(id) + '', { ...options, body });
  }

  /** List heartbeat monitors. */
  listMonitors(options = {}) {
    return this.request('GET', "/api/monitors", { ...options });
  }

  /** Create a heartbeat monitor. */
  createMonitor(body, options = {}) {
    return this.request('POST', "/api/monitors", { ...options, body });
  }

  /** Enable or disable monitoring. */
  controlMonitor(id, body, options = {}) {
    return this.request('PATCH', '/api/monitors/' + encodeURIComponent(id) + '', { ...options, body });
  }

  /** Submit a heartbeat observation. */
  submitSample(id, body, options = {}) {
    return this.request('POST', '/api/monitors/' + encodeURIComponent(id) + '/samples', { ...options, body });
  }

  /** List heartbeat observations. */
  listSamples(options = {}) {
    return this.request('GET', "/api/samples", { ...options });
  }

  /** List incident records. */
  listIncidents(options = {}) {
    return this.request('GET', "/api/incidents", { ...options });
  }

  /** Open a manual incident. */
  createIncident(body, options = {}) {
    return this.request('POST', "/api/incidents", { ...options, body });
  }

  /** Read incident details. */
  getIncident(id, options = {}) {
    return this.request('GET', '/api/incidents/' + encodeURIComponent(id) + '', { ...options });
  }

  /** Advance the incident lifecycle. */
  transitionIncident(id, body, options = {}) {
    return this.request('POST', '/api/incidents/' + encodeURIComponent(id) + '/transition', { ...options, body });
  }

  /** Append a timeline update. */
  addIncidentNote(id, body, options = {}) {
    return this.request('POST', '/api/incidents/' + encodeURIComponent(id) + '/notes', { ...options, body });
  }

  /** Assign an incident owner. */
  assignIncident(id, body, options = {}) {
    return this.request('POST', '/api/incidents/' + encodeURIComponent(id) + '/assign', { ...options, body });
  }

  /** Read incident audit timeline. */
  incidentTimeline(id, options = {}) {
    return this.request('GET', '/api/incidents/' + encodeURIComponent(id) + '/timeline', { ...options });
  }

  /** Publish a resolved incident review. */
  createPostmortem(id, body, options = {}) {
    return this.request('POST', '/api/incidents/' + encodeURIComponent(id) + '/postmortem', { ...options, body });
  }

  /** List incident reviews. */
  listPostmortems(options = {}) {
    return this.request('GET', "/api/postmortems", { ...options });
  }

  /** List maintenance windows. */
  listMaintenance(options = {}) {
    return this.request('GET', "/api/maintenance", { ...options });
  }

  /** Schedule a maintenance window. */
  createMaintenance(body, options = {}) {
    return this.request('POST', "/api/maintenance", { ...options, body });
  }

  /** Cancel a maintenance window. */
  cancelMaintenance(id, body, options = {}) {
    return this.request('POST', '/api/maintenance/' + encodeURIComponent(id) + '/cancel', { ...options, body });
  }

  /** Register a notification subscriber. */
  createSubscriber(body, options = {}) {
    return this.request('POST', "/api/subscribers", { ...options, body });
  }

  /** List notification subscribers. */
  listSubscribers(options = {}) {
    return this.request('GET', "/api/subscribers", { ...options });
  }

  /** List the notification outbox. */
  listNotifications(options = {}) {
    return this.request('GET', "/api/notifications", { ...options });
  }

  /** Record an external delivery outcome. */
  recordDelivery(id, body, options = {}) {
    return this.request('PATCH', '/api/notifications/' + encodeURIComponent(id) + '', { ...options, body });
  }

  /** Summarize current service health. */
  serviceStatus(options = {}) {
    return this.request('GET', "/api/status", { ...options });
  }

  /** Calculate incident-based availability. */
  reliabilityReport(id, options = {}) {
    return this.request('GET', '/api/services/' + encodeURIComponent(id) + '/reliability', { ...options });
  }

  /** Evaluate missing heartbeat deadlines. */
  evaluateDeadlines(body, options = {}) {
    return this.request('POST', "/api/tick", { ...options, body });
  }
}
