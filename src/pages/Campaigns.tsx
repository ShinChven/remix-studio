import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Megaphone, Plus, Users, Calendar, Activity, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { fetchCampaigns, createCampaign } from '../api';
import { toast } from 'sonner';

export function Campaigns() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      const data = await fetchCampaigns();
      setCampaigns(data);
    } catch (error) {
      toast.error('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    try {
      setCreating(true);
      const campaign = await createCampaign({ name, description });
      toast.success('Campaign created successfully');
      setIsModalOpen(false);
      navigate(`/campaign/${campaign.id}`);
    } catch (error) {
      toast.error('Failed to create campaign');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 overflow-hidden relative">
      <div className="flex items-center justify-between p-6 pb-2">
        <h1 className="text-2xl font-bold flex items-center gap-2 dark:text-zinc-100">
          <Megaphone className="w-6 h-6 text-indigo-500" />
          {t('campaigns.title', 'Campaigns')}
        </h1>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 bg-indigo-500 text-white rounded-lg flex items-center gap-2 hover:bg-indigo-600 transition-colors shadow-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          {t('campaigns.new', 'New Campaign')}
        </button>
      </div>

      <div className="p-6 overflow-y-auto">
        {loading ? (
          <div className="text-zinc-500 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('common.loading', 'Loading...')}
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <Megaphone className="w-12 h-12 mx-auto text-zinc-300 dark:text-zinc-700 mb-4" />
            <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 mb-2">No campaigns yet</h3>
            <p className="text-zinc-500 max-w-md mx-auto mb-6">Create a campaign to organize your posts and publish them to connected social media accounts.</p>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 bg-indigo-500 text-white rounded-lg inline-flex items-center gap-2 hover:bg-indigo-600 transition-colors shadow-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              {t('campaigns.new', 'New Campaign')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {campaigns.map((c: any) => (
               <Link to={`/campaign/${c.id}`} key={c.id} className="block group">
                 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 hover:border-indigo-500/50 hover:shadow-md transition-all">
                   <h3 className="font-bold text-lg dark:text-zinc-100 group-hover:text-indigo-500 transition-colors">{c.name}</h3>
                   <p className="text-zinc-500 text-sm mt-1 line-clamp-2">{c.description || 'No description'}</p>
                   <div className="mt-4 flex items-center gap-4 text-xs font-medium text-zinc-400">
                     <div className="flex items-center gap-1.5">
                       <Users className="w-3.5 h-3.5" />
                       {c.socialAccounts?.length || 0} Accounts
                     </div>
                     <div className="flex items-center gap-1.5">
                       <Activity className="w-3.5 h-3.5" />
                       {c._count?.posts || 0} Posts
                     </div>
                   </div>
                 </div>
               </Link>
             ))}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-md shadow-xl border border-zinc-200 dark:border-zinc-800 p-6">
            <h2 className="text-xl font-bold dark:text-zinc-100 mb-4">Create New Campaign</h2>
            <form onSubmit={handleCreate}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-4 py-2.5 text-zinc-900 dark:text-zinc-100 outline-none focus:border-indigo-500"
                    placeholder="E.g., Summer Product Launch"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-4 py-2.5 text-zinc-900 dark:text-zinc-100 outline-none focus:border-indigo-500 resize-none"
                    placeholder="Briefly describe the campaign's goals..."
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !name.trim()}
                  className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create Campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
