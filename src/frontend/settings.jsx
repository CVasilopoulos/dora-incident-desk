import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Inline,
  DynamicTable,
  Heading,
  Label,
  LoadingButton,
  Lozenge,
  SectionMessage,
  Spinner,
  Stack,
  Text,
  TextArea,
  Textfield,
  Button,
  xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const card = xcss({ padding: 'space.200', borderRadius: 'border.radius', backgroundColor: 'elevation.surface.sunken' });

const fmt = (iso) => (iso ? `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC` : '–');

const SAMPLE = [
  'provider,lei,service,functions,criticality,contractRef,country',
  'CardNet Processing (fictional),5299000EXAMPLE0CARD01,Card authorisation and clearing,Card payments,Critical,CTR-2024-017,GR',
  'Nimbus Cloud Hosting (fictional),5299000EXAMPLE0NIMB02,IaaS hosting for core banking,Internet banking; Mobile banking,Critical,CTR-2023-104,IE',
  'SecureID Services (fictional),5299000EXAMPLE0SECI03,Identity and access management,Treasury; Internet banking,Important,CTR-2025-008,CY',
  'MailBridge (fictional),5299000EXAMPLE0MAIL04,Customer email delivery,Customer communication,Non-critical,CTR-2022-210,DE',
].join('\n');

function Register() {
  const [reg, setReg] = useState(null);
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState(null);
  const [version, setVersion] = useState(0);

  const load = async () => {
    const r = await invoke('getRegister');
    if (r.ok) {
      setReg(r.data);
      setCsv(r.data.csv);
      setVersion((v) => v + 1);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (!reg) return <Spinner label="Loading register" />;

  const save = async (text) => {
    setBusy('save');
    const r = await invoke('saveRegister', { csv: text });
    setBusy('');
    if (r.ok) {
      setReg(r.data);
      setCsv(r.data.csv);
      setVersion((v) => v + 1);
      setNote({ appearance: r.data.errors.length ? 'warning' : 'success', text: r.data.errors.length ? r.data.errors.join(' ') : `Register saved: ${r.data.entries.length} ICT providers.` });
    } else {
      setNote({ appearance: 'error', text: r.error });
    }
  };

  const sync = async () => {
    setBusy('sync');
    const r = await invoke('syncGraph');
    setBusy('');
    setNote(r.ok ? { appearance: r.data.synced ? 'success' : 'warning', text: r.data.synced ? `Teamwork Graph updated: ${r.data.accepted} providers accepted, ${r.data.rejected} rejected.` : r.data.reason || r.data.error } : { appearance: 'error', text: r.error });
    load();
  };

  return (
    <Stack space="space.150">
      <Heading as="h3">Register of Information (ICT third-party providers)</Heading>
      <Text>DORA Art. 28(3) requires a register of all contractual arrangements with ICT third-party service providers. Paste it as CSV with the columns provider, lei, service, functions, criticality, contractRef, country. The Teamwork Graph connector publishes each provider to the graph and links it to the incidents that name it, so Rovo and search can answer which incidents involved a critical provider.</Text>
      {note ? <SectionMessage appearance={note.appearance}><Text>{note.text}</Text></SectionMessage> : null}
      <SectionMessage appearance={reg.connected ? 'success' : 'information'} title={reg.connected ? 'Teamwork Graph connector connected' : 'Teamwork Graph connector not connected yet'}>
        <Text>{reg.connected ? (reg.lastSync ? `Last sync ${fmt(reg.lastSync.at)}: ${reg.lastSync.accepted} accepted, ${reg.lastSync.rejected} rejected${reg.lastSync.error ? `, error: ${reg.lastSync.error}` : ''}.` : 'Connected; save the register to sync.') : 'An org admin adds "DORA Register of Information" under Atlassian Administration > Connected apps. The register is stored either way.'}</Text>
      </SectionMessage>
      <Box key={`reg-${version}`}>
        <TextArea id="register" defaultValue={csv} resize="vertical" minimumRows={6} onChange={(e) => { const v = e.target.value; setCsv(v); }} />
      </Box>
      <Inline space="space.100">
        <LoadingButton appearance="primary" isLoading={busy === 'save'} onClick={() => save(csv)}>Save register</LoadingButton>
        <Button onClick={() => save(SAMPLE)}>Load sample register</Button>
        <LoadingButton isLoading={busy === 'sync'} isDisabled={!reg.connected} onClick={sync}>Sync to Teamwork Graph now</LoadingButton>
      </Inline>
      <DynamicTable
        emptyView={<Text>No providers in the register.</Text>}
        head={{ cells: [{ key: 'p', content: 'Provider' }, { key: 's', content: 'Service' }, { key: 'f', content: 'Functions' }, { key: 'c', content: 'Criticality' }, { key: 'r', content: 'Contract' }] }}
        rows={reg.entries.map((e) => ({
          key: e.id,
          cells: [
            { key: 'p', content: e.provider },
            { key: 's', content: e.service || '–' },
            { key: 'f', content: e.functions || '–' },
            { key: 'c', content: <Lozenge appearance={/^critical/i.test(e.criticality) ? 'removed' : /important/i.test(e.criticality) ? 'moved' : 'default'}>{e.criticality || 'n/a'}</Lozenge> },
            { key: 'r', content: e.contractRef || '–' },
          ],
        }))}
      />
    </Stack>
  );
}

const App = () => {
  const [s, setS] = useState(null);
  const [cases, setCases] = useState([]);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    invoke('getSettings').then((r) => r.ok && setS({ ...r.data, criticalServices: (r.data.criticalServices || []).join(', ') }));
    invoke('listCases', {}).then((r) => r.ok && setCases(r.data));
  }, []);

  if (!s) return <Spinner label="Loading settings" />;

  const save = async () => {
    setSaving(true);
    const r = await invoke('saveSettings', s);
    setSaving(false);
    setMsg(r.ok ? { appearance: 'success', text: 'Settings saved.' } : { appearance: 'error', text: r.error });
    if (r.ok) {
      setS({ ...r.data, criticalServices: (r.data.criticalServices || []).join(', ') });
      setVersion((v) => v + 1);
    }
  };

  return (
    <Stack space="space.300">
      <Text>Settings used to classify incidents and to place report drafts. All data stays in Forge storage on this site.</Text>
      {msg ? <SectionMessage appearance={msg.appearance}><Text>{msg.text}</Text></SectionMessage> : null}
      <Box xcss={card} key={`settings-${version}`}>
        <Stack space="space.150">
          <Label labelFor="tc">Total clients using your services (for the 10% client threshold)</Label>
          <Textfield id="tc" type="number" defaultValue={String(s.totalClients || '')} onChange={(e) => { const v = e.target.value; setS((p) => ({ ...p, totalClients: v })); }} />
          <Label labelFor="hm">Home Member State (two-letter code)</Label>
          <Textfield id="hm" defaultValue={s.homeMemberState || ''} onChange={(e) => { const v = e.target.value; setS((p) => ({ ...p, homeMemberState: v })); }} />
          <Label labelFor="cs">Critical or important functions (comma separated, shown as hints)</Label>
          <Textfield id="cs" defaultValue={s.criticalServices || ''} onChange={(e) => { const v = e.target.value; setS((p) => ({ ...p, criticalServices: v })); }} />
          <Label labelFor="sk">Confluence space key for report drafts (empty: drafts go to a Jira comment)</Label>
          <Textfield id="sk" defaultValue={s.confluenceSpaceKey || ''} onChange={(e) => { const v = e.target.value; setS((p) => ({ ...p, confluenceSpaceKey: v })); }} />
          <LoadingButton appearance="primary" isLoading={saving} onClick={save}>Save settings</LoadingButton>
        </Stack>
      </Box>
      <Register />
      <Heading as="h3">Open DORA cases</Heading>
      <DynamicTable
        emptyView={<Text>No incidents assessed yet.</Text>}
        head={{ cells: [{ key: 'k', content: 'Incident' }, { key: 'v', content: 'Verdict' }, { key: 'n', content: 'Next report' }, { key: 'd', content: 'Due' }, { key: 'p', content: 'Providers' }] }}
        rows={cases.map((c) => ({
          key: c.issueKey,
          cells: [
            { key: 'k', content: `${c.issueKey} ${c.summary || ''}` },
            { key: 'v', content: <Lozenge appearance={c.major ? 'removed' : 'default'}>{c.major ? 'major' : 'not major'}</Lozenge> },
            { key: 'n', content: c.next ? c.next.report : '–' },
            { key: 'd', content: c.next ? `${fmt(c.next.due)} (${c.next.status})` : '–' },
            { key: 'p', content: (c.providers || []).join(', ') || '–' },
          ],
        }))}
      />
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
