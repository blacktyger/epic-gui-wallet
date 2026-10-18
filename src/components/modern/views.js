/*
 * The Modern view of each route (router/index.js keeps the Classic components).
 *   layout: 'app' = inside AppShell (sidebar), 'bare' = full window (unlock, first run)
 *   titleKey: i18n key of the window title
 * Each view is a reskin() of the route's Classic component: same logic, new template.
 */
import BlankView from '@/components/modern/views/BlankView.vue';
import UnlockView from '@/components/modern/views/UnlockView.vue';
import WelcomeView from '@/components/modern/views/WelcomeView.vue';
import CreateView from '@/components/modern/views/CreateView.vue';
import RestoreView from '@/components/modern/views/RestoreView.vue';
import SetupView from '@/components/modern/views/SetupView.vue';
import OverviewView from '@/components/modern/views/OverviewView.vue';
import ActivityView from '@/components/modern/views/ActivityView.vue';
import SendView from '@/components/modern/views/SendView.vue';
import ReceiveView from '@/components/modern/views/ReceiveView.vue';
import ImportView from '@/components/modern/views/ImportView.vue';
import FinalizeView from '@/components/modern/views/FinalizeView.vue';
import ContactsView from '@/components/modern/views/ContactsView.vue';
import SettingsGeneral from '@/components/modern/views/settings/SettingsGeneral.vue';
import SettingsAccount from '@/components/modern/views/settings/SettingsAccount.vue';
import SettingsPhrase from '@/components/modern/views/settings/SettingsPhrase.vue';
import SettingsRescan from '@/components/modern/views/settings/SettingsRescan.vue';
import SettingsAbout from '@/components/modern/views/settings/SettingsAbout.vue';
import SettingsHelp from '@/components/modern/views/settings/SettingsHelp.vue';

export const MODERN_VIEWS = {
  checkService: { component: BlankView, layout: 'bare', titleKey: '' },
  login: { component: UnlockView, layout: 'bare', titleKey: 'msg.modern.title_unlock' },
  new: { component: WelcomeView, layout: 'bare', titleKey: 'msg.modern.title_welcome' },
  create: { component: CreateView, layout: 'bare', titleKey: 'msg.modern.title_create' },
  restore: { component: RestoreView, layout: 'bare', titleKey: 'msg.modern.title_restore' },
  setupwizard: { component: SetupView, layout: 'bare', titleKey: 'msg.modern.title_setup' },
  dashboard: { component: OverviewView, layout: 'app', titleKey: 'msg.modern.overview' },
  activity: { component: ActivityView, layout: 'app', titleKey: 'msg.modern.activity' },
  httpSend: { component: SendView, layout: 'app', titleKey: 'msg.menu.send' },
  httpReceive: { component: ReceiveView, layout: 'app', titleKey: 'msg.menu.receive' },
  importTransaction: { component: ImportView, layout: 'app', titleKey: 'msg.menu.import' },
  finalizeTransaction: { component: FinalizeView, layout: 'app', titleKey: 'msg.menu.finalize' },
  addressBook: { component: ContactsView, layout: 'app', titleKey: 'msg.modern.contacts' },
  settings: { component: SettingsGeneral, layout: 'app', titleKey: 'msg.menu.settings' },
  account: { component: SettingsAccount, layout: 'app', titleKey: 'msg.menu.settings' },
  mnemonic: { component: SettingsPhrase, layout: 'app', titleKey: 'msg.menu.settings' },
  recheckBalance: { component: SettingsRescan, layout: 'app', titleKey: 'msg.menu.settings' },
  about: { component: SettingsAbout, layout: 'app', titleKey: 'msg.menu.settings' },
  help: { component: SettingsHelp, layout: 'app', titleKey: 'msg.menu.settings' },
};
