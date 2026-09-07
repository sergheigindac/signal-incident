import { ensure } from '../core/errors.js';

export class Monitors {
  constructor(store, services, incidents) {
    this.store = store;
    this.services = services;
    this.incidents = incidents;
  }

  create(input) {
    return this.store.transaction(() => {
      this.store.get('service', input.serviceId);
      ensure(!this.store.find('monitor', m => m.serviceId === input.serviceId && m.name === input.name), 409, 'duplicate_name', 'Monitor name already exists in this service');
      const monitor = this.store.create('monitor', {
        ...input, enabled: true, status: 'unknown', failures: 0, successes: 0,
        lastSeenAt: null, nextExpectedAt: this.store.clock() + input.intervalMs + input.graceMs,
        activeIncidentId: null,
      });
      this.store.event('monitor.created', monitor.id);
      return monitor;
    });
  }

  control(id, { enabled, revision }) {
    return this.store.transaction(() => {
      const monitor = this.store.get('monitor', id);
      const next = this.store.update('monitor', id, {
        enabled, failures: 0, successes: 0,
        nextExpectedAt: this.store.clock() + monitor.intervalMs + monitor.graceMs,
      }, revision);
      this.store.event(enabled ? 'monitor.enabled' : 'monitor.disabled', id);
      return next;
    });
  }

  sample(id, input, synthetic = false) {
    return this.store.transaction(() => {
      const monitor = this.store.get('monitor', id);
      const suppressed = !monitor.enabled || this.services.inMaintenance(monitor.serviceId);
      const sample = this.store.create('sample', { ...input, monitorId: id, synthetic, suppressed });
      const failures = suppressed ? 0 : input.ok ? 0 : monitor.failures + 1;
      const successes = suppressed ? 0 : input.ok ? monitor.successes + 1 : 0;
      let activeIncidentId = monitor.activeIncidentId;
      if (activeIncidentId && this.store.get('incident', activeIncidentId).status === 'resolved') activeIncidentId = null;
      if (!suppressed && !activeIncidentId && failures >= monitor.failureThreshold) {
        const incident = this.incidents.create({
          serviceId: monitor.serviceId, title: monitor.name + ' is failing',
          severity: 'major', description: input.message,
        }, id);
        activeIncidentId = incident.id;
      }
      if (!suppressed && activeIncidentId && successes >= monitor.recoveryThreshold) {
        const incident = this.store.get('incident', activeIncidentId);
        this.incidents.transition(incident.id, { status: 'resolved', message: 'Monitor recovery threshold reached', revision: incident.revision });
        activeIncidentId = null;
      }
      const next = this.store.update('monitor', id, {
        failures, successes, activeIncidentId,
        status: suppressed ? 'suppressed' : input.ok ? 'up' : 'down',
        lastSeenAt: synthetic ? monitor.lastSeenAt : this.store.clock(),
        nextExpectedAt: this.store.clock() + monitor.intervalMs + monitor.graceMs,
      });
      this.store.event('monitor.sampled', id, { sampleId: sample.id, ok: input.ok, suppressed });
      return { monitor: next, sample };
    });
  }

  tick() {
    return this.store.transaction(() => {
      let missed = 0;
      for (const monitor of this.store.all('monitor')) {
        if (!monitor.enabled || monitor.nextExpectedAt > this.store.clock()) continue;
        this.sample(monitor.id, { ok: false, latencyMs: 0, message: 'Expected heartbeat was not received' }, true);
        missed++;
      }
      return { missed };
    });
  }
}
