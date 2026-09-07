const byId = id => document.getElementById(id);
let token = '';
let selected = null;
let result = null;

function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

function feedback(message, error = false) {
  byId('feedback').textContent = message;
  byId('feedback').dataset.error = String(error);
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options, headers: { authorization: 'Bearer ' + token, ...(options.body ? { 'content-type': 'application/json' } : {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? 'Request failed');
  return data;
}

function sample(schema) {
  if (schema.default !== undefined) return schema.default;
  if (schema.enum) return schema.enum[0];
  if (schema.type === 'array') return [sample(schema.items)];
  if (schema.type === 'object') return Object.fromEntries(schema.required.map(key => [key, sample(schema.properties[key])]));
  if (schema.type === 'integer') return Math.max(1, schema.minimum ?? 0);
  if (schema.type === 'boolean') return false;
  return '';
}

function field(name, schema, required, source) {
  const wrapper = element('div', undefined, { class: 'field' });
  const id = source + '-' + name;
  const label = element('label', name + (required ? ' *' : ''), { for: id });
  let input;
  if (schema.enum) {
    input = element('select');
    for (const value of schema.enum) input.append(element('option', value, { value }));
  } else if (['array', 'object'].includes(schema.type)) {
    input = element('textarea');
    input.value = JSON.stringify(sample(schema), null, 2);
  } else {
    input = element('input', undefined, { type: schema.type === 'integer' ? 'number' : schema.type === 'boolean' ? 'checkbox' : 'text' });
    if (schema.minimum !== undefined) input.min = schema.minimum;
    if (schema.maximum !== undefined) input.max = schema.maximum;
    if (schema.maxLength !== undefined) input.maxLength = schema.maxLength;
    if (schema.minLength !== undefined) input.minLength = schema.minLength;
    if (schema.pattern) input.pattern = schema.pattern;
    if (schema.type === 'integer') input.step = '1';
  }
  input.id = id;
  input.dataset.name = name;
  input.dataset.source = source;
  input.dataset.type = schema.type;
  if (schema.type !== 'boolean') input.required = required;
  if (schema.default !== undefined) {
    if (schema.type === 'boolean') input.checked = schema.default;
    else input.value = schema.default;
  }
  wrapper.append(label, input);
  if (schema.description) wrapper.append(element('small', schema.description));
  return wrapper;
}

function selectOperation(operation, button) {
  selected = operation;
  for (const item of document.querySelectorAll('nav button')) item.removeAttribute('aria-current');
  button.setAttribute('aria-current', 'true');
  byId('method').textContent = operation.method.toUpperCase() + ' ' + operation.path;
  byId('operation-title').textContent = operation.spec.summary;
  byId('operation-description').textContent = operation.method === 'get' ? 'Read current records. List responses support pagination.' : 'Changes are saved atomically and recorded in the activity log.';
  byId('fields').replaceChildren();
  for (const parameter of operation.spec.parameters) {
    if (!['path', 'query'].includes(parameter.in)) continue;
    byId('fields').append(field(parameter.name, parameter.schema, parameter.required ?? false, parameter.in));
  }
  const schema = operation.spec.requestBody?.content['application/json'].schema;
  if (schema) for (const [name, property] of Object.entries(schema.properties)) {
    byId('fields').append(field(name, property, schema.required.includes(name), 'body'));
  }
  byId('execute').disabled = false;
}

function render(data) {
  result = data;
  byId('result').textContent = JSON.stringify(data, null, 2);
  byId('table').replaceChildren();
  const rows = Array.isArray(data.items) ? data.items : [data];
  if (!rows.length) { byId('table').append(element('p', 'No records yet.')); return; }
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))].slice(0, 12);
  const table = element('table');
  const head = element('thead');
  const heading = element('tr');
  columns.forEach(column => heading.append(element('th', column, { scope: 'col' })));
  head.append(heading);
  const body = element('tbody');
  for (const row of rows) {
    const tr = element('tr');
    for (const column of columns) {
      const value = row[column];
      tr.append(element('td', value === null || value === undefined ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value)));
    }
    body.append(tr);
  }
  table.append(head, body);
  byId('table').append(table);
}

byId('connect').addEventListener('submit', async event => {
  event.preventDefault();
  token = byId('token').value;
  try {
    const document = await request('/openapi.json');
    byId('operations').replaceChildren();
    const groups = new Map();
    for (const [path, methods] of Object.entries(document.paths)) {
      for (const [method, spec] of Object.entries(methods)) {
        const group = spec.tags[0];
        if (!groups.has(group)) {
          const section = element('section');
          section.append(element('h3', group));
          groups.set(group, section);
          byId('operations').append(section);
        }
        const button = element('button', spec.summary, { type: 'button' });
        button.addEventListener('click', () => selectOperation({ path, method, spec }, button));
        groups.get(group).append(button);
      }
    }
    byId('connection').textContent = 'Connected';
    byId('token').value = '';
    feedback('Connected. Choose an operation to begin.');
    await activity();
  } catch (error) { token = ''; feedback(error.message, true); }
});

byId('disconnect').addEventListener('click', () => {
  token = '';
  selected = null;
  result = null;
  byId('token').value = '';
  byId('operations').replaceChildren();
  byId('fields').replaceChildren();
  byId('table').replaceChildren();
  byId('events').replaceChildren();
  byId('result').textContent = 'Disconnected.';
  byId('execute').disabled = true;
  byId('connection').textContent = 'Disconnected';
  feedback('Access token cleared.');
});

byId('action').addEventListener('submit', async event => {
  event.preventDefault();
  if (!selected || !token) return;
  byId('execute').disabled = true;
  try {
    let path = selected.path;
    const query = new URLSearchParams();
    const body = {};
    for (const input of byId('fields').querySelectorAll('input,select,textarea')) {
      if (input.value === '' && input.dataset.type !== 'boolean') continue;
      const name = input.dataset.name;
      if (input.dataset.source === 'path') path = path.replace('{' + name + '}', encodeURIComponent(input.value));
      else if (input.dataset.source === 'query') query.set(name, input.value);
      else body[name] = input.dataset.type === 'boolean' ? input.checked : input.dataset.type === 'integer' ? Number(input.value) : ['array', 'object'].includes(input.dataset.type) ? JSON.parse(input.value) : input.value;
    }
    const data = await request(path + (query.size ? '?' + query : ''), {
      method: selected.method.toUpperCase(), ...(selected.method !== 'get' ? { body: JSON.stringify(body) } : {}),
    });
    render(data);
    feedback('Operation completed successfully.');
    if (selected.method !== 'get') await activity();
  } catch (error) { feedback(error.message, true); }
  finally { byId('execute').disabled = !selected || !token; }
});

async function activity() {
  if (!token) return;
  const data = await request('/api/events?limit=200');
  byId('events').replaceChildren();
  for (const item of data.items.slice(-20).reverse()) {
    byId('events').append(element('li', new Date(item.occurredAt).toLocaleString() + ' · ' + item.type + ' · ' + item.resourceId));
  }
  if (!data.items.length) byId('events').append(element('li', 'No activity yet.'));
}
byId('refresh').addEventListener('click', () => activity().catch(error => feedback(error.message, true)));
byId('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(JSON.stringify(result, null, 2)); feedback('JSON copied.'); }
  catch { feedback('Clipboard unavailable. Copy from the Response JSON section.', true); }
});
