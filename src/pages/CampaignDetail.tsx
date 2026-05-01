import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Plus, Calendar, Settings, Loader2, AlertCircle } from 'lucide-react';
import { fetchCampaign } from '../api';

export function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [campaign, setCampaign] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    
    const loadCampaign = async () => {
      try {
        setLoading(true);
        const data = await fetchCampaign(id);
        setCampaign(data);
      } catch (err) {
        setError('Failed to load campaign');
      } finally {
        setLoading(false);
      }
    };
    
    loadCampaign();
  }, [id]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="flex items-center gap-2 text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading campaign...
        </div>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-4 text-zinc-500">
          <AlertCircle className="w-10 h-10 text-red-500" />
          <p>{error || 'Campaign not found'}</p>
          <Link to="/campaigns" className="text-indigo-500 hover:underline">Return to Campaigns</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 overflow-hidden">
      <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="flex items-center gap-4">
          <Link to="/campaigns" className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold dark:text-zinc-100">{campaign.name}</h1>
            <p className="text-zinc-500 text-sm mt-1">{campaign.description || 'No description'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-indigo-500 text-white rounded-lg flex items-center gap-2 hover:bg-indigo-600 transition-colors shadow-sm font-medium">
            <Plus className="w-4 h-4" />
            {t('campaigns.newPost', 'New Post')}
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        <div className="flex gap-6 h-full overflow-x-auto pb-4">
          {/* Kanban Columns */}
          <div className="w-80 flex-shrink-0 flex flex-col bg-zinc-100 dark:bg-zinc-900/50 rounded-xl p-4">
            <h3 className="font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Drafts</h3>
            {/* Items */}
          </div>
          <div className="w-80 flex-shrink-0 flex flex-col bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
            <h3 className="font-semibold text-blue-700 dark:text-blue-300 mb-4">Scheduled</h3>
            {/* Items */}
          </div>
          <div className="w-80 flex-shrink-0 flex flex-col bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4">
            <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 mb-4">Published</h3>
            {/* Items */}
          </div>
          <div className="w-80 flex-shrink-0 flex flex-col bg-red-50 dark:bg-red-900/20 rounded-xl p-4">
            <h3 className="font-semibold text-red-700 dark:text-red-300 mb-4">Failed</h3>
            {/* Items */}
          </div>
        </div>
      </div>
    </div>
  );
}
