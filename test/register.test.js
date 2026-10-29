import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchProvider, parseRegister, providerId, toGraphObject } from '../src/register.js';

const CSV = [
  'Provider,LEI,Service,Functions,Criticality,ContractRef,Country',
  'CardNet Processing (fictional),5299000EXAMPLE0CARD01,Card authorisation,"Card payments, ATM",Critical,CTR-1,GR',
  'Nimbus Cloud,5299000EXAMPLE0NIMB02,IaaS,Internet banking; Mobile banking,Critical,CTR-2,IE',
  ',missing provider,,,,,',
  'cardnet processing (fictional),dup,,,,,',
].join('\n');

test('the register parses quoted cells and keeps semicolons inside comma-separated cells', () => {
  const { entries, errors } = parseRegister(CSV);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].functions, 'Card payments, ATM');
  assert.equal(entries[1].functions, 'Internet banking; Mobile banking');
  assert.equal(entries[1].country, 'IE');
  assert.equal(errors.length, 2);
});

test('a semicolon-separated register is detected from its header', () => {
  const { entries } = parseRegister('provider;service;criticality\nAcme Hosting;IaaS, backups;Critical');
  assert.equal(entries[0].service, 'IaaS, backups');
  assert.equal(entries[0].criticality, 'Critical');
});

test('a register without a provider column is rejected with an explanation', () => {
  const { entries, errors } = parseRegister('name,lei\nX,Y');
  assert.equal(entries.length, 0);
  assert.match(errors[0], /provider/);
});

test('providers match incident facts regardless of case and spacing', () => {
  const { entries } = parseRegister(CSV);
  assert.equal(matchProvider(entries, '  CARDNET processing (Fictional) ').provider, 'CardNet Processing (fictional)');
  assert.equal(providerId('Nimbus Cloud'), 'ict-provider-nimbus-cloud');
});

test('graph objects are documents linked to the incidents that involved the provider', () => {
  const { entries } = parseRegister(CSV);
  const o = toGraphObject(entries[0], ['INC-1', 'INC-4'], 'https://example.atlassian.net', 42);
  assert.equal(o.id, 'ict-provider-cardnet-processing-fictional');
  assert.deepEqual(o.associations.set[0].values, ['INC-1', 'INC-4']);
  assert.match(o['atlassian:document'].content.text, /Criticality: Critical/);
  assert.equal(o.updateSequenceNumber, 42);
  assert.equal(toGraphObject(entries[1], [], '', 1).associations, undefined);
});

test('a provider named without its parenthetical qualifier still matches the register', () => {
  const { entries } = parseRegister(CSV);
  assert.equal(matchProvider(entries, 'CardNet Processing').provider, 'CardNet Processing (fictional)');
  assert.equal(matchProvider(entries, 'Unknown Cloud'), null);
});
