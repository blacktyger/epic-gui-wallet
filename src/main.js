
import { createApp } from 'vue'
import { store } from './store/index'
import router from './router'
import { i18n } from './i18n';
import walletService from './shared/walletService.js';
import nodeService from './shared/nodeService.js';
import configService from './shared/configService.js';
import userService from './shared/userService.js';
import addressbookService from './shared/addressbookService.js';
import addressTransactionsService from './shared/addressTransactionService.js';
import { createImporter } from './shared/importer.js';
import {words} from './shared/words.js';
import App from './App.vue'
import mitt from 'mitt';
import moment from 'moment';
import Toaster from "@meforma/vue-toaster";
import { applyTheme, applyScale, getUi, getScheme, getScale, UI_CLASSIC } from './shared/theme.js';




import mdiVue from 'mdi-vue/v3';
import * as mdijs from '@mdi/js';



moment.updateLocale('en', {
    longDateFormat : {
        L: "YYYY-MM-DD, HH:mm:ss",
    }
});
moment.updateLocale('de', {
    longDateFormat : {
        L: "DD.MM.YYYY, HH:mm:ss",
    }
});



//the interface (Modern or Classic): data-ui / data-theme on <html> and only that interface's
//stylesheet, before the first render
const ui = getUi();
applyTheme(ui, getScheme());
applyScale(getScale(), ui);
const uiStyles = ui === UI_CLASSIC
  ? import(/* webpackChunkName: "ui-classic" */ './ui/classic.js')
  : import(/* webpackChunkName: "ui-modern" */ './ui/modern.js');

const emitter = mitt();
const app = createApp(App);


app.use(i18n);
app.use(mdiVue, {
  icons: mdijs
});
app.use(store);
app.use(router);
app.use(Toaster);



let config = new configService(emitter);

app.config.globalProperties.emitter = emitter;
app.config.globalProperties.$walletService = new walletService(emitter, config);
app.config.globalProperties.$nodeService = new nodeService(emitter, config);
app.config.globalProperties.$userService =  new userService();
app.config.globalProperties.$addressBookService =  new addressbookService();
app.config.globalProperties.$addressTransactionsService =  new addressTransactionsService();
app.config.globalProperties.configService = config;
//older GUIs' wallets: found on the first start, imported read only (docs/plans/fresh-start.md)
app.config.globalProperties.$importer = createImporter({
  configService: config,
  userService: app.config.globalProperties.$userService,
  addressbookService: app.config.globalProperties.$addressBookService,
  legacyBridge: { scan: ({ known } = {}) => window.config.legacyScan(known) },
  fs: window.nodeFs,
  pathMod: window.nodePath,
});
app.config.globalProperties.mnemonicWords = words;

app.config.globalProperties.$filters = {

  currencyFormat(number, locale){

    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      currencyDisplay: "code"
    })
    .format(number)
    .replace("USD", "")
    .trim()
  },
  datetimeFormat(date, locale) {

     if(date != undefined){
       moment.locale(locale ? locale : 'en');
       let formatDatetime = moment(date).format('L');
       return formatDatetime
     }else{
       return '-'
     }
  },

  truncate(text, length) {
    if (text.length > length) {
        return text.substring(0, length);
    } else {
        return text;
    }
  },
  truncateMid(fullStr, strLen){
    if (fullStr.length <= strLen) return fullStr;

    let separator = '...';

    var sepLen = separator.length,
        charsToShow = strLen - sepLen,
        frontChars = Math.ceil(charsToShow/2),
        backChars = Math.floor(charsToShow/2);

    return fullStr.substr(0, frontChars) +
           separator +
           fullStr.substr(fullStr.length - backChars);
  },
  paymentProof(data, field){
    if(data && data[field]){
      return data[field];
    }else{
      return ''
    }
  }

}

uiStyles.finally(() => app.mount('#app'));
