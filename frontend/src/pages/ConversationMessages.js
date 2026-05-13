import React, { useState, useEffect, useRef } from 'react';
import { getConversationMessages, deleteMessage, getConversationById, toggleUserActive } from '../services/api';
import { useToast } from '../components/Toast';
import LoadingSpinner from '../components/LoadingSpinner';
import { getImageUrl, getDefaultAvatar } from '../config';
import { formatDate } from '../utils/formatters';
import './ConversationMessages.css';

function ConversationMessages({ conversationId, onBack, onViewUser }) {
    const [messages, setMessages] = useState([]);
    const [conversation, setConversation] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [selectedMessage, setSelectedMessage] = useState(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [userActionMenu, setUserActionMenu] = useState(null);
    const [showBanConfirm, setShowBanConfirm] = useState(false);
    const [banningUser, setBanningUser] = useState(null);
    const messagesEndRef = useRef(null);
    const { showToast } = useToast();

    useEffect(() => {
        fetchMessages();
        fetchConversationInfo();
    }, [conversationId, page, search]);

    const fetchConversationInfo = async () => {
        try {
            const response = await getConversationById(conversationId);
            if (response.success) {
                setConversation(response.data);
            }
        } catch (err) {
            console.error('خطأ في جلب معلومات المحادثة:', err);
        }
    };

    const fetchMessages = async () => {
        try {
            setLoading(true);
            const response = await getConversationMessages(conversationId, page, 50, search);
            if (response.success) {
                // ترتيب من الأقدم للأحدث (الأحدث في الأسفل)
                const sorted = [...(response.data.messages || [])].reverse();
                setMessages(sorted);
                setTotalPages(response.data.totalPages);
            }
        } catch (err) {
            showToast('فشل تحميل الرسائل', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteMessage = async () => {
        if (!selectedMessage) return;
        try {
            const response = await deleteMessage(selectedMessage._id);
            if (response.success) {
                setMessages(messages.map(msg =>
                    msg._id === selectedMessage._id ? { ...msg, isDeleted: true } : msg
                ));
                showToast('تم حذف الرسالة', 'success');
                setShowDeleteModal(false);
                setSelectedMessage(null);
            }
        } catch (err) {
            showToast('فشل حذف الرسالة', 'error');
        }
    };

    const formatTime = (date) => {
        return new Date(date).toLocaleTimeString('ar-SA', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    useEffect(() => {
        if (!loading) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, loading]);

    // أسماء المشاركين
    const getParticipantNames = () => {
        if (!conversation?.participants) return 'المحادثة';
        return conversation.participants.map(p => p.name).join(' و ');
    };

    // صورة المرسل
    const getSenderAvatar = (sender) => {
        if (sender?.profileImage) {
            return getImageUrl(sender.profileImage);
        }
        return getDefaultAvatar(sender?.name);
    };

    if (loading && page === 1) {
        return <LoadingSpinner text="جاري تحميل الرسائل..." />;
    }

    return (
        <div className="chat-viewer-page">
            {/* Header */}
            <div className="chat-viewer-header">
                <button onClick={onBack} className="chat-back-btn">← رجوع</button>
                <div className="chat-header-info">
                    <div className="chat-header-avatars">
                        {conversation?.participants?.slice(0, 2).map((p, i) => (
                            <img
                                key={i}
                                src={getSenderAvatar(p)}
                                alt={p.name}
                                className="chat-header-avatar"
                                onError={(e) => { e.target.onerror = null; e.target.src = getDefaultAvatar(p.name); }}
                                onClick={() => onViewUser && onViewUser(p._id)}
                                style={{ cursor: onViewUser ? 'pointer' : 'default' }}
                            />
                        ))}
                    </div>
                    <div className="chat-header-text">
                        <h2>{getParticipantNames()}</h2>
                        <span className="chat-msg-count">{messages.length} رسالة</span>
                    </div>
                </div>
                <div className="chat-header-search">
                    <input
                        type="text"
                        placeholder="🔍 بحث..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    />
                </div>
            </div>

            {/* Admin Notice */}
            <div className="chat-admin-notice">
                🔒 وضع المراقبة — لا يمكن الرد في هذه المحادثة
            </div>

            {/* Messages */}
            <div className="chat-messages-container">
                {messages.length === 0 ? (
                    <div className="chat-empty">
                        <p>💬 لا توجد رسائل</p>
                    </div>
                ) : (
                    <div className="chat-messages-list">
                        {messages.map((message, index) => {
                            const showDate = index === 0 ||
                                formatDate(message.createdAt) !== formatDate(messages[index - 1]?.createdAt);

                            const isFirstParticipant = conversation?.participants?.[0]?._id === message.sender?._id;

                            return (
                                <React.Fragment key={message._id}>
                                    {showDate && (
                                        <div className="chat-date-divider">
                                            <span>{formatDate(message.createdAt)}</span>
                                        </div>
                                    )}
                                    <div className={`chat-msg ${isFirstParticipant ? 'right' : 'left'} ${message.isDeleted ? 'deleted' : ''} ${message.hasBannedWords ? 'flagged' : ''}`}>
                                        {/* Avatar */}
                                        <img
                                            src={getSenderAvatar(message.sender)}
                                            alt={message.sender?.name}
                                            className="chat-msg-avatar"
                                            onClick={() => message.sender?._id && onViewUser && onViewUser(message.sender._id)}
                                            onError={(e) => { e.target.onerror = null; e.target.src = getDefaultAvatar(message.sender?.name); }}
                                        />

                                        <div className="chat-msg-body">
                                            {/* Sender name */}
                                            <div className="chat-msg-sender">
                                                <span
                                                    className="chat-sender-name"
                                                    onClick={() => message.sender?._id && onViewUser && onViewUser(message.sender._id)}
                                                >
                                                    {message.sender?.name || 'مجهول'}
                                                </span>
                                                <span className="chat-msg-time">{formatTime(message.createdAt)}</span>
                                            </div>

                                            {/* Content */}
                                            <div className="chat-msg-content">
                                                {message.isDeleted ? (
                                                    <em className="chat-deleted-text">تم حذف هذه الرسالة</em>
                                                ) : (
                                                    <>
                                                        {message.content && <p>{message.content}</p>}
                                                        {message.type === 'image' && message.mediaUrl && (
                                                            <img
                                                                src={getImageUrl(message.mediaUrl)}
                                                                alt="صورة"
                                                                className="chat-msg-image"
                                                                onError={(e) => { e.target.style.display = 'none'; }}
                                                            />
                                                        )}
                                                        {message.type !== 'text' && message.type !== 'image' && (
                                                            <span className="chat-type-badge">
                                                                {message.type === 'file' && '📎 ملف'}
                                                                {message.type === 'audio' && '🎵 صوت'}
                                                                {message.type === 'video' && '🎥 فيديو'}
                                                            </span>
                                                        )}
                                                    </>
                                                )}
                                            </div>

                                            {/* Banned words */}
                                            {message.hasBannedWords && message.bannedWordsFound?.length > 0 && (
                                                <div className="chat-banned-words">
                                                    ⚠️ {message.bannedWordsFound.map((w, i) => (
                                                        <span key={i} className={`chat-banned-tag ${w.severity}`}>{w.word}</span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Delete button */}
                                        {!message.isDeleted && (
                                            <button
                                                className="chat-delete-btn"
                                                onClick={() => { setSelectedMessage(message); setShowDeleteModal(true); }}
                                                title="حذف"
                                            >
                                                🗑️
                                            </button>
                                        )}
                                    </div>
                                </React.Fragment>
                            );
                        })}
                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="chat-pagination">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>السابق</button>
                    <span>صفحة {page} من {totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>التالي</button>
                </div>
            )}

            {/* Delete Modal */}
            {showDeleteModal && selectedMessage && (
                <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <h3>تأكيد حذف الرسالة</h3>
                        <div className="message-preview">
                            <strong>{selectedMessage.sender?.name}:</strong> {selectedMessage.content}
                        </div>
                        <div className="modal-actions">
                            <button className="btn-cancel" onClick={() => { setShowDeleteModal(false); setSelectedMessage(null); }}>إلغاء</button>
                            <button className="btn-confirm-delete" onClick={handleDeleteMessage}>حذف</button>
                        </div>
                    </div>
                </div>
            )}

            {/* User click menu */}
            {userActionMenu && (
                <div className="user-action-overlay" onClick={() => setUserActionMenu(null)}>
                    <div className="user-action-menu" style={{ top: userActionMenu.y, left: userActionMenu.x }} onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => { onViewUser?.(userActionMenu.userId); setUserActionMenu(null); }}>👤 عرض الملف</button>
                        <button onClick={() => { setBanningUser(userActionMenu); setShowBanConfirm(true); setUserActionMenu(null); }}>🚫 حظر</button>
                    </div>
                </div>
            )}

            {/* Ban confirm */}
            {showBanConfirm && banningUser && (
                <div className="modal-overlay" onClick={() => { setShowBanConfirm(false); setBanningUser(null); }}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <h3>🚫 حظر "{banningUser.userName}"؟</h3>
                        <div className="modal-actions">
                            <button className="btn-cancel" onClick={() => { setShowBanConfirm(false); setBanningUser(null); }}>إلغاء</button>
                            <button className="btn-confirm-delete" onClick={async () => {
                                try {
                                    await toggleUserActive(banningUser.userId);
                                    showToast('تم حظر المستخدم', 'success');
                                } catch (e) { showToast('فشل', 'error'); }
                                setShowBanConfirm(false); setBanningUser(null);
                            }}>حظر</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ConversationMessages;
