const problem = {
  type: 'object', required: ['error'],
  properties: { error: {
    type: 'object', required: ['code', 'message', 'requestId'],
    properties: { code: { type: 'string' }, message: { type: 'string' }, requestId: { type: 'string' }, details: { type: 'object' } },
  } },
};

export function openapi(title, routes) {
  const paths = {};
  for (const [method, route, operationId, summary, schema] of routes) {
    const path = route.replace(/:([A-Za-z]+)/g, '{$1}');
    const parameters = [...route.matchAll(/:([A-Za-z]+)/g)].map(match => ({
      name: match[1], in: 'path', required: true, description: 'Resource identifier',
      schema: { type: 'string', minLength: 1, maxLength: 80 },
    }));
    if (method === 'GET') {
      for (const [name, description, minimum, maximum, value] of [
        ['limit', 'Maximum number of records for list responses', 1, 200, 50],
        ['offset', 'Zero-based record offset for list responses', 0, 1_000_000_000, 0],
      ]) parameters.push({ name, in: 'query', description, schema: { type: 'integer', minimum, maximum, default: value } });
    } else {
      parameters.push({
        name: 'Idempotency-Key', in: 'header', required: false,
        description: 'Replay the same response for an identical request within 24 hours. Reusing a key with different content returns 409.',
        schema: { type: 'string', minLength: 1, maxLength: 120, pattern: '^[A-Za-z0-9_.:-]+$' },
      });
    }
    const responses = {
      200: { description: 'Operation succeeded. Lists return items, total, limit, and offset.', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
    };
    for (const [status, description] of Object.entries({
      400: 'Malformed request or invalid JSON', 401: 'Missing or invalid bearer token',
      404: 'Resource not found', 409: 'State, revision, or idempotency conflict',
      413: 'Request body exceeds 64 KiB', 415: 'Expected application/json',
      422: 'Schema validation or domain constraint failed', 429: 'Request rate exceeded',
      500: 'Unexpected server error',
    })) responses[status] = { description, content: { 'application/json': { schema: { $ref: '#/components/schemas/Problem' } } } };
    const operation = { operationId, summary, tags: [route.split('/')[2]], security: [{ bearerAuth: [] }], parameters, responses };
    if (schema) operation.requestBody = { required: true, content: { 'application/json': { schema } } };
    (paths[path] ??= {})[method.toLowerCase()] = operation;
  }
  return {
    openapi: '3.1.0', info: { title, version: '1.0.0', description: 'Single-tenant operational API. All mutations are atomic; timestamps are UTC Unix milliseconds.' },
    servers: [{ url: '/' }], paths,
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } }, schemas: { Problem: problem } },
  };
}
