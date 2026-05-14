import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchAssistantTools,
  fetchAssistantConversationApprovedTools,
  updateAssistantConversationApprovedTools,
  AssistantToolMetadata,
} from '../../api';

interface ApprovedToolsModalProps {
  isOpen: boolean;
  conversationId: string | null;
  onClose: () => void;
}

type ApprovalMode = 'ask' | 'always';

export function ApprovedToolsModal({ isOpen, conversationId, onClose }: ApprovedToolsModalProps) {
  const { t } = useTranslation();
  const [tools, setTools] = useState<AssistantToolMetadata[]>([]);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [savingTool, setSavingTool] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !conversationId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [toolsResp, approvedResp] = await Promise.all([
          fetchAssistantTools(),
          fetchAssistantConversationApprovedTools(conversationId),
        ]);
        if (cancelled) return;
        setTools(toolsResp.tools.filter((tool) => tool.category === 'mutate'));
        setApproved(new Set(approvedResp.tools));
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message ?? t('assistant.approvedTools.loadFailed', 'Failed to load tool approvals'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, conversationId, t]);

  const setMode = async (toolName: string, mode: ApprovalMode) => {
    if (!conversationId) return;
    const next = new Set(approved);
    if (mode === 'always') next.add(toolName);
    else next.delete(toolName);

    const previous = approved;
    setApproved(next);
    setSavingTool(toolName);
    try {
      const result = await updateAssistantConversationApprovedTools(
        conversationId,
        Array.from(next),
      );
      setApproved(new Set(result.tools));
    } catch (e: any) {
      setApproved(previous);
      toast.error(e?.message ?? t('assistant.approvedTools.saveFailed', 'Failed to update tool approval'));
    } finally {
      setSavingTool(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        className="bg-white/70 dark:bg-neutral-900/70 border border-neutral-200/50 dark:border-white/5 backdrop-blur-2xl rounded-card shadow-[0_50px_100px_rgba(0,0,0,0.8)] max-w-2xl w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[min(720px,calc(100dvh-3rem))] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 sm:p-8 flex items-start gap-4 sm:gap-6 border-b border-neutral-200/50 dark:border-white/5">
          <div className="p-3 sm:p-4 rounded-card flex-shrink-0 bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
            <ShieldCheck className="w-6 h-6 sm:w-8 sm:h-8" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg sm:text-2xl font-black text-neutral-900 dark:text-white tracking-tight leading-tight">
              {t('assistant.approvedTools.title', 'Tool approvals')}
            </h3>
            <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-2 leading-relaxed">
              {t(
                'assistant.approvedTools.subtitle',
                'For each tool that writes data, choose whether to ask every time or auto-approve in this chat.',
              )}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 sm:p-8">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-neutral-500">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : tools.length === 0 ? (
            <div className="text-center text-sm text-neutral-500 dark:text-neutral-400 py-12">
              {t('assistant.approvedTools.empty', 'No write-capable tools available.')}
            </div>
          ) : (
            <ul className="space-y-3">
              {tools.map((tool) => {
                const isApproved = approved.has(tool.name);
                const mode: ApprovalMode = isApproved ? 'always' : 'ask';
                const isSaving = savingTool === tool.name;
                return (
                  <li
                    key={tool.name}
                    className="bg-white/60 dark:bg-black/20 border border-neutral-200/60 dark:border-white/5 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-neutral-900 dark:text-white truncate">
                          {tool.title || tool.name}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-neutral-200/60 dark:bg-neutral-800/60 text-neutral-600 dark:text-neutral-400 font-mono">
                          {tool.name}
                        </span>
                      </div>
                      {tool.description && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-2">
                          {tool.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800/60 rounded-lg p-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => setMode(tool.name, 'ask')}
                        disabled={isSaving}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                          mode === 'ask'
                            ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                            : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                        } disabled:opacity-50`}
                      >
                        {t('assistant.approvedTools.askEveryTime', 'Ask every time')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode(tool.name, 'always')}
                        disabled={isSaving}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                          mode === 'always'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                        } disabled:opacity-50`}
                      >
                        {t('assistant.approvedTools.approveEveryTime', 'Approve every time')}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-5 py-4 sm:px-8 sm:py-6 bg-neutral-100/50 dark:bg-black/20 backdrop-blur-xl flex justify-end border-t border-neutral-200/50 dark:border-white/5">
          <button
            onClick={onClose}
            className="px-5 sm:px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-all active:scale-95"
          >
            {t('common.close', 'Close')}
          </button>
        </div>
      </div>
    </div>
  );
}
