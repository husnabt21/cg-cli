import { MAX_NAME_LENGTH } from './config';
import { ValidationError } from './errors';

export function sanitizeName(name: string): string {
  return name.trim().slice(0, MAX_NAME_LENGTH);
}

export function validateEventInput(input: { name?: string; ownerId?: string }): void {
  if (!input.name || input.name.trim().length === 0) {
    throw new ValidationError('name is required');
  }
  if (!input.ownerId) {
    throw new ValidationError('ownerId is required');
  }
  if (input.name.length > MAX_NAME_LENGTH) {
    throw new ValidationError('name is too long');
  }
}
