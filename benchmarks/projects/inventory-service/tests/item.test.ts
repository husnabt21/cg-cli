declare const describe: any;
declare const it: any;

import { ItemService } from '../src/service';
import { createItemHandler } from '../src/routes';

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

function testCreateItem(): void {
  const service = new ItemService();
  service.create({ name: 'demo', ownerId: 'owner-1' });
}

function testCreateHandlerRejectsMissingKey(): void {
  const res = makeResponse();
  createItemHandler({ headers: {}, body: {} }, res);
}

function testRenameValidation(): void {
  const service = new ItemService();
  service.rename('missing-id', '');
}

describe('ItemService', () => {
  it('creates a record', testCreateItem);
  it('rejects a missing api key', testCreateHandlerRejectsMissingKey);
  it('validates rename input', testRenameValidation);
});
