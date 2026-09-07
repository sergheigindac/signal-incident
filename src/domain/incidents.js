import { ensure } from '../core/errors.js';

const transitions = {
  open: ['acknowledged', 'investigating', 'resolved'],
  acknowledged: ['investigating', 'monitoring', 'resolved'],
  investigating: ['monitoring', 'resolved'],
  monitoring: ['investigating', 'resolved'],
  resolved: [],
};

export class Incidents {
  constructor(store) { this.store = store; }

  notify(incident, type) {
    for (const subscriber of this.store.all('subscriber')) {
      if (!subscriber.serviceIds.includes(incident.serviceId)) continue;
      this.store.create('notification', {
        subscriberId: subscriber.id, incidentId: incident.id, type,
        status: 'pending', detail: null, title: incident.title,
      });
    }
  }

  create(input, monitorId = null) {
    return this.store.transaction(() => {
      this.store.get('service', input.serviceId);
      const incident = this.store.create('incident', {
        ...input, monitorId, status: 'open', owner: null,
        openedAt: this.store.clock(), acknowledgedAt: null, resolvedAt: null,
      });
      this.store.event('incident.opened', incident.id, { message: input.description });
      this.notify(incident, 'incident.opened');
      return incident;
    });
  }

  transition(id, { status, message, revision }) {
    return this.store.transaction(() => {
      const incident = this.store.get('incident', id);
      ensure(transitions[incident.status].includes(status), 409, 'invalid_transition', 'Incident cannot move from ' + incident.status + ' to ' + status);
      const change = { status };
      if (status === 'acknowledged' && !incident.acknowledgedAt) change.acknowledgedAt = this.store.clock();
      if (status === 'resolved') change.resolvedAt = this.store.clock();
      const next = this.store.update('incident', id, change, revision);
      this.store.event('incident.' + status, id, { message });
      this.notify(next, 'incident.' + status);
      return next;
    });
  }

  note(id, { message }) {
    this.store.get('incident', id);
    return this.store.event('incident.note', id, { message });
  }

  assign(id, { owner, revision }) {
    return this.store.transaction(() => {
      const incident = this.store.get('incident', id);
      ensure(incident.status !== 'resolved', 409, 'resolved_incident', 'Resolved incidents cannot be reassigned');
      const next = this.store.update('incident', id, { owner }, revision);
      this.store.event('incident.assigned', id, { owner });
      return next;
    });
  }

  postmortem(id, input) {
    return this.store.transaction(() => {
      const incident = this.store.get('incident', id);
      ensure(incident.status === 'resolved', 409, 'unresolved_incident', 'Resolve the incident before publishing a postmortem');
      ensure(!this.store.find('postmortem', p => p.incidentId === id), 409, 'postmortem_exists', 'Postmortem already exists');
      const postmortem = this.store.create('postmortem', { ...input, incidentId: id });
      this.store.event('incident.postmortem', id, { postmortemId: postmortem.id });
      return postmortem;
    });
  }
}
