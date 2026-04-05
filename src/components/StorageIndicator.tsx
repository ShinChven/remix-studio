import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database } from 'lucide-react';
import { fetchStorageAnalysis } from '../api';
import { motion } from 'motion/react';

interface StorageIndicatorProps {
  isCollapsed: boolean;
}

export function StorageIndicator({ isCollapsed }: StorageIndicatorProps) {
  const [size, setSize] = useState<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        const analysis = await fetchStorageAnalysis();
        setSize(analysis.totalSize);
      } catch (e) {
        console.error('Failed to load storage size:', e);
      }
    };
    load();

    // Refresh every 5 minutes
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (size === null) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => navigate('/storage')}
      className={`
        mx-3 mb-2 p-2 rounded-xl cursor-pointer transition-all duration-300
        bg-neutral-800/40 border border-neutral-700/50 hover:bg-neutral-800/60 hover:border-neutral-600
        flex items-center gap-3 overflow-hidden
        ${isCollapsed ? 'justify-center' : ''}
      `}
      title={`Total Storage: ${formatSize(size)}`}
    >
      <div className="w-8 h-8 rounded-lg bg-blue-600/10 flex items-center justify-center flex-shrink-0">
        <Database className="w-4 h-4 text-blue-400" />
      </div>
      
      {!isCollapsed && (
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Storage Used</span>
          <span className="text-xs font-semibold text-neutral-200 truncate">{formatSize(size)}</span>
        </div>
      )}
    </motion.div>
  );
}
