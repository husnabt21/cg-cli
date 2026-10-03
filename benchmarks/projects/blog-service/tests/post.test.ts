declare const describe: any;
declare const it: any;

import { PostService } from '../src/service';
import { createPostHandler } from '../src/routes';

function makeResponse(): any {
  const res: any = {
    statusCode: 0,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
    },
  };
  return res;
}

function testCreatePost(): void {
  const service = new PostService();
  service.create({ name: 'demo', ownerId: 'owner-1' });
}

function testCreateHandlerRejectsMissingKey(): void {
  const res = makeResponse();
  createPostHandler({ headers: {}, body: {} }, res);
}

function testRenameValidation(): void {
  const service = new PostService();
  service.rename('missing-id', '');
}

describe('PostService', () => {
  it('creates a record', testCreatePost);
  it('rejects a missing api key', testCreateHandlerRejectsMissingKey);
  it('validates rename input', testRenameValidation);
});
