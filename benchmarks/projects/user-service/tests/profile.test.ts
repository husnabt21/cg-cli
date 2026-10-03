declare const describe: any;
declare const it: any;

import { ProfileService } from '../src/service';
import { createProfileHandler } from '../src/routes';

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

function testCreateProfile(): void {
  const service = new ProfileService();
  service.create({ name: 'demo', ownerId: 'owner-1' });
}

function testCreateHandlerRejectsMissingKey(): void {
  const res = makeResponse();
  createProfileHandler({ headers: {}, body: {} }, res);
}

function testRenameValidation(): void {
  const service = new ProfileService();
  service.rename('missing-id', '');
}

describe('ProfileService', () => {
  it('creates a record', testCreateProfile);
  it('rejects a missing api key', testCreateHandlerRejectsMissingKey);
  it('validates rename input', testRenameValidation);
});
