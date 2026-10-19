// A wallet removed from the list takes its app data (row, contacts) with it; wallet files are never
// touched (this code has no file access at all). npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { removeAccountData, forgetLeftoverAccountData, isListedAccount } from '../src/shared/accountData.js';

//a minimal stand-in for the JsStore calls used: select/remove with an equality where
function fakeDb(tables){
  const match = (row, where) => Object.entries(where).every(([k, v]) => row[k] === v);
  return {
    tables,
    async select({ from, where }){ return tables[from].filter(r => match(r, where)); },
    async remove({ from, where }){
      const before = tables[from].length;
      tables[from] = tables[from].filter(r => !match(r, where));
      return before - tables[from].length;
    },
  };
}

function seed(){
  return fakeDb({
    User: [
      { id: 1, account: 'alpha', name: 'Alice' },
      { id: 2, account: 'test', name: 'Tess' },
    ],
    Addressbook: [
      { id: 10, user_id: 1, name: 'Carol Contact' },
      { id: 11, user_id: 2, name: 'Old friend' },
      { id: 12, user_id: 2, name: 'Old shop' },
    ],
    AddressTransactions: [
      { id: 20, user_id: 1, slateid: 'a', type: 'send', address: 10 },
      { id: 21, user_id: 2, slateid: 'b', type: 'send', address: 11 },
    ],
  });
}

const quiet = { log(){} };
const list = (...names) => ({ account_dirs: names.map(account => ({ account, userhomedir: '/w/' + account, network: 'mainnet' })) });

test('removes the row, contacts and transaction links of that account only', async () => {
  const db = seed();
  assert.deepEqual(await removeAccountData(db, 'test'), { User: 1, Addressbook: 2, AddressTransactions: 1 });
  assert.deepEqual(db.tables.User.map(u => u.account), ['alpha']);
  assert.deepEqual(db.tables.Addressbook.map(a => a.name), ['Carol Contact']);
  assert.deepEqual(db.tables.AddressTransactions.map(t => t.id), [20]);
});

test('an account without a row, or no account name, removes nothing', async () => {
  const db = seed();
  assert.deepEqual(await removeAccountData(db, 'nobody'), { User: 0, Addressbook: 0, AddressTransactions: 0 });
  assert.deepEqual(await removeAccountData(db, ''), { User: 0, Addressbook: 0, AddressTransactions: 0 });
  assert.equal(db.tables.Addressbook.length, 3);
});

test('Create/Restore of a name no longer in the list: the new wallet starts clean (matrix C2)', async () => {
  const db = seed();
  const userService = { removeAccountData: (a) => removeAccountData(db, a) };
  const r = await forgetLeftoverAccountData({ appConfig: list('alpha'), userService, account: 'test', log: quiet });
  assert.equal(r.User, 1);
  assert.equal(db.tables.User.find(u => u.account == 'test'), undefined);
  //the other wallet keeps its contacts
  assert.deepEqual(db.tables.Addressbook.map(a => a.name), ['Carol Contact']);
});

test('a name that is still listed is never touched', async () => {
  const db = seed();
  const userService = { removeAccountData: (a) => removeAccountData(db, a) };
  assert.equal(await forgetLeftoverAccountData({ appConfig: list('alpha', 'test'), userService, account: 'test', log: quiet }), null);
  assert.equal(db.tables.User.length, 2);
  assert.equal(db.tables.Addressbook.length, 3);
});

test('a failing database does not stop the wallet from being created', async () => {
  const logged = [];
  const userService = { removeAccountData: async () => { throw new Error('idb closed'); } };
  assert.equal(await forgetLeftoverAccountData({ appConfig: list(), userService, account: 'test', log: { log: (m) => logged.push(m) } }), null);
  assert.equal(logged.length, 1);
});

test('isListedAccount', () => {
  assert.equal(isListedAccount(list('alpha'), 'alpha'), true);
  assert.equal(isListedAccount(list('alpha'), 'test'), false);
  assert.equal(isListedAccount({}, 'alpha'), false);
  assert.equal(isListedAccount(undefined, 'alpha'), false);
});
