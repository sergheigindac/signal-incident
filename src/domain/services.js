import { ensure } from '../core/errors.js';

export class Services {
  constructor(store) { this.store = store; }

  create(input) {
    return this.store.transaction(() => {
      ensure(!this.store.find('service', s => s.name === input.name), 409, 'duplicate_name', 'Service name already exists');
      const service = this.store.create('service', input);
      this.store.event('service.created', service.id);
      return service;
    });
  }

  update(id, { revision, ...input }) {
    return this.store.transaction(() => {
      const service = this.store.update('service', id, input, revision);
      this.store.event('service.updated', id);
      return service;
    });
  }

  maintenance(input) {
    return this.store.transaction(() => {
      this.store.get('service', input.serviceId);
      ensure(input.endsAt > input.startsAt, 422, 'invalid_window', 'Maintenance must end after it starts');
      ensure(input.endsAt > this.store.clock(), 422, 'past_window', 'Maintenance must end in the future');
      const window = this.store.create('maintenance', { ...input, cancelled: false });
      this.store.event('maintenance.created', window.id);
      return window;
    });
  }

  cancelMaintenance(id) {
    return this.store.transaction(() => {
      const window = this.store.get('maintenance', id);
      ensure(!window.cancelled, 409, 'already_cancelled', 'Maintenance already cancelled');
      const next = this.store.update('maintenance', id, { cancelled: true });
      this.store.event('maintenance.cancelled', id);
      return next;
    });
  }

  inMaintenance(serviceId) {
    const now = this.store.clock();
    return Boolean(this.store.find('maintenance', w => w.serviceId === serviceId && !w.cancelled && w.startsAt <= now && w.endsAt > now));
  }

  subscribe(input) {
    return this.store.transaction(() => {
      ensure(new Set(input.serviceIds).size === input.serviceIds.length, 422, 'duplicate_service', 'Service list must be unique');
      for (const id of input.serviceIds) this.store.get('service', id);
      return this.store.create('subscriber', input);
    });
  }

  delivery(id, { status, detail, revision }) {
    return this.store.transaction(() => {
      const notification = this.store.get('notification', id);
      ensure(notification.status !== 'delivered', 409, 'already_delivered', 'Notification has already been delivered');
      const next = this.store.update('notification', id, { status, detail }, revision);
      this.store.event('notification.' + status, id);
      return next;
    });
  }
}
