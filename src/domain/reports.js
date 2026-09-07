import { ensure } from '../core/errors.js';

export class Reports {
  constructor(store, services) { this.store = store; this.services = services; }

  status() {
    const incidents = this.store.all('incident');
    const monitors = this.store.all('monitor');
    return this.store.all('service').map(service => {
      const active = incidents.filter(i => i.serviceId === service.id && i.status !== 'resolved');
      const checks = monitors.filter(m => m.serviceId === service.id && m.enabled);
      const maintenance = this.services.inMaintenance(service.id);
      const status = maintenance ? 'maintenance' : active.length ? 'incident' : checks.some(m => m.status === 'down') ? 'degraded' : checks.length && checks.every(m => m.status === 'up') ? 'operational' : 'unknown';
      return { serviceId: service.id, name: service.name, status, activeIncidents: active.length, monitors: checks.length };
    });
  }

  reliability(serviceId, query) {
    const service = this.store.get('service', serviceId);
    const now = this.store.clock();
    const from = query.from === undefined ? Math.max(service.createdAt, now - 30 * 86_400_000) : Number(query.from);
    const to = query.to === undefined ? now : Number(query.to);
    ensure(Number.isSafeInteger(from) && Number.isSafeInteger(to) && from >= service.createdAt && to > from && to <= now, 422, 'invalid_range', 'Range must lie between service creation and now and have positive duration');
    const intervals = this.store.all('incident').filter(i => i.serviceId === serviceId)
      .map(i => [Math.max(from, i.openedAt), Math.min(to, i.resolvedAt ?? to)])
      .filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0]);
    let downtimeMs = 0;
    let end = from;
    for (const [start, stop] of intervals) {
      downtimeMs += Math.max(0, stop - Math.max(start, end));
      end = Math.max(end, stop);
    }
    const durationMs = to - from;
    const allowedDowntimeMs = durationMs * (1 - service.targetBps / 10_000);
    const resolved = this.store.all('incident').filter(i => i.serviceId === serviceId && i.resolvedAt !== null && i.resolvedAt >= from && i.resolvedAt <= to);
    return {
      serviceId, from, to, durationMs, downtimeMs,
      availabilityBps: Math.round((1 - downtimeMs / durationMs) * 10_000),
      targetBps: service.targetBps, allowedDowntimeMs,
      remainingBudgetMs: allowedDowntimeMs - downtimeMs,
      resolvedIncidents: resolved.length,
      meanTimeToResolveMs: resolved.length ? resolved.reduce((sum, i) => sum + i.resolvedAt - i.openedAt, 0) / resolved.length : null,
    };
  }
}
