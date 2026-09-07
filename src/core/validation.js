import { AppError } from './errors.js';

export const text = (description, options = {}) => ({ type: 'string', minLength: 1, maxLength: 200, description, ...options });
export const integer = (description, options = {}) => ({ type: 'integer', minimum: 0, maximum: 1_000_000_000, description, ...options });
export const boolean = (description, options = {}) => ({ type: 'boolean', description, ...options });
export const object = (properties, required = Object.keys(properties), description = '') => ({
  type: 'object', properties, required, additionalProperties: false, description,
});
export const list = (items, options = {}) => ({ type: 'array', items, minItems: 1, maxItems: 100, ...options });
export const enumeration = (description, values, options = {}) => text(description, { enum: values, ...options });

function invalid(path, message) {
  throw new AppError(422, 'validation_error', path + ': ' + message, { path });
}

export function validate(schema, value, path = 'body') {
  if (value === undefined && schema.default !== undefined) return structuredClone(schema.default);
  if (schema.type === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(path, 'expected an object');
    const result = {};
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties, key) && schema.additionalProperties === false) invalid(path + '.' + key, 'unknown field');
    }
    for (const [key, child] of Object.entries(schema.properties)) {
      if (!Object.hasOwn(value, key) && child.default === undefined) {
        if (schema.required.includes(key)) invalid(path + '.' + key, 'required field');
      } else {
        result[key] = validate(child, value[key], path + '.' + key);
      }
    }
    return result;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) invalid(path, 'expected an array');
    if (value.length < schema.minItems || value.length > schema.maxItems) invalid(path, 'array length out of range');
    return value.map((item, index) => validate(schema.items, item, path + '[' + index + ']'));
  }
  if (schema.type === 'integer') {
    if (!Number.isSafeInteger(value)) invalid(path, 'expected a safe integer');
    if (value < schema.minimum || value > schema.maximum) invalid(path, 'integer out of range');
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') invalid(path, 'expected a string');
    if (value.length < schema.minLength || value.length > schema.maxLength) invalid(path, 'string length out of range');
    if (value.trim() !== value || value.includes('\u0000')) invalid(path, 'leading/trailing whitespace and NUL are not allowed');
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) invalid(path, 'invalid format');
  } else if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') invalid(path, 'expected a boolean');
  } else {
    invalid(path, 'unsupported schema type');
  }
  if (schema.enum && !schema.enum.includes(value)) invalid(path, 'value is not an allowed option');
  return value;
}

export function page(query, records) {
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isSafeInteger(offset) || offset < 0) {
    throw new AppError(422, 'invalid_pagination', 'limit must be 1–200 and offset must be a nonnegative integer');
  }
  return { items: records.slice(offset, offset + limit), total: records.length, limit, offset };
}
