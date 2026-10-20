/*
 * Report a problem, both interfaces: Classic layout/SupportReportModalBox.vue and Modern
 * modern/dialogs/SupportDialog.vue (same logic). One short screen: description, contact, attach
 * logs (said once: encrypted, only the developer reads them), a collapsed "Show what's sent",
 * Send / Save to file / Cancel. Nothing is sent without a click.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import ModernDialog from '@/components/modern/dialogs/SupportDialog.vue';
import { mountView, t } from './support/mountView.js';
import { button } from './support/dom.js';

const APP = { version: '6.1.6', platform: 'linux', release: '6.17', arch: 'x64' };
const FILES = [{ name: 'app/renderer.log', bytes: 2048, text: '[login] wallet opened at ~/.epic-gui', cut: false },
  { name: 'wallets/w1/epic-wallet.log', bytes: 600000, text: 'Connecting to the node: <host-1>', cut: true }];

function fakeSupport(over = {}) {
  let n = 0;
  window.support = {
    preview: vi.fn(async ({ attachLogs, description }) => ({ token: 'tok' + (++n), canSend: true, app: APP, files: attachLogs ? FILES : [],
      counts: {}, description: String(description || '').trim().replace('/home/jan', '~'), phrase: false })),
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

async function write(wrapper, { description = 'Wallet does not connect to the node', contact = 'jan@example.org', attach = true } = {}) {
  await wrapper.find('textarea').setValue(description);
  await wrapper.find('input[type=text]').setValue(contact);
  const box = wrapper.find('input[type=checkbox]');
  if (box.element.checked !== attach) await box.setValue(attach);
}

const click = async (wrapper, key) => { await button(wrapper, t(key)).trigger('click'); await flushPromises(); };

//Modern only: Classic is frozen (user decision, 2026-10-20); its dialog shares this logic
describe.each([
  { name: 'Modern', Component: ModernDialog },
])('Report a problem ($name)', ({ Component }) => {
  beforeEach(() => fakeSupport());

  test('closed until opened; one short screen, the privacy line once, logs attached by default', async () => {
    const m = mountView(Component);
    const shown = () => (m.wrapper.find('dialog').exists() ? m.wrapper.find('dialog').element.open : m.wrapper.find('.modal').classes('is-active'));
    expect(shown()).toBe(false);
    m.emitter.emit('open-support');
    await flushPromises();
    expect(shown()).toBe(true);
    const text = m.wrapper.text();
    expect(text).toContain(t('msg.support.title'));
    expect(text).toContain(t('msg.support.attach_label'));
    expect(text.split(t('msg.support.attach_note')).length - 1).toBe(1);
    expect(text).toContain(t('msg.support.show'));
    expect(m.wrapper.find('textarea').attributes('placeholder')).toBe(t('msg.support.description_label'));
    expect(m.wrapper.find('input[type=checkbox]').element.checked).toBe(true);
    //only the check whether Send is offered: no logs read
    expect(window.support.preview).toHaveBeenCalledTimes(1);
    expect(window.support.preview.mock.calls[0][0].attachLogs).toBe(false);
    expect(window.support.send).not.toHaveBeenCalled();
  });

  test('no description: nothing is sent, the user is told', async () => {
    const { wrapper } = await open(Component);
    await click(wrapper, 'msg.support.send');
    expect(wrapper.text()).toContain(t('msg.support.description_required'));
    expect(window.support.send).not.toHaveBeenCalled();
  });

  test('Send: a fresh preview of what is on screen, then the sealed report; one line after', async () => {
    const { wrapper } = await open(Component);
    await write(wrapper);
    await click(wrapper, 'msg.support.send');
    const last = window.support.preview.mock.calls.at(-1)[0];
    expect(last).toMatchObject({ attachLogs: true, description: 'Wallet does not connect to the node' });
    expect(window.support.send).toHaveBeenCalledWith({ token: 'tok2', description: 'Wallet does not connect to the node', contact: 'jan@example.org' });
    expect(wrapper.text()).toContain(t('msg.support.sent'));
    expect(wrapper.find('textarea').exists()).toBe(false);
  });

  test('Show what’s sent: the cleaned description, contact, version and the logs', async () => {
    const { wrapper } = await open(Component);
    await write(wrapper, { description: 'logs in /home/jan/.epic-gui' });
    const det = wrapper.find('details');
    det.element.open = true;
    await det.trigger('toggle');
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain('logs in ~/.epic-gui');
    expect(text).toContain('jan@example.org');
    expect(text).toContain('Epic Wallet 6.1.6');
    expect(text).toContain('app/renderer.log');
    expect(text).toContain('[login] wallet opened at ~/.epic-gui');
  });

  test('logs unticked: none in the preview', async () => {
    const { wrapper } = await open(Component);
    await write(wrapper, { attach: false });
    await click(wrapper, 'msg.support.send');
    expect(window.support.preview.mock.calls.at(-1)[0].attachLogs).toBe(false);
    expect(window.support.send).toHaveBeenCalled();
  });

  test('a failed send says why in one line; Save to file works', async () => {
    fakeSupport({ send: vi.fn(async () => ({ ok: false, error: 'offline' })) });
    const { wrapper } = await open(Component);
    await write(wrapper);
    await click(wrapper, 'msg.support.send');
    expect(wrapper.text()).toContain(t('msg.support.err_offline'));
    await click(wrapper, 'msg.support.save');
    expect(window.support.save).toHaveBeenCalledWith(expect.objectContaining({ contact: 'jan@example.org' }));
    expect(wrapper.text()).toContain(t('msg.support.saved', { path: '/home/u/Documents/epic-wallet-report.epicsupport' }));
  });

  test('one send at a time: a second click while sending does nothing', async () => {
    let finish;
    fakeSupport({ send: vi.fn(() => new Promise((r) => { finish = r; })) });
    const { wrapper } = await open(Component);
    await write(wrapper);
    const send = button(wrapper, t('msg.support.send'));
    await send.trigger('click');
    await flushPromises();
    await send.trigger('click');
    await flushPromises();
    expect(window.support.send).toHaveBeenCalledTimes(1);
    finish({ ok: true, id: 'x1' });
    await flushPromises();
    expect(wrapper.text()).toContain(t('msg.support.sent'));
  });

  test('no intake in this build: only Save to file is offered', async () => {
    fakeSupport({ preview: vi.fn(async () => ({ token: 't', canSend: false, app: APP, files: [], counts: {}, description: '' })) });
    const { wrapper } = await open(Component);
    expect(() => button(wrapper, t('msg.support.send'))).toThrow();
    expect(button(wrapper, t('msg.support.save'))).toBeTruthy();
  });

  test('a recovery phrase in the description: refused, nothing sent or saved', async () => {
    fakeSupport({ preview: vi.fn(async () => ({ token: 't', canSend: true, app: APP, files: [], counts: {}, description: 'x', phrase: true })) });
    const { wrapper } = await open(Component);
    await write(wrapper, { description: 'abandon ability able about above absent absorb abstract' });
    await click(wrapper, 'msg.support.send');
    expect(wrapper.text()).toContain(t('msg.support.phrase_refused'));
    await click(wrapper, 'msg.support.save');
    expect(window.support.send).not.toHaveBeenCalled();
    expect(window.support.save).not.toHaveBeenCalled();
  });

  test('an expired preview is made again once and the report sent', async () => {
    const send = vi.fn().mockResolvedValueOnce({ ok: false, error: 'expired' }).mockResolvedValueOnce({ ok: true, id: 'y2' });
    fakeSupport({ send });
    const { wrapper } = await open(Component);
    await write(wrapper);
    await click(wrapper, 'msg.support.send');
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].token).not.toBe(send.mock.calls[0][0].token);
    expect(wrapper.text()).toContain(t('msg.support.sent'));
  });
});
