import { loadConfig } from './config';
import { NotFoundError } from './errors';
import { Post } from './model';

const records: Post[] = [];
let connected = false;

export function connectDb(): void {
  const config = loadConfig();
  connected = config.dbUrl.length > 0;
}

export function insertPost(record: Post): Post {
  if (!connected) {
    connectDb();
  }
  records.push(record);
  return record;
}

export function findPostById(id: string): Post {
  const found = records.find((r) => r.id === id);
  if (!found) {
    throw new NotFoundError('Post not found');
  }
  return found;
}

export function updatePost(id: string, changes: Partial<Post>): Post {
  const record = findPostById(id);
  Object.assign(record, changes);
  return record;
}

export function deletePost(id: string): void {
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) {
    throw new NotFoundError('Post not found');
  }
  records.splice(index, 1);
}

export function listPosts(): Post[] {
  return records.slice();
}
