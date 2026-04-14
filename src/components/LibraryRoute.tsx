import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Library } from '../types';
import { fetchLibrary, deleteLibrary as apiDeleteLibrary } from '../api';
import { LibraryEditor } from './LibraryEditor';
import { Loader2 } from 'lucide-react';

export function LibraryRoute() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [library, setLibrary] = useState<Library | null>(null);
  const [loading, setLoading] = useState(true);

  const loadLibrary = async () => {
    if (!id) return;
    try {
      const lib = await fetchLibrary(id);
      setLibrary(lib);
    } catch (e) {
      console.error(e);
      setLibrary(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadLibrary();
  }, [id]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-neutral-500 dark:text-neutral-500 animate-spin" />
      </div>
    );
  }

  if (!library) {
    return <div className="p-8 text-neutral-500 dark:text-neutral-500">{t('libraryRoute.notFound')}</div>;
  }

  const onUpdate = (updatedLib: Library) => {
    setLibrary(updatedLib);
  };

  const onDelete = async () => {
    if (!id) return;
    try {
      await apiDeleteLibrary(id);
      navigate('/libraries');
    } catch (e) {
      console.error(e);
    }
  };

  return <LibraryEditor library={library} onUpdate={onUpdate} onDelete={onDelete} />;
}
