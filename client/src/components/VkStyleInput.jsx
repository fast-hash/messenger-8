import React, { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';

const VkStyleInput = ({ value, onChange, onSend, disabled }) => {
  const hasText = useMemo(() => value.trim().length > 0, [value]);
  const [showAttachHint, setShowAttachHint] = useState(false);
  const attachWrapperRef = useRef(null);
  const attachTimerRef = useRef(null);

  const hideAttachHint = () => {
    setShowAttachHint(false);
    if (attachTimerRef.current) {
      clearTimeout(attachTimerRef.current);
      attachTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!showAttachHint) return undefined;

    const handleClickOutside = (event) => {
      if (!attachWrapperRef.current) return;
      if (!attachWrapperRef.current.contains(event.target)) {
        hideAttachHint();
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        hideAttachHint();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showAttachHint]);

  useEffect(() => {
    if (disabled && showAttachHint) {
      hideAttachHint();
    }
  }, [disabled, showAttachHint]);

  useEffect(
    () => () => {
      hideAttachHint();
    },
    []
  );

  const handleSubmit = () => {
    if (!hasText) return;
    onSend();
  };

  const handleAttachClick = () => {
    if (disabled) return;
    const willShow = !showAttachHint;
    setShowAttachHint(willShow);
    if (attachTimerRef.current) {
      clearTimeout(attachTimerRef.current);
    }
    if (willShow) {
      attachTimerRef.current = setTimeout(() => {
        hideAttachHint();
      }, 2800);
    }
  };

  const renderAttachHint = () => {
    if (!showAttachHint) return null;

    return (
      <div className="vk-input__attach-hint">
        <div className="vk-input__attach-hint-title">Прикрепление файлов пока недоступно.</div>
        <div className="vk-input__attach-hint-text">Функция появится в следующих версиях.</div>
      </div>
    );
  };

  return (
    <div className="vk-input">
      <div className="vk-input__attach-wrapper" ref={attachWrapperRef}>
        <button
          type="button"
          className="vk-input__circle-btn vk-input__attach"
          disabled={disabled}
          onClick={handleAttachClick}
        >
          <span className="vk-input__plus">+</span>
        </button>
        {renderAttachHint()}
      </div>

      <textarea
        className="vk-input__textarea"
        rows={1}
        placeholder="Введите сообщение"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />

      <div className="vk-input__send-wrapper">
        <button
          type="button"
          className={`vk-input__circle-btn vk-input__send${hasText ? ' vk-input__send--active' : ''}`}
          disabled={!hasText || disabled}
          onClick={handleSubmit}
        >
          <svg className="vk-input__send-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 20L20 12L4 4V10L14 12L4 14V20Z" />
          </svg>
        </button>
      </div>
    </div>
  );
};

VkStyleInput.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onSend: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

VkStyleInput.defaultProps = {
  disabled: false,
};

export default VkStyleInput;
