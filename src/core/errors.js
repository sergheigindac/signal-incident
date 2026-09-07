export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function ensure(condition, status, code, message) {
  if (!condition) throw new AppError(status, code, message);
}

export function missing(resource) {
  return new AppError(404, 'not_found', resource + ' was not found');
}
