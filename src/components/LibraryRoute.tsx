import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { AppData, Library } from '../types';
import { LibraryEditor } from './LibraryEditor';

export function LibraryRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, handleSave } = useOutletContext<{ data: AppData, handleSave: (d: AppData) => void }>();

  const library = data.libraries.find(l => l.id === id);

  if (!library) {
    return <div className="p-8 text-neutral-500">Library not found.</div>;
  }

  const onUpdate = (updatedLib: Library) => {
    handleSave({
      ...data,
      libraries: data.libraries.map(l => l.id === updatedLib.id ? updatedLib : l)
    });
  };

  const onDelete = () => {
    handleSave({
      ...data,
      libraries: data.libraries.filter(l => l.id !== id)
    });
    navigate('/');
  };

  return <LibraryEditor library={library} onUpdate={onUpdate} onDelete={onDelete} />;
}
