import i18n from '../i18n';
import en from './locales/en';
import fr from './locales/fr';
import ja from './locales/ja';
import ko from './locales/ko';
import zhCN from './locales/zh-CN';
import zhTW from './locales/zh-TW';

// The new UI's own strings live under the `v2` key of the shared translation namespace.
const bundles = { en, fr, ja, ko, 'zh-CN': zhCN, 'zh-TW': zhTW };
for (const [lng, messages] of Object.entries(bundles)) {
  i18n.addResourceBundle(lng, 'translation', { v2: messages }, true, false);
}

export default i18n;
