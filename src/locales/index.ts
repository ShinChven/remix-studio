import enAdmin from './en/admin.json';
import enApp from './en/app.json';
import enLibraries from './en/libraries.json';
import enProjectViewer from './en/project-viewer.json';
import enProjects from './en/projects.json';
import enProviders from './en/providers.json';
import enWorkspace from './en/workspace.json';
import frAdmin from './fr/admin.json';
import frApp from './fr/app.json';
import frLibraries from './fr/libraries.json';
import frProjectViewer from './fr/project-viewer.json';
import frProjects from './fr/projects.json';
import frProviders from './fr/providers.json';
import frWorkspace from './fr/workspace.json';
import jaAdmin from './ja/admin.json';
import jaApp from './ja/app.json';
import jaLibraries from './ja/libraries.json';
import jaProjectViewer from './ja/project-viewer.json';
import jaProjects from './ja/projects.json';
import jaProviders from './ja/providers.json';
import jaWorkspace from './ja/workspace.json';
import koAdmin from './ko/admin.json';
import koApp from './ko/app.json';
import koLibraries from './ko/libraries.json';
import koProjectViewer from './ko/project-viewer.json';
import koProjects from './ko/projects.json';
import koProviders from './ko/providers.json';
import koWorkspace from './ko/workspace.json';
import zhCNAdmin from './zh-CN/admin.json';
import zhCNApp from './zh-CN/app.json';
import zhCNLibraries from './zh-CN/libraries.json';
import zhCNProjectViewer from './zh-CN/project-viewer.json';
import zhCNProjects from './zh-CN/projects.json';
import zhCNProviders from './zh-CN/providers.json';
import zhCNWorkspace from './zh-CN/workspace.json';
import zhTWAdmin from './zh-TW/admin.json';
import zhTWApp from './zh-TW/app.json';
import zhTWLibraries from './zh-TW/libraries.json';
import zhTWProjectViewer from './zh-TW/project-viewer.json';
import zhTWProjects from './zh-TW/projects.json';
import zhTWProviders from './zh-TW/providers.json';
import zhTWWorkspace from './zh-TW/workspace.json';

type LocaleMessages = Record<string, unknown>;

const mergeLocale = (...chunks: LocaleMessages[]): LocaleMessages =>
  Object.assign({}, ...chunks);

export const en = mergeLocale(
  enApp,
  enProjects,
  enProjectViewer,
  enLibraries,
  enProviders,
  enAdmin,
  enWorkspace
);

export const fr = mergeLocale(
  frApp,
  frProjects,
  frProjectViewer,
  frLibraries,
  frProviders,
  frAdmin,
  frWorkspace
);

export const ja = mergeLocale(
  jaApp,
  jaProjects,
  jaProjectViewer,
  jaLibraries,
  jaProviders,
  jaAdmin,
  jaWorkspace
);

export const ko = mergeLocale(
  koApp,
  koProjects,
  koProjectViewer,
  koLibraries,
  koProviders,
  koAdmin,
  koWorkspace
);

export const zhCN = mergeLocale(
  zhCNApp,
  zhCNProjects,
  zhCNProjectViewer,
  zhCNLibraries,
  zhCNProviders,
  zhCNAdmin,
  zhCNWorkspace
);

export const zhTW = mergeLocale(
  zhTWApp,
  zhTWProjects,
  zhTWProjectViewer,
  zhTWLibraries,
  zhTWProviders,
  zhTWAdmin,
  zhTWWorkspace
);
