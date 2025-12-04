import { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import VkStyleInput from './VkStyleInput';
import { formatRole } from '../utils/roleLabels';
import { ensureNotificationPermission } from '../utils/notifications';
import { formatMessageDate } from '../utils/dateUtils';
import * as attachmentsApi from '../api/attachmentsApi';

const getParticipantId = (p) => {
  const raw = p?.id || p?._id || p;
  if (!raw) return null;
  if (typeof raw === 'string') return raw;
  if (typeof raw?.toString === 'function') return raw.toString();
  return null;
};

const getMessageId = (m) => m?.id || m?._id || null;

const ChatWindow = ({
  chat,
  messages,
  lastReadAt,
  currentUserId,
  typingUsers,
  onToggleNotifications,
  onOpenManage,
  onSend,
  onTypingStart,
  onTypingStop,
  socketConnected,
  onBlock,
  onUnblock,
  pinnedMessageIds,
  onPin,
  onUnpin,
  onToggleReaction,
  onDeleteForMe,
  onDeleteForAll,
  onUpdateModeration,
  auditLog,
  onLoadAudit,
}) => {
  const listRef = useRef(null);
  const typingTimer = useRef(null);
  const typingActive = useRef(false);
  const fileInputRef = useRef(null);

  const [showSettings, setShowSettings] = useState(false);
  const [unreadSeparatorMessageId, setUnreadSeparatorMessageId] = useState(null);
  const [showManageModal, setShowManageModal] = useState(false);
  const [separatorCleared, setSeparatorCleared] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMentions, setSelectedMentions] = useState([]);
  const [auditVisible, setAuditVisible] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);

  // Safe aliases (не падать на медленной загрузке данных)
  const chatId = (chat?.id || chat?._id || '').toString();
  const chatType = chat?.type || 'direct';
  const participants = chat?.participants || [];
  const safeMessages = Array.isArray(messages) ? messages : [];
  const currentId = currentUserId?.toString();

  useEffect(() => {
    setUnreadSeparatorMessageId(null);
    setShowManageModal(false);
    setSeparatorCleared(false);
    setMessageText('');
    setSearchTerm('');
    setSelectedMentions([]);
    setAuditVisible(false);
    setPendingAttachments([]);
    setUploadingAttachments(false);
    setShowSettings(false);

    if (typingTimer.current) {
      clearTimeout(typingTimer.current);
    }
    if (typingActive.current && onTypingStop && chatId) {
      onTypingStop(chatId);
    }
    typingActive.current = false;
  }, [chatId, onTypingStop]);

  const getSenderId = (message) =>
    message?.senderId || message?.sender?.id || message?.sender?._id || message?.sender || null;

  useEffect(
    () => () => {
      if (typingTimer.current) {
        clearTimeout(typingTimer.current);
      }
      if (typingActive.current && onTypingStop && chatId) {
        onTypingStop(chatId);
      }
      typingActive.current = false;
    },
    [chatId, onTypingStop]
  );

  // Unread separator
  useEffect(() => {
    if (!chatId || unreadSeparatorMessageId || separatorCleared) return;
    if (!safeMessages.length) return;

    const threshold = lastReadAt || chat?.lastReadAt;
    const currentUserIdStr = currentUserId?.toString();

    const separatorMsg = safeMessages.find((message) => {
      const senderId = getSenderId(message);
      const isOwnMessage = senderId && currentUserIdStr && senderId.toString() === currentUserIdStr;
      if (isOwnMessage) return false;

      if (!threshold) return true;
      return new Date(message.createdAt) > new Date(threshold);
    });

    if (separatorMsg) {
      const id = getMessageId(separatorMsg);
      if (id) setUnreadSeparatorMessageId(id.toString());
    }
  }, [chatId, safeMessages, chat?.lastReadAt, lastReadAt, unreadSeparatorMessageId, separatorCleared, currentUserId]);

  // Auto-scroll
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [safeMessages]);

  // Local search (E2E-friendly)
  const filteredMessages = useMemo(() => {
    const query = (searchTerm || '').trim().toLowerCase();
    if (!query) return safeMessages;
    return safeMessages.filter((message) => (message.text || '').toLowerCase().includes(query));
  }, [safeMessages, searchTerm]);

  const participantIds = useMemo(
    () => (participants || []).map(getParticipantId).filter(Boolean),
    [participants]
  );

  const mentionableParticipants = useMemo(
    () =>
      (participants || []).filter((p) => {
        const id = getParticipantId(p);
        return id && id !== currentId;
      }),
    [participants, currentId]
  );

  const otherUser = useMemo(() => {
    if (chatType !== 'direct') return null;
    if (chat?.otherUser) return chat.otherUser;

    return (
      (participants || []).find((p) => {
        const pid = getParticipantId(p);
        return pid && currentId && pid !== currentId;
      }) || null
    );
  }, [chatType, chat?.otherUser, participants, currentId]);

  const otherUserId = (otherUser?.id || otherUser?._id || otherUser || '')?.toString?.() || '';

  const isRemovedFromGroup =
    chatType === 'group' &&
    (!participantIds.includes(currentId) ||
      (chat?.removedParticipants || []).some((id) => (id?.toString?.() || id) === currentId) ||
      chat?.removed);

  const isBlockedByMe =
    chatType === 'direct' &&
    (chat?.blocks || []).some((b) => (b.by?.toString?.() || b.by) === currentId && (b.target?.toString?.() || b.target) === otherUserId);

  const isBlockedMe =
    chatType === 'direct' &&
    (chat?.blocks || []).some((b) => (b.by?.toString?.() || b.by) === otherUserId && (b.target?.toString?.() || b.target) === currentId);

  const chatBlocked = chatType === 'direct' && (isBlockedByMe || isBlockedMe);

  const canManageGroup =
    chatType === 'group' &&
    ((chat?.createdBy?.toString?.() || chat?.createdBy) === currentId ||
      (chat?.admins || []).map((x) => x?.toString?.() || x).includes(currentId));

  const headerTitle =
    chatType === 'group'
      ? chat?.title || 'Групповой чат'
      : otherUser?.displayName || otherUser?.username || 'Диалог';

  const headerMeta =
    chatType === 'group'
      ? `Участников: ${participants.length}`
      : `${formatRole(otherUser?.role)} · ${otherUser?.department || 'Отдел не указан'} · ${
          chat?.isOnline ? 'онлайн' : 'офлайн'
        }`;

  // Moderation derived before bottomNotice (иначе TDZ)
  const isMuted = !!(chat?.muteUntil && new Date(chat.muteUntil).getTime() > Date.now());
  const muteUntilText = isMuted ? new Date(chat?.muteUntil).toLocaleString() : null;
  const rateLimitPerMinute = chat?.rateLimitPerMinute || null;

  const bottomNotice = useMemo(() => {
    if (isRemovedFromGroup) {
      return 'Вы удалены из этой группы. Вы можете просматривать историю сообщений, но отправка новых сообщений недоступна.';
    }

    if (chatType === 'group' && isMuted && !canManageGroup) {
      return `Чат на паузе до ${muteUntilText}`;
    }

    if (!chatBlocked) return '';

    if (isBlockedByMe && isBlockedMe) {
      return 'Вы с этим пользователем заблокировали друг друга. Переписка в этом чате недоступна, пока хотя бы один из вас не снимет блокировку.';
    }

    if (isBlockedByMe) {
      return 'Вы заблокировали этого пользователя. Переписка в этом чате временно недоступна. Чтобы продолжить, разблокируйте пользователя в разделе "Управление".';
    }

    if (isBlockedMe) {
      return 'Этот пользователь заблокировал вас. Вы не можете отправлять сообщения в этом чате.';
    }

    return '';
  }, [chatBlocked, isBlockedByMe, isBlockedMe, isRemovedFromGroup, chatType, isMuted, muteUntilText, canManageGroup]);

  const pinnedSet = useMemo(() => new Set((pinnedMessageIds || []).map((x) => x?.toString?.() || x)), [pinnedMessageIds]);

  const pinnedMessages = useMemo(
    () =>
      (pinnedMessageIds || []).map((idRaw) => {
        const id = (idRaw?.toString?.() || idRaw || '').toString();
        const found = safeMessages.find((message) => (getMessageId(message)?.toString?.() || '') === id);
        return { id, message: found };
      }),
    [safeMessages, pinnedMessageIds]
  );

  const canPinMessages =
    chatType === 'direct' ||
    (chat?.createdBy?.toString?.() || chat?.createdBy) === currentId ||
    (chat?.admins || []).map((x) => x?.toString?.() || x).includes(currentId);

  const canReact = !isRemovedFromGroup && !chatBlocked;
  const reactionOptions = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🙏', '👏', '🔥', '✅'];

  const typingHint = useMemo(() => {
    if (isRemovedFromGroup || chatBlocked) return '';
    if (chatType === 'group') {
      if (typingUsers?.length) {
        const names = (participants || [])
          .filter((p) => typingUsers.includes(getParticipantId(p)))
          .map((p) => p.displayName || p.username);
        if (names?.length) return `${names.join(', ')} печатает...`;
      }
      return '';
    }

    const isOtherTyping = typingUsers?.includes(otherUserId);
    return isOtherTyping
      ? `Пользователь ${otherUser?.displayName || otherUser?.username || 'собеседник'} печатает...`
      : '';
  }, [participants, chatType, typingUsers, otherUser, otherUserId, isRemovedFromGroup, chatBlocked]);

  const handleInputChange = (value) => {
    setMessageText(value);
    const hasText = value.trim().length > 0;

    if (hasText && !typingActive.current && chatId) {
      onTypingStart && onTypingStart(chatId);
      typingActive.current = true;
    }

    if (typingTimer.current) {
      clearTimeout(typingTimer.current);
    }

    typingTimer.current = setTimeout(() => {
      if (typingActive.current && chatId) {
        onTypingStop && onTypingStop(chatId);
      }
      typingActive.current = false;
    }, 1200);

    if (!hasText) {
      if (typingActive.current && chatId) {
        onTypingStop && onTypingStop(chatId);
      }
      typingActive.current = false;
    }
  };

  const handleSend = async () => {
    const trimmed = messageText.trim();
    const hasAttachments = pendingAttachments.length > 0;
    if (!trimmed && !hasAttachments) return;

    setUnreadSeparatorMessageId(null);
    setSeparatorCleared(true);

    try {
      const attachmentIds = pendingAttachments
        .map((att) => (att?.id || att?._id || '').toString())
        .filter(Boolean);

      await onSend(trimmed, selectedMentions, attachmentIds);
    } catch (err) {
      const text = err?.response?.data?.message || err?.message || 'Не удалось отправить сообщение';
      // eslint-disable-next-line no-alert
      alert(text);
      return;
    }

    setMessageText('');
    setSelectedMentions([]);
    setPendingAttachments([]);

    if (typingActive.current && chatId) {
      onTypingStop && onTypingStop(chatId);
    }
    typingActive.current = false;

    if (typingTimer.current) {
      clearTimeout(typingTimer.current);
    }
  };

  const handleDeleteForMe = async (messageId) => {
    const id = (messageId?.toString?.() || messageId || '').toString();
    if (!id) return;
    await onDeleteForMe(id);
  };

  const handleDeleteForAll = async (message) => {
    try {
      const id = (getMessageId(message)?.toString?.() || '').toString();
      if (!id) return;
      await onDeleteForAll(id);
    } catch (err) {
      const text = err?.response?.data?.message || err?.message || 'Не удалось удалить сообщение';
      // eslint-disable-next-line no-alert
      alert(text);
    }
  };

  const addMention = (userIdRaw) => {
    const userId = (userIdRaw || '').toString();
    if (!userId) return;

    setSelectedMentions((prev) => {
      if (prev.includes(userId)) return prev;

      const participant = (participants || []).find((p) => getParticipantId(p) === userId);
      if (!participant) return prev;

      const name = participant.displayName || participant.username || 'пользователь';
      setMessageText((prevText) => `${prevText}${prevText.endsWith(' ') || !prevText ? '' : ' '}@${name} `);

      return [...prev, userId];
    });
  };

  const removeMention = (userId) => {
    const id = (userId || '').toString();
    setSelectedMentions((prev) => prev.filter((x) => x !== id));
  };

  const handleMutePreset = async (minutes) => {
    const until = minutes ? new Date(Date.now() + minutes * 60 * 1000).toISOString() : null;
    try {
      await onUpdateModeration({ muteUntil: until });
    } catch (err) {
      const text = err?.response?.data?.message || err?.message || 'Не удалось обновить настройки';
      // eslint-disable-next-line no-alert
      alert(text);
    }
  };

  const handleRateLimitPreset = async (limit) => {
    try {
      await onUpdateModeration({ rateLimitPerMinute: limit });
    } catch (err) {
      const text = err?.response?.data?.message || err?.message || 'Не удалось обновить лимит';
      // eslint-disable-next-line no-alert
      alert(text);
    }
  };

  const handleAttachmentSelect = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    if (!chatId) {
      if (event.target) event.target.value = '';
      return;
    }

    setUploadingAttachments(true);
    try {
      const { attachments } = await attachmentsApi.uploadAttachments(chatId, files);
      setPendingAttachments((prev) => [...prev, ...(attachments || [])]);
    } catch (err) {
      const text = err?.response?.data?.message || err?.message || 'Не удалось загрузить вложения';
      // eslint-disable-next-line no-alert
      alert(text);
    } finally {
      setUploadingAttachments(false);
      if (event.target) event.target.value = '';
    }
  };

  const removePendingAttachment = (idRaw) => {
    const id = (idRaw || '').toString();
    setPendingAttachments((prev) =>
      prev.filter((att) => (att?.id || att?._id || '').toString() !== id)
    );
  };

  const getAttachmentUrl = (id) => attachmentsApi.getAttachmentUrl(id);

  const formatSize = (size) => {
    if (!size && size !== 0) return '';
    if (size < 1024) return `${size} Б`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} КБ`;
    return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
  };

  const isImage = (mime) => mime && mime.startsWith('image/');

  const getDisplayName = (userId) => {
    const participant = (participants || []).find((p) => getParticipantId(p) === (userId || '').toString());
    return participant?.displayName || participant?.username || userId || 'пользователь';
  };

  const formatAuditEvent = (event) => {
    const actor = getDisplayName(event.actorId);
    const meta = event.meta || {};
    switch (event.type) {
      case 'MESSAGE_DELETED_FOR_ALL':
        return `${actor} удалил сообщение ${meta.messageId || ''}`;
      case 'MUTE_SET':
        return `${actor} включил паузу до ${meta.muteUntil ? new Date(meta.muteUntil).toLocaleString() : ''}`;
      case 'MUTE_CLEARED':
        return `${actor} снял паузу чата`;
      case 'RATE_LIMIT_SET':
        return `${actor} установил лимит ${meta.rateLimitPerMinute || ''}/мин`;
      case 'RATE_LIMIT_CLEARED':
        return `${actor} снял лимит сообщений`;
      case 'PIN_ADDED':
        return `${actor} закрепил сообщение ${meta.messageId || ''}`;
      case 'PIN_REMOVED':
        return `${actor} открепил сообщение ${meta.messageId || ''}`;
      default:
        return `${actor} ${event.type}`;
    }
  };

  const toggleAudit = async () => {
    if (!auditVisible) {
      setAuditLoading(true);
      try {
        await onLoadAudit();
      } finally {
        setAuditLoading(false);
      }
    }
    setAuditVisible((prev) => !prev);
  };

  const showInput = !isRemovedFromGroup && !chatBlocked && !(chatType === 'group' && isMuted && !canManageGroup);
  const typingHintVisible = showInput && typingHint;

  const jumpToMessage = (messageIdRaw) => {
    const messageId = (messageIdRaw || '').toString();
    const el = document.getElementById(`msg-${messageId}`);
    if (el && listRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  useEffect(() => {
    if (!showInput && typingActive.current) {
      if (typingTimer.current) {
        clearTimeout(typingTimer.current);
      }
      if (chatId) {
        onTypingStop && onTypingStop(chatId);
      }
      typingActive.current = false;
    }
  }, [showInput, onTypingStop, chatId]);

  if (!chatId) {
    return (
      <div className="chat-window">
        <div className="empty-state">Выберите чат</div>
      </div>
    );
  }

  return (
    <div className="chat-window">
      <div className="chat-window__header">
        <div>
          <div className="chat-window__title">{headerTitle}</div>
          <div className="chat-window__meta">{headerMeta}</div>
        </div>

        <div className="chat-window__actions">
          {(canManageGroup || chatType === 'direct') && (
            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                if (chatType === 'group') {
                  onOpenManage && onOpenManage(chatId);
                } else {
                  setShowManageModal(true);
                }
              }}
            >
              Управление
            </button>
          )}

          <button type="button" className="secondary-btn" onClick={() => setShowSettings((prev) => !prev)}>
            Настройки
          </button>

          {showSettings && (
            <div className="chat-window__settings">
              <label className="field inline">
                <input
                  type="checkbox"
                  checked={!!chat?.notificationsEnabled}
                  onChange={async () => {
                    if (!chat?.notificationsEnabled) {
                      await ensureNotificationPermission();
                    }
                    onToggleNotifications && onToggleNotifications(chatId);
                  }}
                />
                Получать уведомления по этому чату
              </label>
            </div>
          )}
        </div>
      </div>

      <div className="chat-window__search">
        <input
          type="text"
          placeholder="Поиск по сообщениям"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {mentionableParticipants.length > 0 && (
        <div className="chat-window__mentions">
          <div className="chat-window__mentions-title">Упоминания</div>
          <div className="chat-window__mentions-controls">
            <select
              onChange={(e) => {
                addMention(e.target.value);
                e.target.value = '';
              }}
              defaultValue=""
            >
              <option value="">@ Упомянуть</option>
              {mentionableParticipants.map((p) => {
                const pid = getParticipantId(p);
                return (
                  <option key={pid} value={pid}>
                    {p.displayName || p.username || 'Участник'}
                  </option>
                );
              })}
            </select>

            <div className="mention-chips">
              {selectedMentions.map((id) => {
                const p = (participants || []).find((participant) => getParticipantId(participant) === id);
                return (
                  <span key={id} className="mention-chip">
                    @{p?.displayName || p?.username || 'пользователь'}
                    <button type="button" className="mention-chip__remove" onClick={() => removeMention(id)}>
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {canManageGroup && chatType === 'group' && (
        <div className="chat-window__moderation">
          <div className="chat-window__moderation-title">Модерация</div>

          <div className="chat-window__moderation-row">
            <span>Mute:</span>
            <button type="button" className="secondary-btn" onClick={() => handleMutePreset(15)}>
              15 мин
            </button>
            <button type="button" className="secondary-btn" onClick={() => handleMutePreset(60)}>
              1 час
            </button>
            <button type="button" className="secondary-btn" onClick={() => handleMutePreset(null)}>
              Снять
            </button>
            {muteUntilText && <span className="muted">до {muteUntilText}</span>}
          </div>

          <div className="chat-window__moderation-row">
            <span>Лимит:</span>
            {[1, 2, 5].map((limit) => (
              <button
                key={`limit-${limit}`}
                type="button"
                className={`secondary-btn ${rateLimitPerMinute === limit ? 'secondary-btn--active' : ''}`}
                onClick={() => handleRateLimitPreset(limit)}
              >
                {limit}/мин
              </button>
            ))}
            <button type="button" className="secondary-btn" onClick={() => handleRateLimitPreset(null)}>
              Без лимита
            </button>
            {rateLimitPerMinute && <span className="muted">текущий: {rateLimitPerMinute}/мин</span>}
          </div>

          <div className="chat-window__moderation-row">
            <button type="button" className="secondary-btn" onClick={toggleAudit}>
              Журнал
            </button>
            {auditLoading && <span className="muted">Загрузка...</span>}
          </div>

          {auditVisible && (
            <div className="audit-log">
              {(auditLog || []).length === 0 && <div className="muted">События отсутствуют</div>}
              {(auditLog || []).map((event) => (
                <div key={event.id || event._id} className="audit-log__item">
                  <div className="audit-log__message">{formatAuditEvent(event)}</div>
                  <div className="audit-log__meta">{new Date(event.createdAt).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {pinnedMessages.length > 0 && (
        <div className="chat-window__pins">
          <div className="chat-window__pins-title">Закрепы</div>
          <div className="chat-window__pins-list">
            {pinnedMessages.map(({ id, message }) => {
              const label = message
                ? message.deletedForAll
                  ? 'Сообщение удалено'
                  : message.text || (message.attachments?.length ? 'Вложение' : 'Сообщение')
                : 'Сообщение';
              return (
                <button key={id} type="button" className="secondary-btn" onClick={() => jumpToMessage(id)}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="chat-window__messages" ref={listRef}>
        {filteredMessages.length === 0 && (
          <p className="empty-state">{searchTerm ? 'Нет совпадений' : 'Нет сообщений. Напишите первым.'}</p>
        )}

        {filteredMessages.map((message) => {
          const messageId = getMessageId(message);
          const messageIdStr = (messageId?.toString?.() || '').toString();

          const isMine = (getSenderId(message)?.toString?.() || '') === currentId;
          const sender = message.sender || {};
          const authorName = sender.displayName || sender.username || 'Участник';

          const metaParts = [];
          const formattedRole = formatRole(sender.role);
          if (formattedRole) metaParts.push(formattedRole);
          if (sender.department) metaParts.push(sender.department);
          const authorMeta = metaParts.join(' · ');

          const reactions = message.reactions || [];
          const reactionSummary = reactions.reduce((acc, reaction) => {
            const emoji = reaction?.emoji;
            if (!emoji) return acc;
            const uid = (reaction.userId?.toString?.() || reaction.userId || '').toString();
            const list = acc[emoji] || [];
            if (uid) list.push(uid);
            acc[emoji] = list;
            return acc;
          }, {});

          const isMentioned = (message.mentions || []).some((id) => (id?.toString?.() || id) === currentId);
          const attachments = message.attachments || [];
          const isDeletedForAll = !!message.deletedForAll;

          const createdAtMs = message.createdAt ? new Date(message.createdAt).getTime() : Date.now();
          const deleteWindowMs = 10 * 60 * 1000;
          const canDeleteForAll = isMine && !isDeletedForAll && Date.now() - createdAtMs <= deleteWindowMs;

          return (
            <div key={messageIdStr || messageId} id={`msg-${messageIdStr || messageId}`}>
              {unreadSeparatorMessageId && messageIdStr && messageIdStr === unreadSeparatorMessageId && (
                <div className="unread-separator">
                  <span>— Непрочитанные сообщения —</span>
                </div>
              )}

              <div
                className={`message-row ${isMine ? 'message-row--mine' : 'message-row--incoming'} ${
                  isMentioned ? 'message-row--mention' : ''
                }`}
              >
                <div className="message-content">
                  <div className="message-author">
                    <span className="message-author__name">{authorName}</span>
                    {authorMeta && <span className="message-author__meta">{authorMeta}</span>}
                    {isMentioned && <span className="mention-badge">Вас упомянули</span>}
                  </div>

                  <div className={`message-text ${isDeletedForAll ? 'message-text--deleted' : ''}`}>
                    {isDeletedForAll ? 'Сообщение удалено' : message.text || (attachments.length ? 'Вложение' : '')}
                  </div>

                  {!isDeletedForAll && attachments.length > 0 && (
                    <div className="message-attachments">
                      {attachments.map((att) => {
                        const attId = (att.id || att._id || '').toString();
                        const downloadUrl = getAttachmentUrl(attId);
                        return (
                          <div key={attId} className="attachment-card">
                            {isImage(att.mimeType) ? (
                              <a href={downloadUrl} target="_blank" rel="noreferrer">
                                <img
                                  src={downloadUrl}
                                  alt={att.originalName || 'Вложение'}
                                  className="attachment-card__image"
                                />
                              </a>
                            ) : (
                              <div className="attachment-card__file">
                                <div className="attachment-card__meta">
                                  <div className="attachment-card__name">{att.originalName}</div>
                                  <div className="attachment-card__size">{formatSize(att.size)}</div>
                                </div>
                                <a className="link-btn" href={downloadUrl} target="_blank" rel="noreferrer">
                                  Скачать
                                </a>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {canPinMessages && !isDeletedForAll && (
                    <div className="message-actions">
                      {pinnedSet.has(messageIdStr) ? (
                        <button type="button" className="link-btn" onClick={() => onUnpin && onUnpin(messageIdStr)}>
                          Открепить
                        </button>
                      ) : (
                        <button type="button" className="link-btn" onClick={() => onPin && onPin(messageIdStr)}>
                          Закрепить
                        </button>
                      )}
                    </div>
                  )}

                  {!isDeletedForAll && (
                    <div className="message-actions">
                      <button type="button" className="link-btn" onClick={() => handleDeleteForMe(messageIdStr)}>
                        Удалить у меня
                      </button>
                      {canDeleteForAll && (
                        <button type="button" className="link-btn" onClick={() => handleDeleteForAll(message)}>
                          Удалить у всех (10 минут)
                        </button>
                      )}
                    </div>
                  )}

                  {canReact && (
                    <div className="message-reactions">
                      <div className="message-reactions__selected">
                        {Object.entries(reactionSummary).map(([emoji, users]) => (
                          <button
                            key={`${messageIdStr}-${emoji}`}
                            type="button"
                            className={`reaction-badge ${users.includes(currentId) ? 'reaction-badge--mine' : ''}`}
                            onClick={() => onToggleReaction && onToggleReaction(messageIdStr, emoji)}
                          >
                            {emoji} {users.length}
                          </button>
                        ))}
                      </div>

                      <div className="message-reactions__picker">
                        {reactionOptions.map((emoji) => (
                          <button
                            key={`${messageIdStr}-pick-${emoji}`}
                            type="button"
                            className="reaction-picker__btn"
                            onClick={() => onToggleReaction && onToggleReaction(messageIdStr, emoji)}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="message-time">{formatMessageDate(message.createdAt)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {typingHintVisible && <div className="typing-hint">{typingHint}</div>}

      <div className="chat-input-actions">
        <button
          type="button"
          className="secondary-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={!socketConnected || !!bottomNotice || uploadingAttachments}
        >
          📎 Прикрепить
        </button>

        <input
          type="file"
          ref={fileInputRef}
          multiple
          accept="image/*,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleAttachmentSelect}
          style={{ display: 'none' }}
        />

        {uploadingAttachments && <span className="muted">Загрузка...</span>}
      </div>

      {pendingAttachments.length > 0 && (
        <div className="attachments-queue">
          {pendingAttachments.map((att) => {
            const attId = (att?.id || att?._id || '').toString();
            return (
              <div key={attId} className="attachments-queue__item">
                <div>
                  <div className="attachments-queue__name">{att.originalName}</div>
                  <div className="attachments-queue__size muted">{formatSize(att.size)}</div>
                </div>
                <button type="button" className="link-btn" onClick={() => removePendingAttachment(attId)}>
                  Убрать
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="chat-input-bar">
        {bottomNotice ? (
          <div className="chat-input-banner">{bottomNotice}</div>
        ) : (
          <VkStyleInput value={messageText} onChange={handleInputChange} onSend={handleSend} disabled={!socketConnected} />
        )}
      </div>

      {showManageModal && chatType === 'direct' && (
        <div
          className="modal-backdrop"
          onClick={() => setShowManageModal(false)}
          role="presentation"
        >
          <div className="modal" onClick={(e) => e.stopPropagation()} role="presentation">
            <div className="modal__header">
              <h3>Управление чатом</h3>
              <button type="button" className="secondary-btn" onClick={() => setShowManageModal(false)}>
                Закрыть
              </button>
            </div>

            <p className="muted">
              {isBlockedByMe
                ? 'Вы заблокировали этого пользователя. Чтобы снова начать переписку, разблокируйте его.'
                : 'Вы можете заблокировать этого пользователя. В этом случае оба участника не смогут отправлять сообщения в этом чате.'}
            </p>

            <div className="btn-row">
              {isBlockedByMe ? (
                <button
                  type="button"
                  className="primary-btn"
                  onClick={async () => {
                    await onUnblock(chatId);
                    setShowManageModal(false);
                  }}
                >
                  Разблокировать
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-btn"
                  onClick={async () => {
                    await onBlock(chatId);
                    setShowManageModal(false);
                  }}
                >
                  Заблокировать
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

ChatWindow.propTypes = {
  chat: PropTypes.shape({
    id: PropTypes.string,
    _id: PropTypes.string,
    otherUser: PropTypes.object,
    isOnline: PropTypes.bool,
    notificationsEnabled: PropTypes.bool,
    type: PropTypes.string,
    title: PropTypes.string,
    participants: PropTypes.array,
    removed: PropTypes.bool,
    createdBy: PropTypes.string,
    admins: PropTypes.arrayOf(PropTypes.string),
    lastReadAt: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    removedParticipants: PropTypes.array,
    blocks: PropTypes.array,
    muteUntil: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    rateLimitPerMinute: PropTypes.number,
  }),
  messages: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      _id: PropTypes.string,
      chatId: PropTypes.string,
      senderId: PropTypes.string,
      sender: PropTypes.object,
      text: PropTypes.string,
      createdAt: PropTypes.string,
      mentions: PropTypes.arrayOf(PropTypes.string),
      deletedForAll: PropTypes.bool,
      deletedAt: PropTypes.string,
      deletedBy: PropTypes.string,
      reactions: PropTypes.array,
      attachments: PropTypes.arrayOf(
        PropTypes.shape({
          id: PropTypes.string,
          _id: PropTypes.string,
          originalName: PropTypes.string,
          mimeType: PropTypes.string,
          size: PropTypes.number,
        })
      ),
    })
  ),
  lastReadAt: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
  currentUserId: PropTypes.string.isRequired,
  typingUsers: PropTypes.arrayOf(PropTypes.string),
  onToggleNotifications: PropTypes.func,
  onOpenManage: PropTypes.func,
  onSend: PropTypes.func,
  onTypingStart: PropTypes.func,
  onTypingStop: PropTypes.func,
  socketConnected: PropTypes.bool,
  onBlock: PropTypes.func,
  onUnblock: PropTypes.func,
  pinnedMessageIds: PropTypes.arrayOf(PropTypes.string),
  onPin: PropTypes.func,
  onUnpin: PropTypes.func,
  onToggleReaction: PropTypes.func,
  onDeleteForMe: PropTypes.func,
  onDeleteForAll: PropTypes.func,
  onUpdateModeration: PropTypes.func,
  auditLog: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      _id: PropTypes.string,
      actorId: PropTypes.string,
      type: PropTypes.string,
      meta: PropTypes.object,
      createdAt: PropTypes.string,
    })
  ),
  onLoadAudit: PropTypes.func,
};

ChatWindow.defaultProps = {
  chat: null,
  messages: [],
  typingUsers: [],
  onToggleNotifications: () => {},
  onOpenManage: () => {},
  onSend: () => {},
  onTypingStart: () => {},
  onTypingStop: () => {},
  socketConnected: false,
  lastReadAt: null,
  onBlock: () => {},
  onUnblock: () => {},
  pinnedMessageIds: [],
  onPin: () => {},
  onUnpin: () => {},
  onToggleReaction: () => {},
  onDeleteForMe: () => {},
  onDeleteForAll: () => {},
  onUpdateModeration: () => {},
  auditLog: [],
  onLoadAudit: () => {},
};

export default ChatWindow;
