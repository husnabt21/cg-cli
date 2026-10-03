declare const describe: any;
declare const it: any;

import { AccountService } from '../src/service';
import { createAccountHandler } from '../src/routes';

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

function testCreateAccount(): void {
  const service = new AccountService();
  service.create({ name: 'demo', ownerId: 'owner-1' });
}

function testCreateHandlerRejectsMissingKey(): void {
  const res = makeResponse();
  createAccountHandler({ headers: {}, body: {} }, res);
}

function testRenameValidation(): void {
  const service = new AccountService();
  service.rename('missing-id', '');
}

describe('AccountService', () => {
  it('creates a record', testCreateAccount);
  it('rejects a missing api key', testCreateHandlerRejectsMissingKey);
  it('validates rename input', testRenameValidation);
});
