import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import UserPicker from './UserPicker';
import { formatRole } from '../utils/roleLabels';
import { getGroupDetails, addParticipant, removeParticipant, renameGroup, approveJoin, rejectJoin } from '../api/chatApi';

const GroupManageModal = ({ isOpen, chatId, onClose, users, onUpdated, openConfirm }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [selectedToAdd, setSelectedToAdd] = useState([]);

  const load = async () => {
    if (!chatId) return;
    setLoading(true);
    setError('');
    try {
      const res = await getGroupDetails(chatId);
      setData(res.chat);
      setTitle(res.chat.title || '');
      onUpdated(res.chat);
    } catch (err) {
      setError('Не удалось загрузить данные группы');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      load();
    }
  }, [isOpen, chatId]);

  if (!isOpen) return null;

  const handleRename = async () => {
    try {
      await renameGroup(chatId, title);
      await load();
    } catch (err) {
      console.error(err);
      setError('Не удалось сохранить название группы');
    }
  };

  const handleAdd = async () => {
    if (!selectedToAdd.length) return;
    const userId = selectedToAdd[0];
    try {
      await addParticipant(chatId, userId);
      await load();
    } catch (err) {
      console.error(err);
      setError('Не удалось добавить участника. Попробуйте ещё раз.');
    } finally {
      setSelectedToAdd([]);
    }
  };

  const handleRemove = async (participant) => {
    openConfirm(
      `Удалить участника ${participant.displayName || participant.username} из группы?`,
      async () => {
        await removeParticipant(chatId, participant.id);
        await load();
      }
    );
  };

  const handleApprove = async (req) => {
    try {
      await approveJoin(chatId, req.id);
      await load();
    } catch (err) {
      console.error(err);
      setError('Не удалось принять заявку');
    }
  };

  const handleReject = async (req) => {
    try {
      await rejectJoin(chatId, req.id);
      await load();
    } catch (err) {
      console.error(err);
      setError('Не удалось отклонить заявку');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal large" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h3>Управление группой</h3>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Закрыть
          </button>
        </div>
        {loading && <p className="muted">Загрузка...</p>}
        {error && <p className="warning">{error}</p>}
        {data && (
          <div className="modal-body-scroll">
            <label className="field">
              Название группы
              <input
                type="text"
                className="field-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <button type="button" className="primary-btn" onClick={() => openConfirm(`Переименовать группу в "${title}"?`, handleRename)}>
              Сохранить название
            </button>

            <h4>Участники</h4>
            <div className="list-scroll">
              {data.participants.map((participant) => {
                const canRemove = participant.id !== data.createdBy;
                return (
                  <div key={participant.id} className="participant-row">
                    <div>
                      <div className="participant-name">{participant.displayName || participant.username}</div>
                      <div className="participant-meta">
                        {formatRole(participant.role)} · {participant.department || 'Отдел не указан'} · {participant.email}
                      </div>
                    </div>
                    {canRemove && (
                      <button type="button" className="secondary-btn" onClick={() => handleRemove(participant)}>
                        Удалить
                      </button>
                    )}
                  </div>
                );
              })}
              {!data.participants.length && <p className="muted">Нет участников</p>}
            </div>

            <h4>Добавить участника</h4>
            <UserPicker
              mode="single"
              users={users}
              selectedIds={selectedToAdd}
              onChange={(ids) => setSelectedToAdd(ids)}
              excludeIds={data.participants.map((p) => p.id)}
            />
            <button type="button" className="primary-btn" onClick={handleAdd} disabled={!selectedToAdd.length}>
              Добавить
            </button>

            <h4>Заявки на вступление</h4>
            <div className="list-scroll">
              {data.joinRequests?.length ? (
                data.joinRequests.map((req) => (
                  <div key={req.id} className="participant-row">
                    <div>
                      <div className="participant-name">{req.displayName || req.username}</div>
                      <div className="participant-meta">{formatRole(req.role)} · {req.email}</div>
                    </div>
                    <div className="btn-row">
                      <button type="button" className="primary-btn" onClick={() => handleApprove(req)}>
                        Принять
                      </button>
                      <button type="button" className="secondary-btn" onClick={() => handleReject(req)}>
                        Отклонить
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="muted">Заявок нет</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

GroupManageModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  chatId: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  users: PropTypes.arrayOf(PropTypes.object).isRequired,
  onUpdated: PropTypes.func,
  openConfirm: PropTypes.func.isRequired,
};

GroupManageModal.defaultProps = {
  chatId: null,
  onUpdated: () => {},
};

export default GroupManageModal;
