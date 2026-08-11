import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/PageHeader';
import { ProjectImportPanel } from '../components/ProjectImportPanel';

/**
 * Dedicated home for project bundle imports, reached from the button in the
 * Projects header. It used to sit on the Exports page, which buried it under
 * unrelated archive work.
 */
export function ProjectImport() {
  const { t } = useTranslation();

  return (
    <div className="p-4 md:p-8 w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <PageHeader
        title={t('projectImports.title')}
        description={t('projectImports.description')}
        backLink={{ to: '/projects', label: t('projectImports.backToProjects') }}
      />

      <ProjectImportPanel />
    </div>
  );
}
