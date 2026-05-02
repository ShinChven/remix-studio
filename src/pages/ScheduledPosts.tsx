import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  Grid,
  List,
  Loader2,
  Search,
  XCircle,
  Megaphone,
  ArrowRight,
  ExternalLink,
  Twitter,
  Instagram,
  Linkedin,
  Facebook,
  Globe,
  Image as ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchScheduledPosts, fetchScheduledPostCounts } from '../api';
import { PageHeader } from '../components/PageHeader';
import { cn } from '../lib/utils';

type ViewMode = 'list' | 'calendar';

interface ScheduledPost {
  id: string;
  textContent?: string | null;
  status: string;
  scheduledAt: string;
  updatedAt: string;
  campaignId: string;
  campaign?: {
    id: string;
    name: string;
  };
  media?: any[];
}

interface PostCount {
  date: string;
  postCount: number;
  sendCount: number;
}

export function ScheduledPosts() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const viewMode = (searchParams.get('view') as ViewMode) || 'list';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const q = searchParams.get('q') || '';
  
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [counts, setCounts] = useState<PostCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState(q);

  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const loadPosts = async () => {
    if (viewMode === 'calendar') return;
    setIsLoading(true);
    try {
      const data = await fetchScheduledPosts(page, 25, q);
      setPosts(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (error: any) {
      console.error('[ScheduledPosts] loadPosts error:', error);
      toast.error(error.message || 'Failed to load scheduled posts');
    } finally {
      setIsLoading(false);
    }
  };

  const loadCounts = async () => {
    if (viewMode === 'list') return;
    setIsLoading(true);
    try {
      const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
      
      // Expand to cover full weeks
      const from = new Date(startOfMonth);
      from.setDate(from.getDate() - from.getDay());
      const to = new Date(endOfMonth);
      to.setDate(to.getDate() + (6 - to.getDay()));

      const data = await fetchScheduledPostCounts(
        from.toISOString(),
        to.toISOString(),
        new Date().getTimezoneOffset()
      );
      setCounts(data);
    } catch (error: any) {
      console.error('[ScheduledPosts] loadCounts error:', error);
      toast.error(error.message || 'Failed to load post counts');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'list') {
      void loadPosts();
    } else {
      void loadCounts();
    }
  }, [viewMode, page, q, currentMonth]);

  const toggleView = (mode: ViewMode) => {
    const params = new URLSearchParams(searchParams);
    params.set('view', mode);
    if (mode === 'calendar') {
      params.delete('page');
      params.delete('q');
    }
    setSearchParams(params);
  };

  const applySearch = () => {
    const params = new URLSearchParams(searchParams);
    params.set('page', '1');
    if (searchQuery) params.set('q', searchQuery);
    else params.delete('q');
    setSearchParams(params);
  };

  const updatePage = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', newPage.toString());
    setSearchParams(params);
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  // Calendar rendering helpers
  const calendarDays = useMemo(() => {
    const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    
    const days = [];
    
    // Padding from previous month
    const prevMonthLastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 0);
    for (let i = startOfMonth.getDay(); i > 0; i--) {
      days.push({
        date: new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, prevMonthLastDay.getDate() - i + 1),
        isCurrentMonth: false
      });
    }
    
    // Days of current month
    for (let i = 1; i <= endOfMonth.getDate(); i++) {
      days.push({
        date: new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i),
        isCurrentMonth: true
      });
    }
    
    // Padding for next month
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, i),
        isCurrentMonth: false
      });
    }
    
    return days;
  }, [currentMonth]);

  function getPostCountForDate(date: Date) {
    const dateString = date.toISOString().split('T')[0];
    return counts.find(c => c.date === dateString);
  }

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto">
      <div className="w-full flex flex-col gap-6 pb-20">
        <PageHeader
          title="Scheduled Posts"
          description="View and manage your upcoming social media posts."
          backLink={{ to: '/campaigns', label: 'Back to Campaigns' }}
          actions={
            <div className="flex items-center bg-neutral-100 dark:bg-white/5 p-1 rounded-xl">
              <button
                onClick={() => toggleView('list')}
                className={cn(
                  "flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-all",
                  viewMode === 'list' 
                    ? "bg-white dark:bg-neutral-800 text-indigo-600 shadow-sm" 
                    : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                )}
              >
                <List className="h-4 w-4" />
                List
              </button>
              <button
                onClick={() => toggleView('calendar')}
                className={cn(
                  "flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-all",
                  viewMode === 'calendar' 
                    ? "bg-white dark:bg-neutral-800 text-indigo-600 shadow-sm" 
                    : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                )}
              >
                <CalendarIcon className="h-4 w-4" />
                Calendar
              </button>
            </div>
          }
        />

        {viewMode === 'list' ? (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search scheduled posts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applySearch()}
                  className="w-full h-10 pl-10 pr-3 rounded-xl border border-neutral-200 bg-white text-sm focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-neutral-900 dark:text-white"
                />
              </div>
              <button
                onClick={applySearch}
                className="h-10 px-6 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-colors"
              >
                Search
              </button>
            </div>

            <div className="overflow-hidden rounded-card border border-neutral-200/50 bg-white shadow-sm dark:border-white/5 dark:bg-neutral-900/50">
              <div className="hidden lg:grid lg:grid-cols-[1fr_200px_180px_100px] items-center gap-4 px-6 py-3 bg-neutral-50 dark:bg-white/5 border-b border-neutral-200/50 dark:border-white/5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                <span>Post Content</span>
                <span>Campaign</span>
                <span>Scheduled Time</span>
                <span className="text-right">Actions</span>
              </div>

              {isLoading ? (
                <div className="p-12 flex justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                </div>
              ) : posts.length === 0 ? (
                <div className="py-20 text-center">
                  <div className="h-16 w-16 rounded-full bg-neutral-50 dark:bg-white/5 flex items-center justify-center mx-auto mb-4">
                    <Clock className="h-8 w-8 text-neutral-300" />
                  </div>
                  <h3 className="text-lg font-bold">No scheduled posts</h3>
                  <p className="text-sm text-neutral-500 mt-1">
                    {q ? "No results found for your search." : "Your scheduled posts will appear here."}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-neutral-100 dark:divide-white/5">
                  {posts.map((post) => (
                    <div key={post.id} className="px-6 py-4 flex flex-col gap-3 lg:grid lg:grid-cols-[1fr_200px_180px_100px] lg:items-center lg:gap-4 group hover:bg-neutral-50/50 dark:hover:bg-white/5 transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm text-neutral-900 dark:text-white line-clamp-2 font-medium">
                          {post.textContent || <span className="italic text-neutral-400">No text content</span>}
                        </p>
                        {post.media && post.media.length > 0 && (
                          <div className="mt-2 flex gap-1">
                            {post.media.slice(0, 4).map((m, i) => (
                              <div key={i} className="h-8 w-8 rounded-md bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center overflow-hidden border border-neutral-200 dark:border-white/10">
                                {m.thumbnailUrl ? <img src={m.thumbnailUrl} className="h-full w-full object-cover" /> : <ImageIcon className="h-4 w-4 text-neutral-400" />}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <Link
                          to={`/campaigns/${post.campaignId || post.campaign?.id}`}
                          className="text-xs font-bold text-neutral-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate block max-w-full"
                        >
                          {post.campaign?.name || "Unknown Campaign"}
                        </Link>
                      </div>
                      <div className="flex flex-col text-xs text-neutral-500">
                        <span className="font-bold text-neutral-700 dark:text-neutral-300">
                          {new Date(post.scheduledAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                        <span>{new Date(post.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="flex justify-end">
                        <Link
                          to={`/campaigns/${post.campaignId || post.campaign?.id}/posts/edit/${post.id}`}
                          className="h-9 w-9 flex items-center justify-center rounded-xl border border-neutral-200 text-neutral-400 hover:border-indigo-500 hover:bg-indigo-50 hover:text-indigo-600 dark:border-white/10 dark:hover:bg-white/10 dark:hover:text-white transition-all"
                        >
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-neutral-100 dark:border-white/5 bg-neutral-50/30 flex items-center justify-between">
                  <span className="text-xs text-neutral-500">Page {page} of {totalPages}</span>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={page === 1}
                      onClick={() => updatePage(page - 1)}
                      className="h-8 px-4 rounded-lg border border-neutral-200 text-xs font-bold disabled:opacity-30 dark:border-white/10"
                    >
                      Prev
                    </button>
                    <button
                      disabled={page === totalPages}
                      onClick={() => updatePage(page + 1)}
                      className="h-8 px-4 rounded-lg border border-neutral-200 text-xs font-bold disabled:opacity-30 dark:border-white/10"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h3 className="text-xl font-bold">
                  {currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </h3>
                <div className="flex items-center gap-1">
                  <button onClick={prevMonth} className="h-9 w-9 flex items-center justify-center rounded-xl border border-neutral-200 hover:bg-neutral-50 dark:border-white/10 dark:hover:bg-white/5">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button onClick={() => setCurrentMonth(new Date())} className="h-9 px-4 rounded-xl border border-neutral-200 text-sm font-bold hover:bg-neutral-50 dark:border-white/10 dark:hover:bg-white/5">
                    Today
                  </button>
                  <button onClick={nextMonth} className="h-9 w-9 flex items-center justify-center rounded-xl border border-neutral-200 hover:bg-neutral-50 dark:border-white/10 dark:hover:bg-white/5">
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-px bg-neutral-200 dark:bg-white/10 rounded-card overflow-hidden border border-neutral-200 dark:border-white/10">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="bg-neutral-50 dark:bg-neutral-900 py-3 text-center text-[10px] font-black uppercase tracking-widest text-neutral-500">
                  {day}
                </div>
              ))}
              {calendarDays.map((day, i) => {
                const dayData = getPostCountForDate(day.date);
                const isToday = day.date.toDateString() === new Date().toDateString();
                
                return (
                  <div 
                    key={i} 
                    className={cn(
                      "min-h-[120px] p-2 bg-white dark:bg-neutral-900 transition-colors hover:bg-neutral-50 dark:hover:bg-white/5",
                      !day.isCurrentMonth && "opacity-40"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        "text-xs font-bold h-6 w-6 flex items-center justify-center rounded-full",
                        isToday ? "bg-indigo-600 text-white" : "text-neutral-500"
                      )}>
                        {day.date.getDate()}
                      </span>
                    </div>
                    {dayData && dayData.postCount > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="px-2 py-1 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg border border-indigo-100 dark:border-indigo-500/20">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase">Posts</span>
                            <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">{dayData.postCount}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
