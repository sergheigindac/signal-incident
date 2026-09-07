# API reference

Local base URL: http://127.0.0.1:4330. Domain endpoints require Authorization: Bearer <API_TOKEN>. Mutations use Content-Type: application/json. Successful domain operations return 200. Timestamps are UTC Unix milliseconds.

Examples use placeholder resource identifiers. Replace them with IDs from earlier creation calls. Maintenance timestamps are illustrative and must end in the future.

## Common behavior

- Unknown fields and invalid types return 422 with the failing field path.
- Lists return items, total, limit, and offset. Maximum limit is 200.
- Revisions begin at 1 and increment after updates.
- Mutations optionally accept Idempotency-Key for 24-hour replay.
- State conflicts return 409; missing records return 404.
- /health is public; /ready, /metrics, /openapi.json, and /api/events require authentication.
- /api/events accepts after, limit, and resourceId and returns items plus a next sequence cursor.

## Operations

### listServices

List monitored services.

~~~http
GET /api/services
Authorization: Bearer <API_TOKEN>
~~~

Pagination: append ?limit=50&offset=0. Increase offset by the number of returned items until it reaches total. Concurrent writes can change offset-based results.

Client method: client.listServices(options?).

### createService

Create a monitored service.

~~~http
POST /api/services
Authorization: Bearer <API_TOKEN>
Content-Type: application/json
Idempotency-Key: <unique-logical-request-key>
~~~

| Field | Type | Required | Constraints and meaning |
| --- | --- | --- | --- |
| name | string | Yes | Unique service name. Max length 100 |
| description | string | No | Service responsibilities. Max length 2000. Default "No description provided" |
| tier | string | No | Operational importance. Allowed: critical, standard, internal. Max length 200. Default "standard" |
| targetBps | integer | No | Availability target in basis points. Minimum 1. Maximum 10000. Default 9990 |

Example body:

~~~json
{
  "name": "Example name",
  "description": "No description provided",
  "tier": "standard",
  "targetBps": 9990
}
~~~

Client method: client.createService(body, options?).

### getService

Read service details.

~~~http
GET /api/services/{id}
Authorization: Bearer <API_TOKEN>
~~~

Path parameter id: resource identifier returned by a creation operation.

Client method: client.getService(id, options?).

### updateService

Update service objectives.

~~~http
PATCH /api/services/{id}
Authorization: Bearer <API_TOKEN>
Content-Type: application/json
Idempotency-Key: <unique-logical-request-key>
~~~

Path parameter id: resource identifier returned by a creation operation.

| Field | Type | Required | Constraints and meaning |
| --- | --- | --- | --- |
| description | string | Yes | Service responsibilities. Max length 2000. Default "No description provided" |
| targetBps | integer | Yes | Availability target in basis points. Minimum 1. Maximum 10000. Default 9990 |
| revision | integer | Yes | Expected current revision. Minimum 1. Maximum 1000000000 |

Example body:

~~~json
{
  "description": "No description provided",
  "targetBps": 9990,
  "revision": 1
}
~~~

Client method: client.updateService(id, body, options?).

### listMonitors

List heartbeat monitors.

~~~http
GET /api/monitors
Authorization: Bearer <API_TOKEN>
~~~

Pagination: append ?limit=50&offset=0. Increase offset by the number of returned items until it reaches total. Concurrent writes can change offset-based results.

Client method: client.listMonitors(options?).

### createMonitor

Create a heartbeat monitor.

~~~http
POST /api/monitors
Authorization: Bearer <API_TOKEN>
Content-Type: application/json
Idempotency-Key: <unique-logical-request-key>
~~~

| Field | Type | Required | Constraints and meaning |
| --- | --- | --- | --- |
| serviceId | string | Yes | Resource identifier. Max length 80 |
| name | string | Yes | Monitor name. Max length 200 |
| intervalMs | integer | No | Expected heartbeat interval. Minimum 1000. Maximum 86400000. Default 60000 |
| graceMs | integer | No | Allowed heartbeat lateness. Minimum 0. Maximum 86400000. Default 10000 |
| failureThreshold | integer | No | Consecutive failing samples to open an incident. Minimum 1. Maximum 100. Default 3 |
| recoveryThreshold | integer | No | Consecutive successful samples to resolve. Minimum 1. Maximum 100. Default 2 |

Example body:

~~~json
{
  "serviceId": "replace-with-resource-serviceid",
  "name": "Example name",
  "intervalMs": 60000,
  "graceMs": 10000,
  "failureThreshold": 3,
  "recoveryThreshold": 2
}
~~~

Client method: client.createMonitor(body, options?).

### controlMonitor

Enable or disable monitoring.

~~~http
PATCH /api/monitors/{id}
Authorization: Bearer <API_TOKEN>
Content-Type: application/json
Idempotency-Key: <unique-logical-request-key>
~~~

Path parameter id: resource identifier returned by a creation operation.

| Field | Type | Required | Constraints and meaning |
| --- | --- | --- | --- |
| enabled | boolean | Yes | Enable incident evaluation |
| revision | integer | Yes | Expected current revision. Minimum 1. Maximum 1000000000 |

Example body:

~~~json
{
  "enabled": true,
  "revision": 1
}
~~~

Client method: client.controlMonitor(id, body, options?).

### submitSample

Submit a heartbeat observation.

~~~http
POST /api/monitors/{id}/samples
Authorization: Bearer <API_TOKEN>
Content-Type: application/json
Idempotency-Key: <unique-logical-request-key>
~~~

Path parameter id: resource identifier returned by a creation operation.

| Field | Type | Required | Constraints and meaning |
| --- | --- | --- | --- |
| ok | boolean | Yes | Whether the observed check succeeded |
| latencyMs | integer | No | Observed latency. Minimum 0. Maximum 3600000. Default 0 |
| message | string | No | Observation context. Max length 1000. Default "Heartbeat received" |

Example body:

~~~json
{
  "ok": true,
  "latencyMs": 0,
  "message": "Heartbeat received"
}
~~~

Client method: client.submitSample(id, body, options?).

### listSamples

List heartbeat observations.

~~~http
GET /api/samples
Authorization: Bearer <API_TOKEN>
~~~

Pagination: append ?limit=50&offset=0. Increase offset by the number of returned items until it reaches total. Concurrent writes can change offset-based results.

Client method: client.listSamples(options?).

### listIncidents

List incident records.

~~~http
GET /api/incidents
Authorization: Bearer <API_TOKEN>
~~~

Pagination: append ?limit=50&offset=0. Increase offset by the number of returned items until it reaches total. Concurrent writes can change offset-based results.

Client method: client.listIncidents(options?).

### createIncident

Open a manual incident.

~~~http
POST /api/incidents
Authorization: Bearer <API_TOKEN>
Content-Type: application/json
Idempotency-Key: <unique-logical-request-key>
~~~

| Field | Type | Required | Constraints and meaning |
| --- | --- | --- | --- |
| serviceId | string | Yes | Resource identifier. Max length 80 |
| title | string | Yes | Incident title. Max length 200 |
| severity | string | No | Incident urgency. Allowed: critical, major, minor. Max length 200. Default "major" |
| description | string | Yes | Initial impact and symptoms. Max length 4000 |

Example body:

~~~json
{
  "serviceId": "replace-with-resource-serviceid",
  "title": "Example title",
  "severity": "major",
  "description": "Example description"
}
~~~

Client method: client.createIncident(body, options?).

### getIncident

Read incident details.

~~~http
GET /api/incidents/{id}
Authorization: Bearer <API_TOKEN>
~~~

Path parameter id: resource identifier returned by a creation operation.

Client method: client.getIncident(id, options?).

### transitionIncident

Advance the incident lifecycle.

~~~http
POST /api/incidents/{id}/transition
Authorization: Bearer <API_TOKEN>
Content-Type: application/json
Idempotency-Key: <unique-logical-request-key>
~~~

Path parameter id: resource identifier returned by a creation operation.

| Field | Type | Required | Constraints and meaning |
| --- | --- | --- | --- |
| status | string | Yes | Next incident state. Allowed: acknowledged, investigating, monitoring, resolved. Max length 200 |
| message | string | Yes | Reason for this transition. Max length 4000 |
| revision | integer | Yes | Expected current revision. Minimum 1. Maximum 1000000000 |

Example body:

~~~json
{
  "status": "acknowledged",
  "message": "Example message",
  "revision": 1
}
~~~

Client method: client.transitionIncident(id, body, options?).

### addIncidentNote

Append a timeline update.

~~~http
POST /api/incidents/{id}/notes
Authorization: Bearer <API_TOKEN>
Content-Type: application/json
Idempotency-Key: <unique-logical-request-key>
~~~

Path parameter id: resource identifier returned by a creation operation.

| Field | Type | Required | Constraints and meaning |
| --- | --- | --- | --- |
| message | string | Yes | Timeline update. Max length 4000 |

Example body:

~~~json
{
  "message": "Example message"
}
~~~

Client method: client.addIncidentNote(id, body, options?).

### assignIncident

Assign an incident owner.

~~~http
POST /api/incidents/{id}/assign
Authorization: Bearer <API_TOKEN>
Content-Type: application/json
Idempotency-Key: <unique-logical-request-key>
~~~

Path parameter id: resource identifier returned by a creation operation.

| Field | Type | Required | Constraints and meaning |
| --- | --- | --- | --- |
| owner | string | Yes | Incident owner. Max length 200 |
| revision | integer | Yes | Expected current revision. Minimum 1. Maximum 1000000000 |

Example body:

~~~json
{
  "owner": "Example owner",
  "revision": 1
}
~~~

Client method: client.assignIncident(id, body, options?).

### incidentTimeline

Read incident audit timeline.

~~~http
GET /api/incidents/{id}/timeline
Authorization: Bearer <API_TOKEN>
~~~

Path parameter id: resource identifier returned by a creation operation.

Client method: client.incidentTimeline(id, options?).

### createPostmortem

Publish a resolved incident review.

~~~http
POST /api/incidents/{id}/postmortem
Authorization: Bearer <API_TOKEN>
Content-Type: application/json
Idempotency-Key: <unique-logical-request-key>
~~~

Path parameter id: resource identifier returned by a creation operation.

| Field | Type | Required | Constraints and meaning |
| --- | --- | --- | --- |
| summary | string | Yes | Customer impact summary. Max length 8000 |
| rootCause | string | Yes | Confirmed root cause. Max length 8000 |
| prevention | array | Yes | Max items 30 |

Example body:

~~~json
{
  "summary": "Example summary",
  "rootCause": "Example rootCause",
  "prevention": [
    "Example prevention"
  ]
}
~~~

Client method: client.createPostmortem(id, body, options?).

### listPostmortems

List incident reviews.

~~~http
GET /api/postmortems
Authorization: Bearer <API_TOKEN>
~~~

Pagination: append ?limit=50&offset=0. Increase offset by the number of returned items until it reaches total. Concurrent writes can change offset-based results.

Client method: client.listPostmortems(options?).

### listMaintenance

List maintenance windows.

~~~http
GET /api/maintenance
Authorization: Bearer <API_TOKEN>
~~~

Pagination: append ?limit=50&offset=0. Increase offset by the number of returned items until it reaches total. Concurrent writes can change offset-based results.

Client method: client.listMaintenance(options?).

### createMaintenance

Schedule a maintenance window.

~~~http
POST /api/maintenance
Authorization: Bearer <API_TOKEN>
Content-Type: application/json
Idempotency-Key: <unique-logical-request-key>
~~~

| Field | Type | Required | Constraints and meaning |
| --- | --- | --- | --- |
| serviceId | string | Yes | Resource identifier. Max length 80 |
| title | string | Yes | Maintenance description. Max length 200 |
| startsAt | integer | Yes | UTC Unix time in milliseconds. Minimum 0. Maximum 8640000000000000 |
| endsAt | integer | Yes | UTC Unix time in milliseconds. Minimum 0. Maximum 8640000000000000 |

Example body:

~~~json
{
  "serviceId": "replace-with-resource-serviceid",
  "title": "Example title",
  "startsAt": 1800000000000,
  "endsAt": 1800000060000
}
~~~

Client method: client.createMaintenance(body, options?).

### cancelMaintenance

Cancel a maintenance window.

~~~http
POST /api/maintenance/{id}/cancel
Authorization: Bearer <API_TOKEN>
Content-Type: application/json
Idempotency-Key: <unique-logical-request-key>
~~~

Path parameter id: resource identifier returned by a creation operation.

| Field | Type | Required | Constraints and meaning |
| --- | --- | --- | --- |
| None | object | Yes | Send an empty JSON object |

Example body:

~~~json
{}
~~~

Client method: client.cancelMaintenance(id, body, options?).

### createSubscriber

Register a notification subscriber.

~~~http
POST /api/subscribers
Authorization: Bearer <API_TOKEN>
Content-Type: application/json
Idempotency-Key: <unique-logical-request-key>
~~~

| Field | Type | Required | Constraints and meaning |
| --- | --- | --- | --- |
| name | string | Yes | Notification recipient label. Max length 200 |
| serviceIds | array | Yes | Max items 100 |

Example body:

~~~json
{
  "name": "Example name",
  "serviceIds": [
    "Example serviceIds"
  ]
}
~~~

Client method: client.createSubscriber(body, options?).

### listSubscribers

List notification subscribers.

~~~http
GET /api/subscribers
Authorization: Bearer <API_TOKEN>
~~~

Pagination: append ?limit=50&offset=0. Increase offset by the number of returned items until it reaches total. Concurrent writes can change offset-based results.

Client method: client.listSubscribers(options?).

### listNotifications

List the notification outbox.

~~~http
GET /api/notifications
Authorization: Bearer <API_TOKEN>
~~~

Pagination: append ?limit=50&offset=0. Increase offset by the number of returned items until it reaches total. Concurrent writes can change offset-based results.

Client method: client.listNotifications(options?).

### recordDelivery

Record an external delivery outcome.

~~~http
PATCH /api/notifications/{id}
Authorization: Bearer <API_TOKEN>
Content-Type: application/json
Idempotency-Key: <unique-logical-request-key>
~~~

Path parameter id: resource identifier returned by a creation operation.

| Field | Type | Required | Constraints and meaning |
| --- | --- | --- | --- |
| status | string | Yes | Delivery outcome. Allowed: delivered, failed. Max length 200 |
| detail | string | Yes | Delivery receipt or failure context. Max length 1000 |
| revision | integer | Yes | Expected current revision. Minimum 1. Maximum 1000000000 |

Example body:

~~~json
{
  "status": "delivered",
  "detail": "Example detail",
  "revision": 1
}
~~~

Client method: client.recordDelivery(id, body, options?).

### serviceStatus

Summarize current service health.

~~~http
GET /api/status
Authorization: Bearer <API_TOKEN>
~~~

Client method: client.serviceStatus(options?).

### reliabilityReport

Calculate incident-based availability.

~~~http
GET /api/services/{id}/reliability
Authorization: Bearer <API_TOKEN>
~~~

Path parameter id: resource identifier returned by a creation operation.

Client method: client.reliabilityReport(id, options?).

### evaluateDeadlines

Evaluate missing heartbeat deadlines.

~~~http
POST /api/tick
Authorization: Bearer <API_TOKEN>
Content-Type: application/json
Idempotency-Key: <unique-logical-request-key>
~~~

| Field | Type | Required | Constraints and meaning |
| --- | --- | --- | --- |
| None | object | Yes | Send an empty JSON object |

Example body:

~~~json
{}
~~~

Client method: client.evaluateDeadlines(body, options?).

