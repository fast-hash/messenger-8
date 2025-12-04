import { useState } from 'react';
import PropTypes from 'prop-types';
import { formatRole } from '../utils/roleLabels';

const statusLabel = (status) => {
  switch (status) {
    case 'owner':
      return 'владелец';
    case 'admin':
      return 'администратор';
    case 'member':
      return 'участник';
    case 'pending':
      return 'заявка отправлена';
    default:
      return 'можно присоединиться';
  }
};

const describeBlocks = (chat) => {
  if (!chat.blocks?.length) return 'Блокировок нет';
  const [first, second] = chat.participants || [];
  if (!first || !second) return 'Участники не найдены';
  const byFirst = chat.blocks.some((b) => b.by === first.id && b.target === second.id);
  const bySecond = chat.blocks.some((b) => b.by === second.id && b.target === first.id);

  if (byFirst && bySecond) return 'Взаимная блокировка';
  if (byFirst) return `${first.displayName || first.username} заблокировал(а) ${second.displayName || second.username}`;
  if (bySecond) return `${second.displayName || second.username} заблокировал(а) ${first.displayName || first.username}`;
  return 'Блокировки не активны';
};

const ChatManagementModal = ({
  isOpen,
  onClose,
  groups,
  groupsLoading,
  onOpenGroup,
  onManageGroup,
  directChats,
  directLoading,
  onClearBlocks,
}) => {
  const [tab, setTab] = useState('groups');

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal large" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <div className="header-actions">
            <button
              type="button"
              className={`secondary-btn ${tab === 'groups' ? 'active' : ''}`}
              onClick={() => setTab('groups')}
            >
              Группы
            </button>
            <button
              type="button"
              className={`secondary-btn ${tab === 'direct' ? 'active' : ''}`}
              onClick={() => setTab('direct')}
            >
              Личные чаты
            </button>
          </div>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Закрыть
          </button>
        </div>
        {tab === 'groups' && (
          <div className="modal-body-scroll">
            {groupsLoading && <p className="muted">Загрузка групп...</p>}
            {!groupsLoading && (
              <div className="group-list group-list-scroll">
                {groups.map((group) => (
                  <div key={group.id} className="group-card">
                    <div>
                      <div className="group-card__title">{group.title}</div>
                      <div className="group-card__meta">Участников: {group.participantsCount}</div>
                      <div className="group-card__meta">Статус: {statusLabel(group.membershipStatus)}</div>
                    </div>
                    <div className="btn-row">
                      <button type="button" className="primary-btn" onClick={() => onOpenGroup(group.id)}>
                        Открыть
                      </button>
                      <button type="button" className="secondary-btn" onClick={() => onManageGroup(group.id)}>
                        Управлять
                      </button>
                    </div>
                  </div>
                ))}
                {!groups.length && <p className="muted">Группы пока не созданы</p>}
              </div>
            )}
          </div>
        )}

        {tab === 'direct' && (
          <div className="modal-body-scroll">
            {directLoading && <p className="muted">Загрузка личных чатов...</p>}
            {!directLoading && (
              <div className="group-list">
                {directChats.map((chat) => (
                  <div key={chat.id} className="group-card">
                    <div>
                      <div className="group-card__title">
                        {(chat.participants || [])
                          .map((p) => p.displayName || p.username)
                          .filter(Boolean)
                          .join(' — ')}
                      </div>
                      <div className="group-card__meta">
                        {(chat.participants || []).map((p) => formatRole(p.role)).join(' · ')}
                      </div>
                      <div className="group-card__meta">{describeBlocks(chat)}</div>
                    </div>
                    <div className="btn-row">
                      {chat.blocks?.length ? (
                        <button type="button" className="secondary-btn" onClick={() => onClearBlocks(chat.id)}>
                          Снять блокировку
                        </button>
                      ) : (
                        <span className="muted">Блокировок нет</span>
                      )}
                    </div>
                  </div>
                ))}
                {!directChats.length && <p className="muted">Личные чаты отсутствуют</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

ChatManagementModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  groups: PropTypes.arrayOf(PropTypes.object),
  groupsLoading: PropTypes.bool,
  onOpenGroup: PropTypes.func,
  onManageGroup: PropTypes.func,
  directChats: PropTypes.arrayOf(PropTypes.object),
  directLoading: PropTypes.bool,
  onClearBlocks: PropTypes.func,
};

ChatManagementModal.defaultProps = {
  groups: [],
  groupsLoading: false,
  onOpenGroup: () => {},
  onManageGroup: () => {},
  directChats: [],
  directLoading: false,
  onClearBlocks: () => {},
};

export default ChatManagementModal;
