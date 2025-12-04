import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import ChatList from '../components/ChatList';
import ChatWindow from '../components/ChatWindow';
import ConfirmDialog from '../components/ConfirmDialog';
import GroupDirectoryModal from '../components/GroupDirectoryModal';
import GroupManageModal from '../components/GroupManageModal';
import UserPicker from '../components/UserPicker';
import ChatManagementModal from '../components/ChatManagementModal';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import {
  createDirectChat,
  createGroupChat,
  listGroups,
  requestJoin,
  blockChat,
  unblockChat,
  listDirectChatsAdmin,
  clearBlocksAdmin,
} from '../api/chatApi';
import { searchUsers } from '../api/usersApi';
import { formatRole } from '../utils/roleLabels';

const ChatsPage = () => {
  const navigate = useNavigate();
  const { user, logout, dndEnabled, dndUntil, updatePreferences } = useAuthStore();
  const {
    chats,
    selectedChatId,
    messages,
    messageMeta,
    typing,
    loadChats,
    setSelectedChat,
    loadMessages,
    sendMessage,
    connectSocket,
    reset,
    upsertChat,
    socket,
    toggleNotifications,
    setDndStatus,
    fetchPins,
    pinMessage,
    unpinMessage,
    pinnedByChat,
    toggleReaction,
    deleteMessageForMe,
    deleteMessageForAll,
    updateModeration,
    auditLogs,
    loadAudit,
  } = useChatStore();

  const [showChoice, setShowChoice] = useState(false);
  const [showDirect, setShowDirect] = useState(false);
  const [showDirectory, setShowDirectory] = useState(false);
  const [manageChatId, setManageChatId] = useState(null);
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [selectedDirect, setSelectedDirect] = useState([]);
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [newGroupParticipants, setNewGroupParticipants] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const [showManagement, setShowManagement] = useState(false);
  const [directChatsAdmin, setDirectChatsAdmin] = useState([]);
  const [directChatsLoading, setDirectChatsLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      reset();
      navigate('/login');
      return;
    }
    connectSocket(user.id);
    loadChats(user.id);
  }, [user, connectSocket, loadChats, reset, navigate]);

  useEffect(() => {
    setDndStatus(dndEnabled, dndUntil);
  }, [dndEnabled, dndUntil, setDndStatus]);

  useEffect(() => {
    if (selectedChatId) {
      fetchPins(selectedChatId);
    }
  }, [selectedChatId, fetchPins]);

  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) || null,
    [chats, selectedChatId]
  );

  const isRemovedFromSelectedGroup = useMemo(() => {
    if (!selectedChat || selectedChat.type !== 'group') return false;
    const participantIds = (selectedChat.participants || []).map((p) => (p.id || p._id || p).toString());
    const currentId = user?.id?.toString();
    return (
      selectedChat.removed ||
      selectedChat.removedParticipants?.some((id) => (id?.toString?.() || id) === currentId) ||
      !participantIds.includes(currentId)
    );
  }, [selectedChat, user?.id]);

  useEffect(() => {
    if (selectedChatId && !messages[selectedChatId]) {
      if (isRemovedFromSelectedGroup) return;
      loadMessages(selectedChatId);
    }
  }, [selectedChatId, messages, loadMessages, isRemovedFromSelectedGroup]);

  const typingUsers = useMemo(() => typing[selectedChatId] || [], [typing, selectedChatId]);
  const canCreateGroup = user && user.role === 'admin';

  const openConfirm = (text, action) => {
    setConfirmState({ text, action });
  };

  const ensureUsersLoaded = async () => {
    if (users.length) return;
    const { users: fetched } = await searchUsers('');
    setUsers(fetched);
  };

  const refreshGroups = async () => {
    setGroupsLoading(true);
    try {
      const { groups: fetched } = await listGroups();
      setGroups(fetched);
    } catch (error) {
      setGroups([]);
    } finally {
      setGroupsLoading(false);
    }
  };

  const openDirectModal = async () => {
    setShowChoice(false);
    setShowDirect(true);
    await ensureUsersLoaded();
  };

  const openGroupDirectory = async () => {
    setShowChoice(false);
    setShowDirectory(true);
    await ensureUsersLoaded();
    await refreshGroups();
  };

  const backToChoice = () => {
    setShowDirect(false);
    setShowDirectory(false);
    setShowChoice(true);
  };

  const closeModals = () => {
    setShowChoice(false);
    setShowDirect(false);
    setShowDirectory(false);
    setManageChatId(null);
    setSelectedDirect([]);
    setNewGroupTitle('');
    setNewGroupParticipants([]);
  };

  const handleDirectSelect = (ids) => {
    setSelectedDirect(ids);
    const target = users.find((u) => u.id === ids[0]);
    if (!target) return;
    openConfirm(`Начать личный чат с ${target.displayName || target.username}?`, async () => {
      const { chat } = await createDirectChat({ otherUserId: target.id });
      upsertChat(chat, user.id);
      setSelectedChat(chat.id);
      closeModals();
    });
  };

  const handleCreateGroup = async () => {
    if (!newGroupTitle.trim()) return;
    const payload = {
      title: newGroupTitle,
      participantIds: newGroupParticipants,
    };
    try {
      const { chat } = await createGroupChat(payload);
      if (chat) {
        upsertChat(chat, user.id);
        setSelectedChat(chat.id);
      }
      await refreshGroups();
      setShowDirectory(false);
    } catch (error) {
      // Простое уведомление, чтобы администратор понял причину сбоя
      // (например, дубликат названия или отсутствие прав)
      // eslint-disable-next-line no-alert
      alert(error?.response?.data?.error || 'Не удалось создать группу');
    } finally {
      setNewGroupTitle('');
      setNewGroupParticipants([]);
    }
  };

  const handleRequestJoin = async (group) => {
    try {
      const res = await requestJoin(group.id);
      if (res?.ok) {
        setGroups((prev) =>
          prev.map((item) =>
            item.id === group.id ? { ...item, membershipStatus: 'pending' } : item
          )
        );
      }
      await refreshGroups();
    } catch (error) {
      console.error('Не удалось отправить заявку', error);
      // eslint-disable-next-line no-alert
      alert('Не удалось отправить заявку. Попробуйте ещё раз.');
    }
  };

  const openManageModal = async (chatId) => {
    await ensureUsersLoaded();
    setManageChatId(chatId);
  };

  const handleBlockChat = async (chatId) => {
    const { chat } = await blockChat(chatId);
    if (chat) {
      upsertChat(chat, user.id);
    }
  };

  const handleUnblockChat = async (chatId) => {
    const { chat } = await unblockChat(chatId);
    if (chat) {
      upsertChat(chat, user.id);
    }
  };

  const openManagementModal = async () => {
    setShowManagement(true);
    await refreshGroups();
    setDirectChatsLoading(true);
    try {
      const { chats: directList } = await listDirectChatsAdmin();
      setDirectChatsAdmin(directList);
    } catch (error) {
      setDirectChatsAdmin([]);
    } finally {
      setDirectChatsLoading(false);
    }
  };

  const handleAdminClearBlocks = async (chatId) => {
    try {
      const { chat } = await clearBlocksAdmin(chatId);
      setDirectChatsAdmin((prev) => prev.map((item) => (item.id === chat.id ? chat : item)));
      if (chat) {
        upsertChat(chat, user.id);
      }
    } catch (error) {
      // eslint-disable-next-line no-alert
      alert('Не удалось снять блокировку');
    }
  };

  const handleManageUpdated = (chat) => {
    upsertChat(chat, user.id);
    refreshGroups();
  };

  const handleSelectChat = (chatId) => {
    setSelectedChat(chatId);
  };

  return (
    <Layout
      header={
        <div className="header-content">
          <div>
            <div className="app-title">MediChat</div>
            <div className="app-subtitle">Безопасная переписка внутри клиники</div>
          </div>
          <div className="header-user">
            <div>
              <div className="user-name">{user.displayName || user.username}</div>
              <div className="user-meta">{formatRole(user.role)} · {user.department || 'Отдел не указан'}</div>
            </div>
            <label className="field inline" style={{ marginRight: '1rem' }}>
              <input
                type="checkbox"
                checked={!!dndEnabled}
                onChange={async () => {
                  await updatePreferences({ dndEnabled: !dndEnabled, dndUntil: null });
                }}
              />
              Не беспокоить
            </label>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                logout();
                reset();
                navigate('/login');
              }}
            >
              Выйти
            </button>
          </div>
        </div>
      }
      sidebar={
        <div className="sidebar">
          <div className="sidebar__top">
            <div className="sidebar-actions">
              <button
                type="button"
                className="sidebar-actions__btn"
                onClick={() => setShowChoice(true)}
              >
                Новый чат
              </button>
              {canCreateGroup && (
                <button
                  type="button"
                  className="sidebar-actions__btn"
                  onClick={openManagementModal}
                >
                  Управление чатами
                </button>
              )}
            </div>
          </div>
          <ChatList chats={chats} selectedChatId={selectedChatId} onSelect={handleSelectChat} />
        </div>
      }
    >
      {selectedChat && (
        <div className="chat-area">
          <ChatWindow
            chat={selectedChat}
            messages={messages[selectedChatId] || []}
            lastReadAt={messageMeta[selectedChatId]?.lastReadAt || null}
            currentUserId={user.id}
            typingUsers={typingUsers}
            onToggleNotifications={toggleNotifications}
            onOpenManage={openManageModal}
            onSend={(text, mentions, attachments) => sendMessage(selectedChatId, text, mentions, attachments)}
            onTypingStart={(chatId) => socket?.emit('typing:start', { chatId })}
            onTypingStop={(chatId) => socket?.emit('typing:stop', { chatId })}
            socketConnected={!!socket}
            onBlock={handleBlockChat}
            onUnblock={handleUnblockChat}
            pinnedMessageIds={pinnedByChat[selectedChatId] || selectedChat.pinnedMessageIds || []}
            onPin={(messageId) => pinMessage(selectedChatId, messageId)}
            onUnpin={(messageId) => unpinMessage(selectedChatId, messageId)}
            onToggleReaction={(messageId, emoji) => toggleReaction(selectedChatId, messageId, emoji)}
            onDeleteForMe={(messageId) => deleteMessageForMe(selectedChatId, messageId)}
            onDeleteForAll={(messageId) => deleteMessageForAll(selectedChatId, messageId)}
            onUpdateModeration={(payload) => updateModeration(selectedChatId, payload)}
            auditLog={auditLogs[selectedChatId] || []}
            onLoadAudit={() => loadAudit(selectedChatId)}
          />
        </div>
      )}
      {!selectedChat && <div className="empty-state">Выберите чат или создайте новый.</div>}

      {showChoice && (
        <div className="modal-backdrop" onClick={closeModals}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <h3>Новый чат</h3>
              <button type="button" className="secondary-btn" onClick={closeModals}>
                Закрыть
              </button>
            </div>
            <p className="muted">Выберите тип диалога.</p>
            <div className="choice-buttons">
              <button type="button" className="primary-btn" onClick={openDirectModal}>
                Личный чат
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={openGroupDirectory}
                title="Каталог и создание групп"
              >
                Групповые чаты
              </button>
            </div>
          </div>
        </div>
      )}

      {showDirect && (
        <div className="modal-backdrop" onClick={closeModals}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <div className="header-actions">
                <button type="button" className="secondary-btn" onClick={backToChoice}>
                  Назад
                </button>
                <h3>Личный чат</h3>
              </div>
              <button type="button" className="secondary-btn" onClick={closeModals}>
                Закрыть
              </button>
            </div>
            <UserPicker
              mode="single"
              users={users}
              selectedIds={selectedDirect}
              onChange={handleDirectSelect}
              excludeIds={[user.id]}
            />
          </div>
        </div>
      )}

      <GroupDirectoryModal
        isOpen={showDirectory}
        onClose={closeModals}
        isAdmin={canCreateGroup}
        users={users}
        groups={groups}
        loading={groupsLoading}
        selectedIds={newGroupParticipants}
        onChangeSelected={setNewGroupParticipants}
        onCreateGroup={handleCreateGroup}
        onRequestJoin={handleRequestJoin}
        onOpenChat={(chatId) => {
          setSelectedChat(chatId);
          closeModals();
        }}
        onManage={openManageModal}
        groupTitle={newGroupTitle}
        onTitleChange={setNewGroupTitle}
        currentUserId={user.id}
        onConfirm={openConfirm}
        onBack={backToChoice}
      />

      <GroupManageModal
        isOpen={!!manageChatId}
        chatId={manageChatId}
        onClose={() => setManageChatId(null)}
        users={users}
        onUpdated={handleManageUpdated}
        openConfirm={openConfirm}
        onUpdateModeration={(chatId, payload) => updateModeration(chatId, payload)}
      />

      <ChatManagementModal
        isOpen={showManagement}
        onClose={() => setShowManagement(false)}
        groups={groups}
        groupsLoading={groupsLoading}
        onOpenGroup={(chatId) => {
          setSelectedChat(chatId);
          setShowManagement(false);
        }}
        onManageGroup={(chatId) => {
          openManageModal(chatId);
          setShowManagement(false);
        }}
        directChats={directChatsAdmin}
        directLoading={directChatsLoading}
        onClearBlocks={handleAdminClearBlocks}
      />

      {confirmState && (
        <ConfirmDialog
          text={confirmState.text}
          onConfirm={async () => {
            await confirmState.action();
          }}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </Layout>
  );
};

export default ChatsPage;
