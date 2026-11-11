/** Regression coverage for language changes, component messages, and regional formats. No API/DB. */
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { M3LocaleProvider, SnackbarProvider, TextField } from '../src/m3';
import i18n from '../src/v2/i18n';
import { DEFAULT_WATERMARK_SETTINGS, WatermarkSettingsPanel } from '../src/v2/components/WatermarkSettingsPanel';
import { formatBytes, formatDate, formatDateTime, uiLocale } from '../src/v2/lib/format';
import { m3Messages } from '../src/v2/lib/m3Messages';
import { describeDiagnostics, type LoadedShare } from '../src/v2/lib/shareInbox';
import { ExtensionImport } from '../src/v2/pages/ExtensionImport';
import { SharePage } from '../src/v2/pages/SharePage';

const date = new Date(2026, 10, 11, 14, 25);
const languages = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'fr'];
const expected = {
  en: { close: 'Close', text: 'Text', showPassword: 'Show password' },
  'zh-CN': { close: '关闭', text: '文本', showPassword: '显示密码' },
  'zh-TW': { close: '關閉', text: '文字', showPassword: '顯示密碼' },
  ja: { close: '閉じる', text: 'テキスト', showPassword: 'パスワードを表示' },
  ko: { close: '닫기', text: '텍스트', showPassword: '비밀번호 표시' },
  fr: { close: 'Fermer', text: 'Texte', showPassword: 'Afficher le mot de passe' },
};

// Reuse one initialized instance and change languages, as the Account preferences page does.
for (const language of languages) {
  await i18n.changeLanguage(language);
  const t = i18n.getFixedT(language);
  const messages = m3Messages(t);
  assert.equal(messages.close, expected[language].close);
  assert.equal(messages.showPassword, expected[language].showPassword);
  assert.equal(messages.remove('example'), t('v2.m3.remove', { label: 'example' }));
  assert.equal(messages.selectedCount(3), t('v2.m3.selectedCount', { count: 3 }));
  assert.equal(uiLocale(), language);
  assert.equal(formatDate(date), date.toLocaleDateString(language));
  assert.equal(formatDateTime(date), date.toLocaleString(language));
  assert.equal(formatBytes(1536), `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(1.5)} KB`);

  const confirmation = t('projectViewer.confirm.deleteProject.message', { name: 'Example' });
  assert.ok(confirmation.includes('Example'));
  assert.ok(!confirmation.includes('projects.deleteConfirmation'));
  assert.ok(!confirmation.includes('{{'));
  for (const key of ['v2.projectList.deleteSuccess', 'v2.projectList.deleteFailed', 'v2.projectEditor.settings.steps', 'v2.projectEditor.settings.guidance', 'v2.library.startChat']) {
    assert.equal(i18n.exists(key, { lng: language, fallbackLng: false }), true, `${language}: ${key}`);
  }

  const html = renderToStaticMarkup(
    <M3LocaleProvider locale={language} messages={messages}>
      <WatermarkSettingsPanel settings={{ ...DEFAULT_WATERMARK_SETTINGS, enabled: true }} isSaving={false} onChange={() => {}} />
      <TextField type="password" passwordToggle label="Password" value="" onValueChange={() => {}} />
    </M3LocaleProvider>,
  );
  assert.ok(html.includes(expected[language].text), `${language}: watermark field`);
  assert.ok(html.includes(expected[language].showPassword), `${language}: M3 password control`);
  if (language !== 'en') assert.ok(!html.includes('Enter watermark text'), `${language}: hardcoded English watermark placeholder`);
  const shared = renderToStaticMarkup(<MemoryRouter><SnackbarProvider><SharePage /><ExtensionImport /></SnackbarProvider></MemoryRouter>);
  assert.ok(shared.includes(t('v2.share.loading')));
  assert.ok(shared.includes(t('v2.importer.waiting')));
  if (language !== 'en') assert.ok(!shared.includes('Loading shared content'));

  const emptyShare: LoadedShare = { text: '', title: '', url: '', images: [], diagnostics: {}, missingFiles: 0 };
  assert.equal(describeDiagnostics(emptyShare, t), t('v2.share.diagnostics.empty'));
  assert.equal(describeDiagnostics({ ...emptyShare, missingFiles: 2 }, t), t('v2.share.diagnostics.missing', { count: 2 }));
  assert.equal(describeDiagnostics({ ...emptyShare, diagnostics: { bodyBytes: 0 } }, t), t('v2.share.diagnostics.emptyBody'));
}

await i18n.changeLanguage('zh-CN');
const command = i18n.t('v2.shell.execute', { kind: i18n.t('v2.commandKinds.imageProject'), name: 'Example' });
assert.ok(command.includes('图片项目'));
assert.ok(!command.includes('image project'));
assert.equal(formatDate('invalid'), '');
assert.equal(formatDateTime(undefined), '');
assert.equal(formatDateTime(0), new Date(0).toLocaleString('zh-CN'));
console.log(`V2 i18n regression checks passed in ${languages.length} languages.`);
