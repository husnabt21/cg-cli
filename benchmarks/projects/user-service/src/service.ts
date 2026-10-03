import { Profile } from './model';
import { insertProfile, findProfileById, updateProfile, deleteProfile, listProfiles } from './db';
import { sanitizeName, validateProfileInput } from './validators';
import { loadConfig } from './config';
import { AppError } from './errors';

const cache = new Map<string, Profile>();

export class ProfileService {
  create(input: { name: string; ownerId: string }): Profile {
    validateProfileInput(input);
    const record: Profile = {
      id: String(Date.now()),
      name: sanitizeName(input.name),
      ownerId: input.ownerId,
      createdAt: Date.now(),
    };
    return insertProfile(record);
  }

  get(id: string): Profile {
    if (loadConfig().cacheEnabled && cache.has(id)) {
      return cache.get(id) as Profile;
    }
    const record = findProfileById(id);
    cache.set(id, record);
    return record;
  }

  rename(id: string, name: string): Profile {
    validateProfileInput({ name, ownerId: id });
    cache.delete(id);
    return updateProfile(id, { name: sanitizeName(name) });
  }

  remove(id: string): void {
    try {
      deleteProfile(id);
      cache.delete(id);
    } catch (err) {
      throw new AppError('could not remove', 500);
    }
  }

  countByOwner(ownerId: string): number {
    let total = 0;
    for (const record of listProfiles()) {
      if (record.ownerId === ownerId) {
        total++;
      }
    }
    return total;
  }
}
