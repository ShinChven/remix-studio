import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchAssistantConversationApprovedTools,
  fetchAssistantTools,
  updateAssistantConversationApprovedTools,
  type AssistantToolMetadata,
} from '../../../api';
import { Button, Dialog, LoadingIndicator, Text } from '../../../m3';
import { ChoiceChips } from '../../ui/ChoiceChips';
import { EmptyState } from '../../ui/Page';
import { useToast } from '../../ui/useToast';

type ApprovalMode = 'ask' | 'always';

/** Per-conversation choice, for each tool that writes data, of asking first or approving on its own. */
export function ApprovedToolsDialog({ open, conversationId, onClose }: { open: boolean; conversationId: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [tools, setTools] = useState<AssistantToolMetadata[]>([]);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [savingTool, setSavingTool] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !conversationId) return;
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
      } catch (e) {
        if (!cancelled) toast.error((e as Error)?.message ?? t('assistant.approvedTools.loadFailed', 'Failed to load tool approvals'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, conversationId, t, toast]);

  const setMode = async (toolName: string, mode: ApprovalMode) => {
    if (!conversationId) return;
    const next = new Set(approved);
    if (mode === 'always') next.add(toolName);
    else next.delete(toolName);

    setSavingTool(toolName);
    try {
      const result = await updateAssistantConversationApprovedTools(conversationId, Array.from(next));
      setApproved(new Set(result.tools));
    } catch (e) {
      toast.error((e as Error)?.message ?? t('assistant.approvedTools.saveFailed', 'Failed to update tool approval'));
    } finally {
      setSavingTool(null);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon="verified_user"
      headline={t('assistant.approvedTools.title', 'Tool approvals')}
      maxWidth={680}
      actions={
        <Button variant="text" onClick={onClose}>
          {t('common.close', 'Close')}
        </Button>
      }
    >
      <Text variant="body-medium" className="text-on-surface-variant">
        {t('assistant.approvedTools.subtitle', 'For each tool that writes data, choose whether to ask every time or auto-approve in this chat.')}
      </Text>
      {loading ? (
        <div className="v2-center-pad">
          <LoadingIndicator size={40} aria-label={t('common.loading', 'Loading')} />
        </div>
      ) : tools.length === 0 ? (
        <EmptyState size="inline" icon="build" title={t('assistant.approvedTools.empty', 'No write-capable tools available.')} />
      ) : (
        <ul className="v2-approvals">
          {tools.map((tool) => {
            const mode: ApprovalMode = approved.has(tool.name) ? 'always' : 'ask';
            const isSaving = savingTool === tool.name;
            return (
              <li key={tool.name} className="v2-approvals__row">
                <div className="v2-approvals__text">
                  <div className="v2-approvals__title">
                    <Text variant="title-small">{tool.title || tool.name}</Text>
                    <code className="v2-code-chip">{tool.name}</code>
                  </div>
                  {tool.description && (
                    <Text variant="body-small" className="text-on-surface-variant v2-clamp-2">
                      {tool.description}
                    </Text>
                  )}
                </div>
                <ChoiceChips<ApprovalMode>
                  aria-label={tool.title || tool.name}
                  value={mode}
                  onChange={(value) => void setMode(tool.name, value)}
                  options={[
                    { value: 'ask', label: t('assistant.approvedTools.askEveryTime', 'Ask every time'), disabled: isSaving },
                    { value: 'always', label: t('assistant.approvedTools.approveEveryTime', 'Approve every time'), disabled: isSaving },
                  ]}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
