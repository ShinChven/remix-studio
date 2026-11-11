import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const LAST_CONVERSATION_KEY = 'assistant_last_conversation';

/** Opens a new assistant chat instead of the last one. */
export function forgetLastConversation() {
  try {
    localStorage.removeItem(LAST_CONVERSATION_KEY);
  } catch {
    // Without storage there is no last conversation to forget.
  }
}

export interface ChatContext {
  id: string;
  name: string;
  type: 'project' | 'library';
  subType: string;
}

/** Starts a new assistant chat about a project or a library. */
export function useAssistantChat() {
  const navigate = useNavigate();
  return useCallback(
    (context: ChatContext) => {
      forgetLastConversation();
      navigate('/assistant', { state: { draftBoundContexts: [context] } });
    },
    [navigate],
  );
}
