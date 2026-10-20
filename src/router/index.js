import Vue from 'vue'
import {createWebHistory, createRouter} from 'vue-router'
import Dashboard from '@/components/Dashboard.vue';
import AddressBook from '@/components/AddressBook.vue';
import Login from '@/components/Login.vue';
import NavBar from '@/components/layout/NavBar.vue';
import AsideMenu from '@/components/layout/AsideMenu.vue';
import Restore from '@/components/Restore.vue';
import Create from '@/components/Create.vue';
import CheckService from '@/components/CheckService.vue';
import HttpReceive from '@/components/HttpReceive.vue';
import HttpSend from '@/components/HttpSend.vue';
import HeaderBar from '@/components/HeaderBar.vue';
import SetupWizard from '@/components/SetupWizard.vue';
import Settings from '@/components/Settings.vue';
import RecheckBalance from '@/components/Check.vue';
import Finalize from '@/components/Finalize.vue';
import Receive from '@/components/Receive.vue';
import Help from '@/components/Help.vue';
import About from '@/components/About.vue';
import Account from '@/components/Account.vue';
import Seed from '@/components/Seed.vue';
import New from '@/components/New.vue';
import Found from '@/components/Found.vue';
import AddExisting from '@/components/AddExisting.vue';
import Wallets from '@/components/Wallets.vue';
import SettingsError from '@/components/SettingsError.vue';

const routes = [
  {

    meta: {
      title: 'Check Service'
    },
    path: '/',
    name: 'checkService',
    component: CheckService
  },
  {

    meta: {
      title: 'New'
    },
    path: '/new',
    name: 'new',
    component: New
  },
  {
    //Add a wallet › Add an existing wallet: from an older Epic Wallet, or from a wallet folder
    meta: {
      title: 'Add an existing wallet'
    },
    path: '/add-existing',
    name: 'addExisting',
    component: AddExisting
  },
  {
    //older Epic Wallet wallets were found: import them or start fresh (once, or from Welcome › Advanced)
    meta: {
      title: 'Found wallets'
    },
    path: '/found',
    name: 'found',
    component: Found
  },
  {
    //settings.json exists but can't be read: nothing is written until it is fixed
    meta: {
      title: 'Settings error'
    },
    path: '/settings-error',
    name: 'settingsError',
    component: SettingsError
  },
  {

    meta: {
      title: 'Login'
    },
    path: '/login',
    name: 'login',
    component: Login
  },
  {

    meta: {
      title: 'Dashboard',
      titleKey: 'msg.menu.dashboard'
    },
    path: '/dashboard',
    name: 'dashboard',
    components: {
      default: Dashboard,
      navBar: NavBar,
      asideMenu: AsideMenu,
      headerbar: HeaderBar,
    }
  },
  {

    meta: {
      title: 'Account',
      titleKey: 'msg.menu.account'
    },
    path: '/account',
    name: 'account',
    components: {
      default: Account,
      navBar: NavBar,
      asideMenu: AsideMenu,
      headerbar: HeaderBar,
    }
  },
  {
    //Settings › All wallets: the wallet list and Add a wallet (Settings › Wallet is the open wallet only)
    meta: {
      title: 'All wallets',
      titleKey: 'msg.wallets.all_wallets'
    },
    path: '/wallets',
    name: 'wallets',
    components: {
      default: Wallets,
      navBar: NavBar,
      asideMenu: AsideMenu,
      headerbar: HeaderBar,
    }
  },
  {

    meta: {
      title: 'Help',
      titleKey: 'msg.menu.help'
    },
    path: '/help',
    name: 'help',
    components: {
      default: Help,
      navBar: NavBar,
      asideMenu: AsideMenu,
      headerbar: HeaderBar,
    }
  },
  {

    meta: {
      title: 'About',
      titleKey: 'msg.menu.about'
    },
    path: '/about',
    name: 'about',
    components: {
      default: About,
      navBar: NavBar,
      asideMenu: AsideMenu,
      headerbar: HeaderBar,
    }
  },
  {
    meta: {
      title: 'Receive',
      titleKey: 'msg.menu.receive'
    },
    path: '/httpReceive',
    name: 'httpReceive',
    components: {
      default: HttpReceive,
      navBar: NavBar,
      asideMenu: AsideMenu,
      headerbar: HeaderBar,
    }
  },
  {

    meta: {
      title: 'Finalize offline transaction',
      titleKey: 'msg.menu.finalize'
    },
    path: '/finalizeTransaction',
    name: 'finalizeTransaction',
    components: {
      default: Finalize,
      navBar: NavBar,
      asideMenu: AsideMenu,
      headerbar: HeaderBar,
    }
  },
  {

    meta: {
      title: 'Import offline transaction',
      titleKey: 'msg.menu.import'
    },
    path: '/importTransaction',
    name: 'importTransaction',
    components: {
      default: Receive,
      navBar: NavBar,
      asideMenu: AsideMenu,
      headerbar: HeaderBar,
    }
  },
  {
    //the Modern interface's Activity page (transactions and coins); Classic shows them on the dashboard
    meta: {
      title: 'Activity',
      titleKey: 'msg.modern.activity'
    },
    path: '/activity',
    name: 'activity',
    components: {
      default: Dashboard,
      navBar: NavBar,
      asideMenu: AsideMenu,
      headerbar: HeaderBar,
    }
  },
  {
    meta: {
      title: 'Send',
      titleKey: 'msg.menu.send'
    },
    path: '/httpSend',
    name: 'httpSend',
    components: {
      default: HttpSend,
      navBar: NavBar,
      asideMenu: AsideMenu,
      headerbar: HeaderBar,
    }
  },
  {

    meta: {
      title: 'Addressbook',
      titleKey: 'msg.menu.address_book'
    },
    path: '/addressBook',
    name: 'addressBook',
    components: {
      default: AddressBook,
      navBar: NavBar,
      asideMenu: AsideMenu,
      headerbar: HeaderBar,
    }
  },
  {

    meta: {
      title: 'Recovery phrase',
      titleKey: 'msg.menu.mnemonic'
    },
    path: '/mnemonic',
    name: 'mnemonic',
    components: {
      default: Seed,
      navBar: NavBar,
      asideMenu: AsideMenu,
      headerbar: HeaderBar,
    }
  },
  {

    meta: {
      title: 'Create Wallet'
    },
    path: '/create:from?',
    name: 'create',
    components: {
      default: Create,
    }
  },
  {

    meta: {
      title: 'Restore Wallet'
    },
    path: '/restore/:from?',
    name: 'restore',
    components: {
      default: Restore,
    }
  },
  {

    meta: {
      title: 'Setup Wizard'
    },
    path: '/setupwizard:from?',
    name: 'setupwizard',
    components: {
      default: SetupWizard,
    }
  },
  {

    meta: {
      title: 'Settings',
      titleKey: 'msg.menu.settings'
    },
    path: '/settings',
    name: 'settings',
    components: {
      default: Settings,
      navBar: NavBar,
      asideMenu: AsideMenu,
      headerbar: HeaderBar,
    }
  },
  {

    meta: {
      title: 'Recheck balance',
      titleKey: 'msg.menu.recheck'
    },
    path: '/recheckBalance',
    name: 'recheckBalance',
    components: {
      default: RecheckBalance,
      navBar: NavBar,
      asideMenu: AsideMenu,
      headerbar: HeaderBar,
    }
  },



]

export function useRouter () {
  return router
}

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
