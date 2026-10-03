import { Post } from './model';
import { insertPost, findPostById, updatePost, deletePost, listPosts } from './db';
import { sanitizeName, validatePostInput } from './validators';
import { loadConfig } from './config';
import { AppError } from './errors';

const cache = new Map<string, Post>();

export class PostService {
  create(input: { name: string; ownerId: string }): Post {
    validatePostInput(input);
    const record: Post = {
      id: String(Date.now()),
      name: sanitizeName(input.name),
      ownerId: input.ownerId,
      createdAt: Date.now(),
    };
    return insertPost(record);
  }

  get(id: string): Post {
    if (loadConfig().cacheEnabled && cache.has(id)) {
      return cache.get(id) as Post;
    }
    const record = findPostById(id);
    cache.set(id, record);
    return record;
  }

  rename(id: string, name: string): Post {
    validatePostInput({ name, ownerId: id });
    cache.delete(id);
    return updatePost(id, { name: sanitizeName(name) });
  }

  remove(id: string): void {
    try {
      deletePost(id);
      cache.delete(id);
    } catch (err) {
      throw new AppError('could not remove', 500);
    }
  }

  countByOwner(ownerId: string): number {
    let total = 0;
    for (const record of listPosts()) {
      if (record.ownerId === ownerId) {
        total++;
      }
    }
    return total;
  }
}
