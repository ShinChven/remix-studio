import {
  type ChangeEvent,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useRef,
  useState,
} from 'react'
import { cx, useControllableState } from '../utils/hooks'
import { IconButton } from './Button'
import { InputChip, SuggestionChip } from './Chip'
import { Icon } from './Icon'
import { Avatar } from './List'
import { LinearProgress } from './Progress'

export type ChatRole = 'user' | 'assistant' | 'system'
export type ChatBubbleShape = 'asymmetric' | 'rounded' | 'pill'
export type ChatUserColor = 'primary' | 'secondary' | 'tertiary'

export interface ChatAttachment {
  /** Unique ID for the attachment */
  id: string
  /** Display name of the file */
  name: string
  /** Human-readable size (e.g. 1.2 MB) */
  size?: string
  /** Material Symbols icon name (e.g. description, image) */
  icon?: string
}

export interface ChatMessageData {
  /** Unique message ID */
  id: string
  /** Sender role: user, assistant, or system */
  role: ChatRole
  /** Text content of the message */
  content: string
  /** ISO or formatted timestamp string */
  timestamp?: string
  /** Custom avatar element override */
  avatar?: ReactNode
  /** Collapsible chain-of-thought or reasoning text */
  thought?: string
  /** Attached files associated with the message */
  attachments?: ChatAttachment[]
  /** Delivery or streaming status */
  status?: 'sent' | 'streaming' | 'error'
  /** User feedback: true (thumbs up), false (thumbs down), null/undefined (neutral) */
  liked?: boolean | null
}

export interface ChatMessageProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onCopy'> {
  /** Message data object */
  message: ChatMessageData
  /** Geometry of message bubbles */
  shape?: ChatBubbleShape
  /** Container color role for user messages */
  userColor?: ChatUserColor
  /** Whether to render avatar icons beside bubbles */
  showAvatar?: boolean
  /** Whether to render timestamps below bubbles */
  showTimestamp?: boolean
  /** Callback when user clicks thumbs up or thumbs down */
  onLike?: (liked: boolean) => void
  /** Callback when user clicks copy content */
  onCopy?: (content: string) => void
  /** Callback when user clicks regenerate/retry on assistant message */
  onRetry?: () => void
  /** Optional custom action elements, shown for user messages too */
  actions?: ReactNode
  /** Content stacked above the bubble, such as a reasoning trace shown on its own */
  before?: ReactNode
  /** Content stacked below the bubble, such as tool call details */
  after?: ReactNode
  /** Set false to leave out the bubble and keep only `before`, `after` and the meta row */
  bubble?: boolean
  /** Set false to hide the copy button on assistant messages */
  copyable?: boolean
  /** Ref to the message row element */
  ref?: Ref<HTMLDivElement>
}

export interface ChatThoughtAccordionProps extends HTMLAttributes<HTMLDivElement> {
  /** Reasoning trace or chain-of-thought text */
  thought: string
  /** Whether the accordion starts expanded */
  defaultOpen?: boolean
  /** Header label */
  title?: string
  /** Ref to accordion element */
  ref?: Ref<HTMLDivElement>
}

export interface ChatPromptSuggestionsProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  /** Prompt starter strings */
  suggestions: readonly string[]
  /** Callback when a suggestion is clicked */
  onSelect: (prompt: string) => void
  /** Ref to container element */
  ref?: Ref<HTMLDivElement>
}

export interface ChatInputBarProps {
  /** Current controlled input value */
  value?: string
  /** Default uncontrolled input value */
  defaultValue?: string
  /** Placeholder text */
  placeholder?: string
  /** Disables typing and actions */
  disabled?: boolean
  /** Indicates model is currently streaming an answer */
  streaming?: boolean
  /** Currently attached files */
  attachments?: ChatAttachment[]
  /** Callback to remove an attachment chip */
  onRemoveAttachment?: (id: string) => void
  /** Callback when attach button is clicked */
  onAttachClick?: () => void
  /** Callback when web search toggle is clicked */
  onSearchToggle?: () => void
  /** Whether web search grounding is active */
  searchActive?: boolean
  /** Value change callback */
  onChange?: (value: string) => void
  /** Callback when user submits a message */
  onSend?: (value: string) => void
  /** Callback when user stops generation */
  onStop?: () => void
  /** Optional CSS class name */
  className?: string
  /** Optional inline styles */
  style?: CSSProperties
}

export interface ChatAssistantProps extends HTMLAttributes<HTMLDivElement> {
  /** Header title */
  title?: string
  /** Header subtitle or status description */
  subtitle?: string
  /** Controlled list of messages */
  messages?: ChatMessageData[]
  /** Default uncontrolled messages */
  defaultMessages?: ChatMessageData[]
  /** Quick prompt suggestions shown above input */
  suggestions?: readonly string[]
  /** Selected AI model identifier */
  model?: string
  /** Available models */
  models?: readonly string[]
  /** Callback when model selection changes */
  onModelChange?: (model: string) => void
  /** Indicates whether the assistant is currently streaming */
  streaming?: boolean
  /** Visual density: standard or compact */
  density?: 'default' | 'compact'
  /** Corner shape for message bubbles */
  shape?: ChatBubbleShape
  /** User bubble color container role */
  userColor?: ChatUserColor
  /** Whether avatars are visible */
  showAvatars?: boolean
  /** Whether timestamps are visible */
  showTimestamps?: boolean
  /** Whether suggestions are visible */
  showSuggestions?: boolean
  /** Input field placeholder */
  placeholder?: string
  /** Callback when a message is sent */
  onSend?: (content: string) => void
  /** Callback to stop generation */
  onStop?: () => void
  /** Callback to clear message history */
  onClear?: () => void
  /** Callback when user retries an assistant message */
  onRetry?: (messageId: string) => void
  /** Callback when feedback thumbs are clicked */
  onFeedback?: (messageId: string, liked: boolean) => void
  /** Custom empty state when no messages exist */
  emptyState?: ReactNode
  /** Custom header trailing actions */
  headerActions?: ReactNode
  /** Ref to root assistant container */
  ref?: Ref<HTMLDivElement>
}

/**
 * Collapsible accordion for AI reasoning / Chain-of-Thought (M3 Expressive).
 */
export function ChatThoughtAccordion({
  thought,
  defaultOpen = false,
  title = 'Thought Process',
  className,
  ref,
  ...rest
}: ChatThoughtAccordionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div {...rest} ref={ref} className={cx('m3-chat-thought', className)}>
      <button
        type="button"
        className="m3-chat-thought__summary"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <span className="m3-chat-thought__label">
          <Icon name="psychology" size={18} />
          <span>{title}</span>
        </span>
        <Icon name={open ? 'expand_less' : 'expand_more'} size={18} />
      </button>
      {open && <div className="m3-chat-thought__content">{thought}</div>}
    </div>
  )
}

/**
 * Row of M3 Expressive suggestion chips for quick replies or prompt starters.
 */
export function ChatPromptSuggestions({
  suggestions,
  onSelect,
  className,
  ref,
  ...rest
}: ChatPromptSuggestionsProps) {
  if (!suggestions.length) return null

  return (
    <div {...rest} ref={ref} className={cx('m3-chat-suggestions', className)}>
      {suggestions.map((prompt) => (
        <SuggestionChip
          key={prompt}
          label={prompt}
          icon="auto_awesome"
          onClick={() => onSelect(prompt)}
        />
      ))}
    </div>
  )
}

/**
 * Formats message text with support for code blocks and paragraph breaks.
 */
function renderInlineMarkdown(text: string): ReactNode {
  const regex = /(`[^`]+`|\*\*[^*]+\*\*)/g
  const tokens = text.split(regex)
  return tokens.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        // biome-ignore lint/suspicious/noArrayIndexKey: pure text segments
        <code key={`c-${i}`} className="m3-chat-inline-code">
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      // biome-ignore lint/suspicious/noArrayIndexKey: pure text segments
      return <strong key={`b-${i}`}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

function FormattedMessageContent({
  content,
  onCopyCode,
}: {
  content: string
  onCopyCode?: (code: string) => void
}) {
  const matches = Array.from(content.matchAll(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g))
  const parts: ReactNode[] = []
  let lastIndex = 0

  for (const match of matches) {
    const matchIndex = match.index ?? 0
    if (matchIndex > lastIndex) {
      const textChunk = content.slice(lastIndex, matchIndex)
      parts.push(
        <span key={`text-${lastIndex}`} style={{ whiteSpace: 'pre-wrap' }}>
          {renderInlineMarkdown(textChunk)}
        </span>,
      )
    }

    const language = match[1] || 'code'
    const code = match[2] || ''
    const currentCode = code.trim()

    parts.push(
      <div key={`code-${matchIndex}`} className="m3-chat-code">
        <div className="m3-chat-code__header">
          <span>{language}</span>
          {onCopyCode && (
            <IconButton
              icon="content_copy"
              label="Copy snippet"
              size="xs"
              tooltip
              onClick={() => onCopyCode(currentCode)}
            />
          )}
        </div>
        <pre className="m3-chat-code__pre">
          <code>{currentCode}</code>
        </pre>
      </div>,
    )

    lastIndex = matchIndex + match[0].length
  }

  if (lastIndex < content.length) {
    const textChunk = content.slice(lastIndex)
    parts.push(
      <span key={`text-${lastIndex}`} style={{ whiteSpace: 'pre-wrap' }}>
        {renderInlineMarkdown(textChunk)}
      </span>,
    )
  }

  return <>{parts.length > 0 ? parts : renderInlineMarkdown(content)}</>
}

/**
 * Individual chat message bubble with M3 Expressive directional shapes and role colors.
 */
export function ChatMessage({
  message,
  shape = 'asymmetric',
  userColor = 'primary',
  showAvatar = true,
  showTimestamp = true,
  onLike,
  onCopy,
  onRetry,
  actions,
  before,
  after,
  bubble = true,
  copyable = true,
  children,
  className,
  ref,
  ...rest
}: ChatMessageProps) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const isSystem = message.role === 'system'

  const copyText = () => {
    if (onCopy) onCopy(message.content)
    else if (navigator.clipboard) navigator.clipboard.writeText(message.content)
  }

  if (isSystem) {
    return (
      <div {...rest} ref={ref} className={cx('m3-chat-message-row', className)} data-role="system">
        <div className="m3-chat-bubble" data-role="system">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div
      {...rest}
      ref={ref}
      className={cx('m3-chat-message-row', className)}
      data-role={message.role}
    >
      {/* Left Avatar for Assistant */}
      {isAssistant && showAvatar && (
        <div className="m3-chat-avatar-slot">
          {message.avatar ?? <Avatar icon="auto_awesome" shape="soft-burst" size={32} />}
        </div>
      )}

      <div className="m3-chat-bubble-container">
        {before}
        {/* Message Bubble */}
        {bubble && (
          <div
            className="m3-chat-bubble"
            data-role={message.role}
            data-shape={shape}
            data-color={isUser ? userColor : undefined}
            data-status={message.status}
          >
            {/* Thinking Accordion (Chain of Thought) */}
            {message.thought && <ChatThoughtAccordion thought={message.thought} />}

            {children ?? <FormattedMessageContent content={message.content} onCopyCode={onCopy} />}

            {/* Streaming Cursor */}
            {message.status === 'streaming' && <span className="m3-chat-cursor" aria-hidden="true" />}
          </div>
        )}
        {after}
        {/* Timestamp and Actions */}
        <div className="m3-chat-meta">
          {showTimestamp && message.timestamp && <span>{message.timestamp}</span>}

          {/* Assistant Action Buttons */}
          {((isAssistant && copyable) || actions) && message.status !== 'streaming' && (
            <div className="m3-chat-actions">
              {isAssistant && copyable && (
                <IconButton
                  icon="content_copy"
                  label="Copy response"
                  size="xs"
                  tooltip
                  onClick={copyText}
                />
              )}
              {onLike && (
                <>
                  <IconButton
                    icon="thumb_up"
                    label="Good response"
                    size="xs"
                    tooltip
                    selected={message.liked === true}
                    onClick={() => onLike(true)}
                  />
                  <IconButton
                    icon="thumb_down"
                    label="Bad response"
                    size="xs"
                    tooltip
                    selected={message.liked === false}
                    onClick={() => onLike(false)}
                  />
                </>
              )}
              {onRetry && (
                <IconButton
                  icon="refresh"
                  label="Regenerate response"
                  size="xs"
                  tooltip
                  onClick={onRetry}
                />
              )}
              {actions}
            </div>
          )}
        </div>
      </div>

      {/* Right Avatar for User */}
      {isUser && showAvatar && (
        <div className="m3-chat-avatar-slot">
          {message.avatar ?? <Avatar icon="person" shape="circle" size={32} />}
        </div>
      )}
    </div>
  )
}

/**
 * Docked or floating bottom input bar with expanding textarea and attachment tray.
 */
export function ChatInputBar({
  value: valueProp,
  defaultValue = '',
  placeholder = 'Ask a question or type a prompt...',
  disabled = false,
  streaming = false,
  attachments = [],
  onRemoveAttachment,
  onAttachClick,
  onSearchToggle,
  searchActive = false,
  onChange,
  onSend,
  onStop,
  className,
  style,
}: ChatInputBarProps) {
  const [text, setText] = useControllableState({
    value: valueProp,
    defaultValue,
    onChange,
  })
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    // Auto-resize textarea
    const target = e.target
    target.style.height = 'auto'
    target.style.height = `${Math.min(target.scrollHeight, 160)}px`
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const submit = () => {
    if (streaming) {
      onStop?.()
      return
    }
    const trimmed = text.trim()
    if (!trimmed && attachments.length === 0) return
    onSend?.(trimmed)
    setText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  return (
    <div className={cx('m3-chat-input-bar', className)} style={style}>
      <div className="m3-chat-input-pill">
        {/* Attachments preview */}
        {attachments.length > 0 && (
          <div className="m3-chat-attachments">
            {attachments.map((file) => (
              <InputChip
                key={file.id}
                label={file.name}
                icon={file.icon || 'description'}
                onRemove={onRemoveAttachment ? () => onRemoveAttachment(file.id) : undefined}
              />
            ))}
          </div>
        )}

        {/* Text Input */}
        <textarea
          ref={textareaRef}
          className="m3-chat-input-field"
          rows={1}
          placeholder={placeholder}
          value={text}
          disabled={disabled}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          aria-label="Prompt input"
        />

        {/* Controls row */}
        <div className="m3-chat-input-controls">
          <div className="m3-chat-input-leading">
            {onAttachClick && (
              <IconButton
                icon="attach_file"
                label="Attach file or context"
                size="sm"
                tooltip
                disabled={disabled}
                onClick={onAttachClick}
              />
            )}
            {onSearchToggle && (
              <IconButton
                icon="travel_explore"
                label="Search grounding"
                size="sm"
                tooltip
                selected={searchActive}
                disabled={disabled}
                onClick={onSearchToggle}
              />
            )}
          </div>

          <div className="m3-chat-input-trailing">
            {streaming ? (
              <IconButton
                icon="stop"
                variant="filled"
                label="Stop generation"
                size="sm"
                tooltip
                onClick={onStop}
              />
            ) : (
              <IconButton
                icon="arrow_upward"
                variant="filled"
                label="Send message"
                size="sm"
                tooltip
                disabled={disabled || (!text.trim() && attachments.length === 0)}
                onClick={submit}
              />
            )}
          </div>
        </div>
      </div>

      <p className="m3-chat-disclaimer">
        AI may produce inaccurate information. Please verify important facts.
      </p>
    </div>
  )
}

/**
 * Material 3 Expressive Chat Assistant: full conversational turnkey view.
 */
export function ChatAssistant({
  title = 'AI Assistant',
  subtitle = 'Powered by Material 3 Expressive',
  messages: messagesProp,
  defaultMessages = [],
  suggestions = [],
  model = 'Gemini 4 Argon',
  models = ['Gemini 4 Argon', 'Gemini 4 Flash', 'Claude 3.5 Sonnet'],
  onModelChange,
  streaming = false,
  density = 'default',
  shape = 'asymmetric',
  userColor = 'primary',
  showAvatars = true,
  showTimestamps = true,
  showSuggestions = true,
  placeholder = 'Ask anything...',
  onSend,
  onStop,
  onClear,
  onRetry,
  onFeedback,
  emptyState,
  headerActions,
  className,
  ref,
  ...rest
}: ChatAssistantProps) {
  const [messages, setMessages] = useControllableState({
    value: messagesProp,
    defaultValue: defaultMessages,
  })
  const viewportRef = useRef<HTMLDivElement>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to bottom whenever messages or streaming updates
  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight
    }
  }, [messages, streaming])

  const handleSend = (text: string) => {
    if (onSend) {
      onSend(text)
      return
    }
    const userMsg: ChatMessageData = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
    setMessages((prev) => [...prev, userMsg])
  }

  const handleFeedback = (messageId: string, liked: boolean) => {
    if (onFeedback) {
      onFeedback(messageId, liked)
      return
    }
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, liked: m.liked === liked ? null : liked } : m)),
    )
  }

  return (
    <div {...rest} ref={ref} className={cx('m3-chat-assistant', className)} data-density={density}>
      {/* Header */}
      <div className="m3-chat-header">
        <div className="m3-chat-header__info">
          <Avatar icon="auto_awesome" shape="soft-burst" size={36} />
          <div className="m3-chat-header__titles">
            <h3 className="m3-chat-header__title">{title}</h3>
            <span className="m3-chat-header__status">
              <span className="m3-chat-header__dot" />
              {streaming ? 'Generating response...' : model}
            </span>
          </div>
        </div>

        <div className="m3-chat-header__actions">
          {onClear && (
            <IconButton
              icon="delete_outline"
              label="Clear conversation"
              size="sm"
              tooltip
              onClick={onClear}
            />
          )}
          {headerActions}
        </div>
      </div>

      {/* Streaming Progress Bar */}
      {streaming && <LinearProgress aria-label="Generating answer" />}

      {/* Messages Viewport */}
      <div ref={viewportRef} className="m3-chat-viewport">
        {messages.length === 0
          ? (emptyState ?? (
              <div className="m3-chat-empty-state">
                <Avatar
                  icon="auto_awesome"
                  shape="soft-burst"
                  size={56}
                  className="m3-chat-empty-state__icon"
                />
                <h4 className="m3-chat-empty-state__title">How can I assist you today?</h4>
                <p className="m3-chat-empty-state__desc">
                  Ask a technical question, summarize content, or brainstorm creative ideas using
                  Material 3 Expressive principles.
                </p>
              </div>
            ))
          : messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                shape={shape}
                userColor={userColor}
                showAvatar={showAvatars}
                showTimestamp={showTimestamps}
                onLike={(liked) => handleFeedback(msg.id, liked)}
                onRetry={onRetry ? () => onRetry(msg.id) : undefined}
              />
            ))}
      </div>

      {/* Prompt Suggestions */}
      {showSuggestions && suggestions.length > 0 && (
        <ChatPromptSuggestions
          suggestions={suggestions}
          onSelect={(prompt) => handleSend(prompt)}
        />
      )}

      {/* Bottom Input */}
      <ChatInputBar
        placeholder={placeholder}
        streaming={streaming}
        onSend={handleSend}
        onStop={onStop}
      />
    </div>
  )
}
