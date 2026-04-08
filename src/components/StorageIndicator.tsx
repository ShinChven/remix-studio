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
  const [limit, setLimit] = useState<number>(5 * 1024 * 1024 * 1024);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        const analysis = await fetchStorageAnalysis({ includeProjects: false });
        setSize(analysis.totalSize);
        setLimit(analysis.limit);
      } catch (e) {
        console.error('Failed to load storage size:', e);
      }
    };
    load();

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

  const usagePercent = Math.min(100, (size / limit) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => navigate('/account?tab=storage')}
      className={`
        mx-3 mb-2 p-2 rounded-xl cursor-pointer transition-all duration-300
        bg-neutral-800/40 border border-neutral-700/50 hover:bg-neutral-800/60 hover:border-neutral-600
        flex items-center gap-3 overflow-hidden
        ${isCollapsed ? 'justify-center' : ''}
      `}
      title={`Storage: ${formatSize(size)} / ${formatSize(limit)} (${usagePercent.toFixed(1)}%)`}
    >
      <div className="w-8 h-8 rounded-lg bg-blue-600/10 flex items-center justify-center flex-shrink-0">
        <Database className={`w-4 h-4 ${usagePercent > 90 ? 'text-red-400' : 'text-blue-400'}`} />
      </div>
      
      {!isCollapsed && (
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Storage</span>
            <span className="text-[10px] font-bold text-neutral-400">{usagePercent.toFixed(0)}%</span>
          </div>
          <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${usagePercent}%` }}
              className={`h-full rounded-full ${usagePercent > 90 ? 'bg-red-500' : usagePercent > 70 ? 'bg-amber-500' : 'bg-blue-500'}`}
            />
          </div>
          <span className="text-[10px] font-semibold text-neutral-400 mt-1 truncate">{formatSize(size)} of {formatSize(limit)}</span>
        </div>
      )}
    </motion.div>
  );
}
