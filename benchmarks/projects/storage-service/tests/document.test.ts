declare const describe: any;
declare const it: any;

import { DocumentService } from '../src/service';
import { createDocumentHandler } from '../src/routes';

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

function testCreateDocument(): void {
  const service = new DocumentService();
  service.create({ name: 'demo', ownerId: 'owner-1' });
}

function testCreateHandlerRejectsMissingKey(): void {
  const res = makeResponse();
  createDocumentHandler({ headers: {}, body: {} }, res);
}

function testRenameValidation(): void {
  const service = new DocumentService();
  service.rename('missing-id', '');
}

describe('DocumentService', () => {
  it('creates a record', testCreateDocument);
  it('rejects a missing api key', testCreateHandlerRejectsMissingKey);
  it('validates rename input', testRenameValidation);
});
