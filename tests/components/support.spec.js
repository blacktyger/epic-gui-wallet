/*
 * Get help / Report a problem, both interfaces: Classic layout/SupportReportModalBox.vue and Modern
 * modern/dialogs/SupportDialog.vue (same logic). Write → review exactly what is sent → send or save;
 * opened by the 'open-support' event from anywhere, nothing sent without a click.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import ClassicDialog from '@/components/layout/SupportReportModalBox.vue';
import ModernDialog from '@/components/modern/dialogs/SupportDialog.vue';
import { mountView, t } from './support/mountView.js';
import { button } from './support/dom.js';

const PREVIEW = {
  token: 'tok1', canSend: true,
  app: { version: '6.1.6', platform: 'linux', release: '6.17', arch: 'x64' },
  files: [{ name: 'app/renderer.log', bytes: 2048, text: '[login] wallet opened at ~/.epic-gui', cut: false },
    { name: 'wallets/w1/epic-wallet.log', bytes: 600000, text: 'Connecting to the node: <host>', cut: true }],
  counts: { paths: 3, ips: 1 }, totalBytes: 602048,
};

function fakeSupport(over = {}) {
  window.support = {
    preview: vi.fn(async ({ attachLogs }) => (attachLogs ? PREVIEW : { ...PREVIEW, token: 'tok0', files: [], counts: {} })),
    send: vi.fn(async () => ({ ok: true, id: 'r7k2m9q4' })),
    save: vi.fn(async () => ({ ok: true, path: '/home/u/Documents/epic-wallet-report.epicsupport' })),
    openLogsFolder: vi.fn(),
    onOpen: vi.fn(),
    ...over,
  };
  return window.support;
}

async function open(Component) {
  const m = mountView(Component);
  m.emitter.emit('open-support');
  await flushPromises();
  return m;
}

async function write(wrapper, { description = 'Wallet does not connect to the node', contact = '@jan', attach = true } = {}) {
  await wrapper.find('textarea').setValue(description);
  await wrapper.find('input[type=text]').setValue(contact);
  const box = wrapper.find('input[type=checkbox]');
  if (box.element.checked !== attach) await box.setValue(attach);
}

describe.each([
  { name: 'Classic', Component: ClassicDialog },
  { name: 'Modern', Component: ModernDialog },
])('Report a problem ($name)', ({ Component }) => {
  beforeEach(() => fakeSupport());

  test('closed until opened; opens on the event, logs attached by default, the privacy line shown', async () => {
    const m = mountView(Component);
    //Classic: a Bulma modal (is-active); Modern: a native <dialog>
    const shown = () => (m.wrapper.find('dialog').exists() ? m.wrapper.find('dialog').element.open : m.wrapper.find('.modal').classes('is-active'));
    expect(shown()).toBe(false);
    m.emitter.emit('open-support');
    await flushPromises();
    expect(shown()).toBe(true);
    const text = m.wrapper.text();
    expect(text).toContain(t('msg.support.lead'));
    expect(text).toContain(t('msg.support.attach_label'));
    expect(text).toContain(t('msg.support.privacy'));
    expect(m.wrapper.find('input[type=checkbox]').element.checked).toBe(true);
    expect(window.support.preview).not.toHaveBeenCalled();
  });

  test('no description: nothing is collected, the user is told why', async () => {
    const { wrapper } = await open(Component);
    await button(wrapper, t('msg.support.review')).trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain(t('msg.support.description_required'));
    expect(window.support.preview).not.toHaveBeenCalled();
  });

  test('write → review shows what goes where and the cleaned logs → send', async () => {
    const { wrapper } = await open(Component);
    await write(wrapper);
    await button(wrapper, t('msg.support.review')).trigger('click');
    await flushPromises();
    expect(window.support.preview).toHaveBeenCalledWith(expect.objectContaining({ attachLogs: true }));
    const text = wrapper.text();
    expect(text).toContain(t('msg.support.public_label'));
    expect(text).toContain('Wallet does not connect to the node');
    expect(text).toContain(t('msg.support.private_label'));
    expect(text).toContain('@jan');
    expect(text).toContain('app/renderer.log');
    expect(text).toContain('[login] wallet opened at ~/.epic-gui');
    expect(text).toContain(t('msg.support.file_cut'));
    expect(text).toContain(t('msg.support.kind_paths'));
    expect(window.support.send).not.toHaveBeenCalled();
    await button(wrapper, t('msg.support.send')).trigger('click');
    await flushPromises();
    expect(window.support.send).toHaveBeenCalledWith({ token: 'tok1', description: 'Wallet does not connect to the node', contact: '@jan' });
    expect(wrapper.text()).toContain(t('msg.support.sent_text', { id: 'r7k2m9q4' }));
  });

  test('logs unticked: the preview has none and says so', async () => {
    const { wrapper } = await open(Component);
    await write(wrapper, { attach: false });
    await button(wrapper, t('msg.support.review')).trigger('click');
    await flushPromises();
    expect(window.support.preview).toHaveBeenCalledWith(expect.objectContaining({ attachLogs: false }));
    expect(wrapper.text()).toContain(t('msg.support.private_note_no_logs'));
    expect(wrapper.text()).not.toContain('app/renderer.log');
  });

  test('a failed send says why and offers the file; saving works', async () => {
    fakeSupport({ send: vi.fn(async () => ({ ok: false, error: 'offline' })) });
    const { wrapper } = await open(Component);
    await write(wrapper);
    await button(wrapper, t('msg.support.review')).trigger('click');
    await flushPromises();
    await button(wrapper, t('msg.support.send')).trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain(t('msg.support.err_offline'));
    await button(wrapper, t('msg.support.save')).trigger('click');
    await flushPromises();
    expect(window.support.save).toHaveBeenCalledWith(expect.objectContaining({ token: 'tok1' }));
    expect(wrapper.text()).toContain(t('msg.support.saved_text', { path: '/home/u/Documents/epic-wallet-report.epicsupport' }));
  });

  test('one send at a time: a second click while sending does nothing', async () => {
    let finish;
    fakeSupport({ send: vi.fn(() => new Promise((r) => { finish = r; })) });
    const { wrapper } = await open(Component);
    await write(wrapper);
    await button(wrapper, t('msg.support.review')).trigger('click');
    await flushPromises();
    const send = wrapper.findAll('button').find((b) => b.text().includes(t('msg.support.send')));
    await send.trigger('click');
    await send.trigger('click');
    expect(window.support.send).toHaveBeenCalledTimes(1);
    finish({ ok: true, id: 'x1' });
    await flushPromises();
    expect(wrapper.text()).toContain(t('msg.support.sent_text', { id: 'x1' }));
  });

  test('no endpoint in this build: only Save is offered, with the reason', async () => {
    fakeSupport({ preview: vi.fn(async () => ({ ...PREVIEW, canSend: false })) });
    const { wrapper } = await open(Component);
    await write(wrapper);
    await button(wrapper, t('msg.support.review')).trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain(t('msg.support.no_send'));
    expect(() => button(wrapper, t('msg.support.send'))).toThrow();
    expect(button(wrapper, t('msg.support.save'))).toBeTruthy();
  });

  test('a description that looks like a recovery phrase: refused, nothing can be sent or saved', async () => {
    fakeSupport({ preview: vi.fn(async () => ({ ...PREVIEW, phrase: true })) });
    const { wrapper } = await open(Component);
    expect(wrapper.text()).toContain(t('msg.support.never_secrets'));
    await write(wrapper, { description: 'abandon ability able about above absent absorb abstract' });
    await button(wrapper, t('msg.support.review')).trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain(t('msg.support.phrase_refused'));
    expect(wrapper.text()).not.toContain('app/renderer.log');
    const save = wrapper.findAll('button').find((b) => b.text().includes(t('msg.support.save')));
    expect(save.attributes('disabled')).toBeDefined();
    await save.trigger('click');
    await flushPromises();
    expect(window.support.save).not.toHaveBeenCalled();
    expect(window.support.send).not.toHaveBeenCalled();
  });

  test('an expired preview is made again, and the user checks it before sending', async () => {
    fakeSupport({ send: vi.fn(async () => ({ ok: false, error: 'expired' })) });
    const { wrapper } = await open(Component);
    await write(wrapper);
    await button(wrapper, t('msg.support.review')).trigger('click');
    await flushPromises();
    await button(wrapper, t('msg.support.send')).trigger('click');
    await flushPromises();
    expect(window.support.preview).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain(t('msg.support.err_expired'));
    expect(window.support.send).toHaveBeenCalledTimes(1);
  });
});
