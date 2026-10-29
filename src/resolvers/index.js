import Resolver from '@forge/resolver';
import { getRegister, saveRegister, syncGraph, syncGraphQuietly } from '../graphsync.js';
import { UserError, draftReport, getCase, getSettings, listCases, markSubmitted, recurringCheck, rememberSite, saveSettings, updateFacts } from '../service.js';

const resolver = new Resolver();

const issueKeyOf = (req) => (req.payload && req.payload.issueKey) || (req.context.extension && req.context.extension.issue && req.context.extension.issue.key);

const safe = (fn) => async (req) => {
  try {
    await rememberSite(req.context.siteUrl);
    return { ok: true, data: await fn(req) };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: 'Something went wrong. Check the app logs.' };
  }
};

resolver.define('getCase', safe((req) => getCase(issueKeyOf(req))));

resolver.define('updateFacts', safe(async (req) => {
  const c = await updateFacts(issueKeyOf(req), req.payload.patch, req.context.accountId);
  if (c.changed.includes('providers')) await syncGraphQuietly();
  return c;
}));

resolver.define('markSubmitted', safe((req) => markSubmitted(issueKeyOf(req), req.payload.type, req.payload.at, req.context.accountId)));

resolver.define('draftReport', safe((req) => draftReport(issueKeyOf(req), req.payload.type, req.context.accountId)));

resolver.define('recurringCheck', safe((req) => recurringCheck(issueKeyOf(req))));

resolver.define('listCases', safe((req) => listCases({ onlyMajor: Boolean(req.payload && req.payload.onlyMajor) })));

resolver.define('getSettings', safe(() => getSettings()));

const adminOnly = (req) => {
  if (req.context.moduleKey !== 'dora-settings') throw new UserError('This can only be changed from the Jira admin page.');
};

resolver.define('saveSettings', safe((req) => {
  adminOnly(req);
  return saveSettings(req.payload, req.context.siteUrl);
}));

resolver.define('getRegister', safe(() => getRegister()));

resolver.define('saveRegister', safe((req) => {
  adminOnly(req);
  return saveRegister(req.payload.csv);
}));

resolver.define('syncGraph', safe((req) => {
  adminOnly(req);
  return syncGraph();
}));

export const handler = resolver.getDefinitions();
