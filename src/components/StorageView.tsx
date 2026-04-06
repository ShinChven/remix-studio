import { useState, useEffect } from 'react';
import { Database, HardDrive, FileArchive, Trash2, Folder, Zap, AlertCircle, ChevronRight, PieChart as IconPieChart } from 'lucide-react';
import { fetchStorageAnalysis } from '../api';
import { StorageAnalysis, StorageCategory } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';

const COLORS: Record<string, string> = {
  projects: '#3b82f6',
  album: '#60a5fa',
  drafts: '#8b5cf6',
  workflow: '#10b981',
  orphans: '#f59e0b',
  libraries: '#ec4899',
  archives: '#6366f1',
  trash: '#ef4444',
  other: '#94a3b8',
};

export function StorageView() {
  const [analysis, setAnalysis] = useState<StorageAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);

  const TIER_NAMES: Record<number, string> = {
    [5 * 1024 * 1024 * 1024]: 'Free',
    [100 * 1024 * 1024 * 1024]: 'Professional',
    [500 * 1024 * 1024 * 1024]: 'Premium',
  };

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchStorageAnalysis();
        setAnalysis(data);
      } catch (e) {
        console.error('Failed to analyze storage:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-neutral-950 p-8">
        <div className="flex flex-col items-center gap-4">
          <Database className="w-12 h-12 text-blue-500 animate-pulse" />
          <p className="text-neutral-400 font-medium">Analyzing storage usage...</p>
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  // Pie Chart Data
  const categories = analysis.categories.filter(c => c.size > 0);
  const totalSize = categories.reduce((sum, c) => sum + c.size, 0);

  // SVG Pie Chart Calculation
  let cumulativePercent = 0;
  const pieSegments = categories.map((cat) => {
    const startPercent = cumulativePercent;
    const slicePercent = cat.size / totalSize;
    cumulativePercent += slicePercent;
    
    // Draw arc
    const largeArcFlag = slicePercent > 0.5 ? 1 : 0;
    const startX = Math.cos(2 * Math.PI * startPercent);
    const startY = Math.sin(2 * Math.PI * startPercent);
    const endX = Math.cos(2 * Math.PI * (startPercent + slicePercent));
    const endY = Math.sin(2 * Math.PI * (startPercent + slicePercent));
    
    return {
      cat,
      path: `M ${startX} ${startY} A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY} L 0 0`,
      color: COLORS[cat.id] || COLORS.other
    };
  });

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-950 p-6 lg:p-12 custom-scrollbar">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-12"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-blue-600/10 flex items-center justify-center">
            <HardDrive className="w-6 h-6 text-blue-400" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">Storage Analysis</h1>
        </div>
        <p className="text-neutral-400 text-lg">Detailed breakdown of your digital footprint.</p>
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-12 items-start">
        {/* Left Column: Data Blocks */}
        <div className="xl:col-span-7 space-y-8">
          {/* Main 3x2 (or adaptive) Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. Capacity & Consumption Overview Card */}
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-5 flex flex-col justify-between backdrop-blur-md border-blue-500/10 h-full min-h-[220px]">
              <div>
                <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-black mb-4 block">Capacity Overview</span>
                <div className="space-y-4">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-neutral-500 uppercase font-black tracking-tight mb-1">Consumption</span>
                    <span className="text-2xl font-black text-white leading-none">{formatSize(analysis.totalSize)}</span>
                  </div>
                  <div className="flex flex-col border-t border-neutral-800/50 pt-3">
                    <span className="text-[10px] text-neutral-500 uppercase font-black tracking-tight mb-1">Total Limit</span>
                    <div className="flex items-baseline gap-2">
                       <span className="text-xl font-black text-neutral-300">{formatSize(analysis.limit)}</span>
                       <span className="text-[10px] font-bold text-blue-500 uppercase">{TIER_NAMES[analysis.limit] || 'Custom'}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="w-full mt-6">
                <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (analysis.totalSize / analysis.limit) * 100)}%` }}
                    className={`h-full rounded-full ${ (analysis.totalSize / analysis.limit) > 0.9 ? 'bg-red-500' : 'bg-blue-500' }`}
                  />
                </div>
                <div className="text-[10px] text-neutral-500 font-bold mt-2">
                  {((analysis.totalSize / analysis.limit) * 100).toFixed(1)}% consumed
                </div>
              </div>
            </div>

            {/* 2-6. Categories cards */}
            {analysis.categories.map((cat, idx) => {
              const href = cat.id === 'projects' ? '/projects' : 
                          cat.id === 'libraries' ? '/libraries' :
                          cat.id === 'archives' ? '/exports' : 
                          cat.id === 'trash' ? '/trash' : null;

              const CardContent = (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[cat.id] || COLORS.other }} />
                        <h3 className="text-[10px] uppercase tracking-widest font-black text-neutral-500">{cat.name}</h3>
                      </div>
                      <span className="text-lg font-black text-white">{formatSize(cat.size)}</span>
                    </div>
                    
                    {/* Progress Bar for each category relative to total */}
                    <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden mb-4">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(cat.size / totalSize) * 100}%` }}
                        className="h-full rounded-full" 
                        style={{ backgroundColor: COLORS[cat.id] || COLORS.other }} 
                      />
                    </div>

                    {/* Sub-categories (for Projects) */}
                    {cat.subCategories && (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-2">
                         {cat.subCategories.map(sub => (
                           <div key={sub.id} className="flex flex-col">
                              <span className="text-[9px] text-neutral-500 uppercase font-black tracking-tight mb-0.5">{sub.name}</span>
                              <span className="text-xs font-bold text-neutral-300">{formatSize(sub.size)}</span>
                           </div>
                         ))}
                      </div>
                    )}
                  </div>
                  {href && (
                    <div className="mt-4 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <ChevronRight className="w-4 h-4 text-neutral-500" />
                    </div>
                  )}
                </>
              );

              const cardClasses = `
                p-5 rounded-2xl transition-all duration-300 group flex flex-col justify-between h-full min-h-[220px]
                ${hoveredCategory === cat.id ? 'bg-neutral-800 border-neutral-600' : 'bg-neutral-900/50 border-neutral-800'}
                border backdrop-blur-md ${href ? 'cursor-pointer' : 'cursor-default'}
              `;

              if (href) {
                return (
                  <motion.div
                    key={cat.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    onMouseEnter={() => setHoveredCategory(cat.id)}
                    onMouseLeave={() => setHoveredCategory(null)}
                    className="h-full"
                  >
                    <Link to={href} className={cardClasses}>
                      {CardContent}
                    </Link>
                  </motion.div>
                );
              }

              return (
                <motion.div
                  key={cat.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  onMouseEnter={() => setHoveredCategory(cat.id)}
                  onMouseLeave={() => setHoveredCategory(null)}
                  className={cardClasses}
                >
                  {CardContent}
                </motion.div>
              );
            })}
          </div>

          {/* Quick Stats Panel (Storage Optimization) */}
          <div className="bg-gradient-to-br from-blue-600/10 to-purple-600/10 border border-blue-500/20 rounded-3xl p-8 backdrop-blur-xl">
            <h2 className="text-xl font-black text-white mb-6 flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400 fill-yellow-400" />
              Storage Optimization
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                     <AlertCircle className="w-6 h-6 text-orange-400" />
                  </div>
                  <div>
                     <p className="text-white font-bold mb-1">Clean Orphans</p>
                     <p className="text-sm text-neutral-400">Identify and remove unreferenced files from project folders to reclaim space.</p>
                  </div>
               </div>
                <Link to="/trash" className="flex gap-4 group cursor-pointer">
                  <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-red-500/20 transition-colors">
                     <Trash2 className="w-6 h-6 text-red-400" />
                  </div>
                  <div>
                     <p className="text-white font-bold mb-1 group-hover:text-red-400 transition-colors">Recycle Bin</p>
                     <p className="text-sm text-neutral-400">Total of {formatSize(analysis.categories.find(c => c.id === 'trash')?.size || 0)} can be permanently deleted.</p>
                  </div>
               </Link>
            </div>
          </div>
        </div>

        {/* Right Column: Pie Chart Section */}
        <div className="xl:col-span-5 relative flex items-center justify-center lg:sticky lg:top-8">
          <div className="relative w-full aspect-square max-w-[400px]">
             <svg viewBox="-1.2 -1.2 2.4 2.4" className="w-full h-full -rotate-90">
                <AnimatePresence>
                  {pieSegments.map((seg, i) => (
                    <motion.path
                      key={seg.cat.id}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ 
                        scale: hoveredCategory === seg.cat.id ? 1.05 : 1, 
                        opacity: hoveredCategory && hoveredCategory !== seg.cat.id ? 0.3 : 1
                      }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      d={seg.path}
                      fill={seg.color}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredCategory(seg.cat.id)}
                      onMouseLeave={() => setHoveredCategory(null)}
                    />
                  ))}
                </AnimatePresence>
                {/* Hole for Donut */}
                <circle cx="0" cy="0" r="0.65" className="fill-neutral-950" />
             </svg>
             
             {/* Center Label */}
             <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                <AnimatePresence mode="wait">
                  {hoveredCategory ? (
                    <motion.div
                      key="hovered"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                    >
                      <span className="text-sm font-bold text-neutral-500 uppercase tracking-widest block mb-1">
                        {categories.find(c => c.id === hoveredCategory)?.name}
                      </span>
                      <span className="text-3xl font-black text-white leading-none block">
                        {Math.round((categories.find(c => c.id === hoveredCategory)?.size || 0) / totalSize * 100)}%
                      </span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="total"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <IconPieChart className="w-8 h-8 text-neutral-700 mb-2 mx-auto" />
                      <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest block">Complete Scan</span>
                    </motion.div>
                  )}
                </AnimatePresence>
             </div>
          </div>
        </div>
      </div>

      {/* Project Rankings */}
      <motion.section 
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-16"
      >
        <h2 className="text-2xl font-black text-white mb-8 flex items-center gap-3">
          <Folder className="w-6 h-6 text-neutral-500" />
          Project Rankings
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
          {analysis.projects.map(proj => (
            <Link 
              key={proj.id} 
              to={`/project/${proj.id}`}
              className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 hover:border-blue-500/50 hover:bg-neutral-800/50 transition-all group flex flex-col justify-between h-full min-h-[160px]"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-neutral-200 font-bold group-hover:text-white transition-colors truncate pr-2">{proj.name}</span>
                  <span className="text-sm font-black text-blue-400 whitespace-nowrap">{formatSize(proj.total)}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] uppercase font-black tracking-widest text-neutral-500">
                    <span>Album</span>
                    <span>{formatSize(proj.album)}</span>
                  </div>
                  <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(proj.album / proj.total) * 100}%` }} />
                  </div>
                  {proj.orphans > 0 && (
                    <div className="flex items-center justify-between text-[10px] uppercase font-black tracking-widest text-orange-500/70 group-hover:text-orange-400 transition-colors">
                      <span>Orphans</span>
                      <span>{formatSize(proj.orphans)}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="pt-2 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronRight className="w-3 h-3 text-neutral-600" />
              </div>
            </Link>
          ))}
        </div>
      </motion.section>
    </div>
  );
}
