export interface ClientOptions {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  signal?: AbortSignal;
  idempotencyKey?: string;
  query?: Record<string, string | number | boolean | undefined>;
}

export interface ApiRecord {
  id: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  [key: string]: unknown;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export class Client {
  constructor(options: ClientOptions);
  request(method: string, path: string, options?: RequestOptions & { body?: unknown }): Promise<unknown>;
  pages(path: string, options?: { query?: RequestOptions['query']; pageSize?: number; signal?: AbortSignal }): AsyncGenerator<Page<ApiRecord>>;
  events(options?: { after?: number; signal?: AbortSignal }): AsyncGenerator<unknown>;

  /** List monitored services. */
  listServices(options?: RequestOptions): Promise<Page<ApiRecord>>;

  /** Create a monitored service. */
  createService(body: {
    /** Unique service name */
    name: string;
    /** Service responsibilities */
    description?: string;
    /** Operational importance */
    tier?: "critical" | "standard" | "internal";
    /** Availability target in basis points */
    targetBps?: number;
  }, options?: RequestOptions): Promise<unknown>;

  /** Read service details. */
  getService(id: string, options?: RequestOptions): Promise<unknown>;

  /** Update service objectives. */
  updateService(id: string, body: {
    /** Service responsibilities */
    description?: string;
    /** Availability target in basis points */
    targetBps?: number;
    /** Expected current revision */
    revision: number;
  }, options?: RequestOptions): Promise<unknown>;

  /** List heartbeat monitors. */
  listMonitors(options?: RequestOptions): Promise<Page<ApiRecord>>;

  /** Create a heartbeat monitor. */
  createMonitor(body: {
    /** Resource identifier */
    serviceId: string;
    /** Monitor name */
    name: string;
    /** Expected heartbeat interval */
    intervalMs?: number;
    /** Allowed heartbeat lateness */
    graceMs?: number;
    /** Consecutive failing samples to open an incident */
    failureThreshold?: number;
    /** Consecutive successful samples to resolve */
    recoveryThreshold?: number;
  }, options?: RequestOptions): Promise<unknown>;

  /** Enable or disable monitoring. */
  controlMonitor(id: string, body: {
    /** Enable incident evaluation */
    enabled: boolean;
    /** Expected current revision */
    revision: number;
  }, options?: RequestOptions): Promise<unknown>;

  /** Submit a heartbeat observation. */
  submitSample(id: string, body: {
    /** Whether the observed check succeeded */
    ok: boolean;
    /** Observed latency */
    latencyMs?: number;
    /** Observation context */
    message?: string;
  }, options?: RequestOptions): Promise<unknown>;

  /** List heartbeat observations. */
  listSamples(options?: RequestOptions): Promise<Page<ApiRecord>>;

  /** List incident records. */
  listIncidents(options?: RequestOptions): Promise<Page<ApiRecord>>;

  /** Open a manual incident. */
  createIncident(body: {
    /** Resource identifier */
    serviceId: string;
    /** Incident title */
    title: string;
    /** Incident urgency */
    severity?: "critical" | "major" | "minor";
    /** Initial impact and symptoms */
    description: string;
  }, options?: RequestOptions): Promise<unknown>;

  /** Read incident details. */
  getIncident(id: string, options?: RequestOptions): Promise<unknown>;

  /** Advance the incident lifecycle. */
  transitionIncident(id: string, body: {
    /** Next incident state */
    status: "acknowledged" | "investigating" | "monitoring" | "resolved";
    /** Reason for this transition */
    message: string;
    /** Expected current revision */
    revision: number;
  }, options?: RequestOptions): Promise<unknown>;

  /** Append a timeline update. */
  addIncidentNote(id: string, body: {
    /** Timeline update */
    message: string;
  }, options?: RequestOptions): Promise<unknown>;

  /** Assign an incident owner. */
  assignIncident(id: string, body: {
    /** Incident owner */
    owner: string;
    /** Expected current revision */
    revision: number;
  }, options?: RequestOptions): Promise<unknown>;

  /** Read incident audit timeline. */
  incidentTimeline(id: string, options?: RequestOptions): Promise<unknown>;

  /** Publish a resolved incident review. */
  createPostmortem(id: string, body: {
    /** Customer impact summary */
    summary: string;
    /** Confirmed root cause */
    rootCause: string;
    /** prevention */
    prevention: Array<string>;
  }, options?: RequestOptions): Promise<unknown>;

  /** List incident reviews. */
  listPostmortems(options?: RequestOptions): Promise<Page<ApiRecord>>;

  /** List maintenance windows. */
  listMaintenance(options?: RequestOptions): Promise<Page<ApiRecord>>;

  /** Schedule a maintenance window. */
  createMaintenance(body: {
    /** Resource identifier */
    serviceId: string;
    /** Maintenance description */
    title: string;
    /** UTC Unix time in milliseconds */
    startsAt: number;
    /** UTC Unix time in milliseconds */
    endsAt: number;
  }, options?: RequestOptions): Promise<unknown>;

  /** Cancel a maintenance window. */
  cancelMaintenance(id: string, body: {

  }, options?: RequestOptions): Promise<unknown>;

  /** Register a notification subscriber. */
  createSubscriber(body: {
    /** Notification recipient label */
    name: string;
    /** serviceIds */
    serviceIds: Array<string>;
  }, options?: RequestOptions): Promise<unknown>;

  /** List notification subscribers. */
  listSubscribers(options?: RequestOptions): Promise<Page<ApiRecord>>;

  /** List the notification outbox. */
  listNotifications(options?: RequestOptions): Promise<Page<ApiRecord>>;

  /** Record an external delivery outcome. */
  recordDelivery(id: string, body: {
    /** Delivery outcome */
    status: "delivered" | "failed";
    /** Delivery receipt or failure context */
    detail: string;
    /** Expected current revision */
    revision: number;
  }, options?: RequestOptions): Promise<unknown>;

  /** Summarize current service health. */
  serviceStatus(options?: RequestOptions): Promise<unknown>;

  /** Calculate incident-based availability. */
  reliabilityReport(id: string, options?: RequestOptions): Promise<unknown>;

  /** Evaluate missing heartbeat deadlines. */
  evaluateDeadlines(body: {

  }, options?: RequestOptions): Promise<unknown>;
}
