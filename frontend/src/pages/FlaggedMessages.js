import React, { useState, useEffect, useCallback } from 'react';
import { getFlaggedMessages, getFlaggedMessagesStats, reviewMessage } from '../services/api';
import { useToast } from '../components/Toast';
import LoadingSpinner from '../components/LoadingSpinner';
import StatCard from '../components/StatCard';
import DataTable from '../components/DataTable';
import { formatDateTime } from '../utils/formatters';
import { getSeverityBadge, getChatTypeBadge } from '../utils/badgeHelpers';
import { getImageUrl, getDefaultAvatar } from '../config';
import './FlaggedMessages.css';

function FlaggedMessages() {
    const [messages, setMessages] = useState([]);
    const [stats, setStats] = useState({ pending: 0, reviewed: 0, dismissed: 0, total: 0 });
    const [bySeverity, setBySeverity] = useState({});
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [statusFilter, setStatusFilter] = useState('pending');
    const [severityFilter, setSeverityFilter] = useState('');
    const [chatTypeFilter, setChatTypeFilter] = useState('');
    const [reviewingId, setReviewingId] = useState(null);
    const { showToast } = useToast();

    const fetchStats = useCallback(async () => {
        try {
            const response = await getFlaggedMessagesStats();
            if (response.success) {
                setStats(response.stats || { pending: 0, reviewed: 0, dismissed: 0, total: 0 });
                setBySeverity(response.bySeverity || {});
            }
        } catch (error) {
            console.error('خطأ في جلب الإحصائيات:', error);
        }
    }, []);

    const fetchMessages = useCallback(async () => {
        try {
            setLoading(true);
            const params = { page, limit: 20, status: statusFilter };
            if (severityFilter) params.severity = severityFilter;
            if (chatTypeFilter) params.chatType = chatTypeFilter;

            const response = await getFlaggedMessages(params);
            if (response.success) {
                setMessages(response.messages || []);
                setTotalPages(response.pagination?.pages || 1);
                setTotal(response.pagination?.total || 0);
            }
        } catch (error) {
            console.error('خطأ في جلب الرسائل:', error);
            showToast('فشل في جلب البيانات', 'error');
        } finally {
            setLoading(false);
        }
    }, [page, statusFilter, severityFilter, chatTypeFilter, showToast]);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    useEffect(() => {
        fetchMessages();
    }, [fetchMessages]);

    const handleReview = async (messageId, status, action = 'none') => {
        try {
            setReviewingId(messageId);
            const response = await reviewMessage(messageId, { status, action });
            if (response.success) {
                showToast(
                    status === 'reviewed' ? 'تمت المراجعة بنجاح' : 'تم تجاهل الرسالة',
                    'success'
                );
                fetchMessages();
                fetchStats();
            }
        } catch (error) {
            showToast('فشل في تحديث المراجعة', 'error');
        } finally {
            setReviewingId(null);
        }
    };

    const handleDelete = async (messageId) => {
        if (!window.confirm('هل تريد حذف هذه الرسالة نهائياً؟')) return;
        try {
            setReviewingId(messageId);
            const response = await reviewMessage(messageId, { status: 'reviewed', action: 'delete' });
            if (response.success) {
                showToast('تم حذف الرسالة', 'success');
                fetchMessages();
                fetchStats();
            }
        } catch (error) {
            showToast('فشل في حذف الرسالة', 'error');
        } finally {
            setReviewingId(null);
        }
    };

    if (loading && page === 1) {
        return <LoadingSpinner text="جاري تحميل الرسائل للمراجعة..." />;
    }

    const columns = [
        {
            key: 'sender',
            label: 'المرسل',
            render: (msg) => (
                <div className="fm-user">
                    <img
                        src={msg.sender?.profileImage ? getImageUrl(msg.sender.profileImage) : getDefaultAvatar(msg.sender?.name)}
                        alt={msg.sender?.name}
                        className="fm-avatar"
                        onError={(e) => { e.target.onerror = null; e.target.src = getDefaultAvatar(msg.sender?.name); }}
                    />
                    <div>
                        <span className="fm-name">{msg.sender?.name || 'محذوف'}</span>
                        <small className="fm-email">{msg.sender?.email || ''}</small>
                    </div>
                </div>
            )
        },
        {
            key: 'content',
            label: 'محتوى الرسالة',
            render: (msg) => (
                <div className="fm-content-text" title={msg.content}>
                    {msg.content?.substring(0, 100)}{msg.content?.length > 100 ? '...' : ''}
                </div>
            )
        },
        {
            key: 'bannedWords',
            label: 'الكلمات المحظورة',
            render: (msg) => (
                <div className="fm-words">
                    {msg.bannedWordsFound?.map((w, i) => (
                        <span key={i} className={`word-badge ${w.severity}`}>{w.word}</span>
                    ))}
                </div>
            )
        },
        {
            key: 'severity',
            label: 'الخطورة',
            render: (msg) => getSeverityBadge(msg.bannedWordSeverity)
        },
        {
            key: 'chatType',
            label: 'النوع',
            render: (msg) => (
                <div>
                    {getChatTypeBadge(msg.chatType)}
                    {msg.room && <small className="fm-room-name">{msg.room.name}</small>}
                </div>
            )
        },
        {
            key: 'date',
            label: 'التاريخ',
            render: (msg) => <span className="fm-date">{formatDateTime(msg.createdAt)}</span>
        },
        {
            key: 'actions',
            label: 'إجراءات',
            render: (msg) => (
                <div className="fm-actions">
                    {msg.reviewStatus === 'pending' ? (
                        <>
                            <button
                                className="btn-review btn-approve"
                                onClick={() => handleReview(msg._id, 'reviewed')}
                                disabled={reviewingId === msg._id}
                                title="تمت المراجعة"
                            >
                                ✅
                            </button>
                            <button
                                className="btn-review btn-dismiss"
                                onClick={() => handleReview(msg._id, 'dismissed')}
                                disabled={reviewingId === msg._id}
                                title="تجاهل"
                            >
                                ❌
                            </button>
                            <button
                                className="btn-review btn-delete"
                                onClick={() => handleDelete(msg._id)}
                                disabled={reviewingId === msg._id}
                                title="حذف الرسالة"
                            >
                                🗑️
                            </button>
                        </>
                    ) : (
                        <span className={`review-status ${msg.reviewStatus}`}>
                            {msg.reviewStatus === 'reviewed' ? '✅ تمت المراجعة' : '⏭️ تم التجاهل'}
                        </span>
                    )}
                </div>
            )
        }
    ];

    return (
        <div className="flagged-messages-page">
            {/* بطاقات الإحصائيات */}
            <div className="stats-grid">
                <StatCard icon="⏳" value={stats.pending} label="بانتظار المراجعة" color="orange" />
                <StatCard icon="✅" value={stats.reviewed} label="تمت مراجعتها" color="green" />
                <StatCard icon="⏭️" value={stats.dismissed} label="تم تجاهلها" color="gray" />
                <StatCard icon="⚠️" value={stats.total} label="إجمالي المُبلّغة" color="purple" />
            </div>

            {/* الفلاتر */}
            <div className="fm-filters">
                <div className="filter-group">
                    <label>الحالة:</label>
                    <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
                        <option value="pending">بانتظار المراجعة</option>
                        <option value="reviewed">تمت المراجعة</option>
                        <option value="dismissed">تم التجاهل</option>
                        <option value="all">الكل</option>
                    </select>
                </div>
                <div className="filter-group">
                    <label>الخطورة:</label>
                    <select value={severityFilter} onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}>
                        <option value="">الكل</option>
                        <option value="high">عالية</option>
                        <option value="medium">متوسطة</option>
                        <option value="low">منخفضة</option>
                    </select>
                </div>
                <div className="filter-group">
                    <label>النوع:</label>
                    <select value={chatTypeFilter} onChange={(e) => { setChatTypeFilter(e.target.value); setPage(1); }}>
                        <option value="">الكل</option>
                        <option value="conversation">محادثة خاصة</option>
                        <option value="room">غرفة</option>
                    </select>
                </div>
            </div>

            {/* الجدول */}
            <DataTable
                columns={columns}
                data={messages}
                loading={loading && page > 1}
                headerTitle={`رسائل للمراجعة (${total})`}
                emptyIcon="✅"
                emptyMessage="لا توجد رسائل للمراجعة"
                rowClassName={(msg) => msg.bannedWordSeverity === 'high' ? 'fm-row-high' : ''}
            >
                {totalPages > 1 && (
                    <div className="simple-pagination">
                        <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                            السابق
                        </button>
                        <span className="page-info">صفحة {page} من {totalPages}</span>
                        <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                            التالي
                        </button>
                    </div>
                )}
            </DataTable>
        </div>
    );
}

export default FlaggedMessages;
