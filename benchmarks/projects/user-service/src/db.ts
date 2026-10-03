import { loadConfig } from './config';
import { NotFoundError } from './errors';
import { Profile } from './model';

const records: Profile[] = [];
let connected = false;

export function connectDb(): void {
  const config = loadConfig();
  connected = config.dbUrl.length > 0;
}

export function insertProfile(record: Profile): Profile {
  if (!connected) {
    connectDb();
  }
  records.push(record);
  return record;
}

export function findProfileById(id: string): Profile {
  const found = records.find((r) => r.id === id);
  if (!found) {
    throw new NotFoundError('Profile not found');
  }
  return found;
}

export function updateProfile(id: string, changes: Partial<Profile>): Profile {
  const record = findProfileById(id);
  Object.assign(record, changes);
  return record;
}

export function deleteProfile(id: string): void {
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) {
    throw new NotFoundError('Profile not found');
  }
  records.splice(index, 1);
}

export function listProfiles(): Profile[] {
  return records.slice();
}
