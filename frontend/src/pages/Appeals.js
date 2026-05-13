import React, { useState, useEffect } from 'react';
import { getAppeals, approveAppeal, rejectAppeal, deleteAppeal, getAppealDetails, sendAppealMessage } from '../services/api';
import { useToast } from '../components/Toast';
import { getImageUrl, getDefaultAvatar } from '../config';
import { formatDateTimeLong } from '../utils/formatters';

function Appeals({ onViewDetail }) {
    const [appeals, setAppeals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('pending');
    const [pendingCount, setPendingCount] = useState(0);
    const [notes, setNotes] = useState({});
    const [processingId, setProcessingId] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const [details, setDetails] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [replyText, setReplyText] = useState('');
    const toast = useToast();

    const fetchList = async () => {
        try {
            setLoading(true);
            const res = await getAppeals({ status: filter, limit: 50 });
            if (res.success) {
                setAppeals(res.data || []);
                setPendingCount(res.pendingCount || 0);
            }
        } catch { toast.error('فشل تحميل الطلبات'); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchList(); /* eslint-disable-next-line */ }, [filter]);

    const openDetails = async (appeal) => {
        setSelectedId(appeal._id);
        setDetails(null);
        setDetailLoading(true);
        try {
            const res = await getAppealDetails(appeal._id);
            if (res.success) setDetails(res.data);
        } catch { toast.error('فشل تحميل التفاصيل'); }
        finally { setDetailLoading(false); }
    };

    const closeDetails = () => {
        setSelectedId(null);
        setDetails(null);
        setReplyText('');
    };

    const handleApprove = async () => {
        if (!details) return;
        const a = details.appeal;
        const note = notes[a._id] || '';
        if (!window.confirm(`قبول الطلب وفك الحظر عن "${a.user?.name}"؟${note ? '\n\nملاحظة سترسل للمستخدم:\n' + note : ''}`)) return;
        try {
            setProcessingId(a._id);
            await approveAppeal(a._id, note);
            toast.success('تم قبول الطلب');
            setNotes({ ...notes, [a._id]: '' });
            closeDetails();
            fetchList();
        } catch (e) { toast.error(e.response?.data?.message || 'فشل'); }
        finally { setProcessingId(null); }
    };

    const handleReject = async () => {
        if (!details) return;
        const a = details.appeal;
        const note = notes[a._id] || '';
        if (!note.trim()) { toast.error('اكتب سبب الرفض أولاً'); return; }
        if (!window.confirm(`رفض الطلب؟\n\nسبب الرفض:\n${note}`)) return;
        try {
            setProcessingId(a._id);
            await rejectAppeal(a._id, note);
            toast.success('تم الرفض');
            closeDetails();
            fetchList();
        } catch { toast.error('فشل'); }
        finally { setProcessingId(null); }
    };

    const handleDelete = async (appeal) => {
        if (!window.confirm(`حذف الطلب نهائياً؟\nسيتمكن "${appeal.user?.name}" من تقديم طلب جديد.`)) return;
        try {
            setProcessingId(appeal._id);
            await deleteAppeal(appeal._id);
            toast.success('تم الحذف');
            if (selectedId === appeal._id) closeDetails();
            fetchList();
        } catch { toast.error('فشل'); }
        finally { setProcessingId(null); }
    };

    const sendReply = async () => {
        if (!details || !replyText.trim()) return;
        try {
            await sendAppealMessage(details.appeal._id, replyText.trim());
            setReplyText('');
            toast.success('تم الإرسال');
            const res = await getAppealDetails(details.appeal._id);
            if (res.success) setDetails(res.data);
        } catch { toast.error('فشل الإرسال'); }
    };

    const typeInfo = (t) => ({
        temporary: { label: 'تعليق مؤقت', color: '#f59e0b', bg: '#fef3c7' },
        permanent: { label: 'حظر نهائي', color: '#dc2626', bg: '#fecaca' },
        device: { label: 'حظر جهاز', color: '#111827', bg: '#d1d5db' },
        name: { label: 'حظر اسم', color: '#be185d', bg: '#fce7f3' }
    }[t] || { label: t || '-', color: '#6b7280', bg: '#e5e7eb' });

    const statusInfo = (s) => ({
        pending: { label: 'قيد المراجعة', color: '#92400e', bg: '#fef3c7', icon: '⏳' },
        approved: { label: 'مقبول', color: '#065f46', bg: '#d1fae5', icon: '✅' },
        rejected: { label: 'مرفوض', color: '#991b1b', bg: '#fecaca', icon: '❌' }
    }[s] || { label: s, color: '#6b7280', bg: '#e5e7eb', icon: '•' });

    // ═══ بطاقة ملخص في القائمة ═══
    const renderListCard = (a) => {
        const t = typeInfo(a.suspensionType);
        const st = statusInfo(a.status);
        const isPending = a.status === 'pending';
        const hasUnread = (a.unreadByAdmin || 0) > 0;

        return (
            <div key={a._id} onClick={() => openDetails(a)} style={{
                background: selectedId === a._id ? '#eef2ff' : '#fff',
                borderRadius: '8px', padding: '10px 12px',
                border: isPending ? '1px solid #fbbf24' : '1px solid #e5e7eb',
                marginBottom: '6px', cursor: 'pointer',
                transition: 'background 0.15s'
            }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <img src={a.user?.profileImage ? getImageUrl(a.user.profileImage) : getDefaultAvatar(a.user?.name)}
                        alt="" style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }}
                        onError={(e) => { e.target.onerror = null; e.target.src = getDefaultAvatar(a.user?.name); }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: '700', fontSize: '13px' }}>{a.user?.name || '-'}</span>
                            {a.user?.uniqueTag && (
                                <span style={{ fontSize: '10px', color: '#6366f1', fontFamily: 'monospace' }}>{a.user.uniqueTag}</span>
                            )}
                            <span style={{ padding: '1px 6px', borderRadius: '8px', background: t.bg, color: t.color, fontSize: '10px' }}>
                                {t.label}
                            </span>
                            {hasUnread && (
                                <span style={{ padding: '1px 6px', borderRadius: '8px', background: '#ef4444', color: '#fff', fontSize: '10px', fontWeight: '700' }}>
                                    {a.unreadByAdmin} جديد
                                </span>
                            )}
                        </div>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {(a.message || '').substring(0, 60)}{(a.message || '').length > 60 && '...'}
                        </div>
                    </div>
                    <span style={{ padding: '3px 8px', borderRadius: '10px', background: st.bg, color: st.color, fontSize: '10px', fontWeight: '700' }}>
                        {st.icon}
                    </span>
                </div>
            </div>
        );
    };

    // ═══ لوحة التفاصيل ═══
    const renderDetailsPanel = () => {
        if (!selectedId) {
            return (
                <div style={{ padding: '60px 20px', textAlign: 'center', color: '#9ca3af' }}>
                    <div style={{ fontSize: '48px' }}>👈</div>
                    <p style={{ marginTop: '10px' }}>اختر طلب من القائمة لعرض تفاصيله</p>
                </div>
            );
        }
        if (detailLoading) return <p style={{ textAlign: 'center', padding: '40px' }}>جاري التحميل...</p>;
        if (!details) return <p style={{ textAlign: 'center', padding: '40px' }}>لا توجد بيانات</p>;

        const a = details.appeal;
        const u = a.user;
        const stats = details.stats || {};
        const t = typeInfo(a.suspensionType);
        const st = statusInfo(a.status);
        const isPending = a.status === 'pending';

        return (
            <div style={{ padding: '20px' }}>
                {/* Header */}
                <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <img src={u?.profileImage ? getImageUrl(u.profileImage) : getDefaultAvatar(u?.name)}
                        alt="" style={{ width: '56px', height: '56px', borderRadius: '50%', cursor: 'pointer', objectFit: 'cover' }}
                        onClick={() => onViewDetail && onViewDetail(u?._id)}
                        onError={(e) => { e.target.onerror = null; e.target.src = getDefaultAvatar(u?.name); }} />
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <h3 style={{ margin: 0, fontSize: '17px', cursor: 'pointer' }} onClick={() => onViewDetail && onViewDetail(u?._id)}>{u?.name}</h3>
                            <span style={{ padding: '2px 8px', borderRadius: '10px', background: t.bg, color: t.color, fontSize: '11px', fontWeight: '600' }}>{t.label}</span>
                            <span style={{ padding: '2px 8px', borderRadius: '10px', background: st.bg, color: st.color, fontSize: '11px', fontWeight: '700' }}>{st.icon} {st.label}</span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{u?.email} · قُدّم في {formatDateTimeLong(a.createdAt)}</div>
                    </div>
                    <button onClick={closeDetails} style={{ padding: '4px 10px', background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer' }}>✕</button>
                </div>

                {/* إحصائيات سريعة */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', marginBottom: '14px' }}>
                    <div style={{ padding: '10px', borderRadius: '8px', background: '#fee2e2', textAlign: 'center' }}>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: '#991b1b' }}>{u?.violationCount || 0}</div>
                        <div style={{ fontSize: '11px', color: '#7f1d1d' }}>مخالفة إجمالاً</div>
                    </div>
                    <div style={{ padding: '10px', borderRadius: '8px', background: '#fef3c7', textAlign: 'center' }}>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: '#92400e' }}>{u?.suspensionCount || 0}</div>
                        <div style={{ fontSize: '11px', color: '#78350f' }}>إيقاف سابق</div>
                    </div>
                    <div style={{ padding: '10px', borderRadius: '8px', background: '#e0e7ff', textAlign: 'center' }}>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: '#3730a3' }}>{stats.totalAppeals || 0}</div>
                        <div style={{ fontSize: '11px', color: '#312e81' }}>استئناف إجمالاً</div>
                    </div>
                    <div style={{ padding: '10px', borderRadius: '8px', background: '#d1fae5', textAlign: 'center' }}>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: '#065f46' }}>{stats.approvedAppeals || 0}</div>
                        <div style={{ fontSize: '11px', color: '#064e3b' }}>مقبول سابقاً</div>
                    </div>
                    <div style={{ padding: '10px', borderRadius: '8px', background: '#fee2e2', textAlign: 'center' }}>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: '#991b1b' }}>{stats.flaggedMessagesCount || 0}</div>
                        <div style={{ fontSize: '11px', color: '#7f1d1d' }}>رسالة مخالفة</div>
                    </div>
                </div>

                {/* رسالة الاستئناف */}
                <div style={{ marginBottom: '14px', padding: '12px', background: '#f9fafb', borderRadius: '8px', borderRight: '3px solid #6366f1' }}>
                    <div style={{ fontSize: '11px', color: '#6366f1', fontWeight: '700', marginBottom: '4px' }}>📩 طلب الاستئناف:</div>
                    <div style={{ fontSize: '14px', whiteSpace: 'pre-wrap' }}>{a.message || '(فارغ)'}</div>
                </div>

                {/* سبب الحظر الحالي */}
                {a.suspendReasonSnapshot && (
                    <div style={{ marginBottom: '14px', padding: '10px 12px', background: '#fef2f2', borderRadius: '8px', fontSize: '13px', color: '#7f1d1d' }}>
                        <b>🚫 سبب الحظر:</b> {a.suspendReasonSnapshot}
                    </div>
                )}

                {/* آخر المخالفات (سجل) */}
                {u?.warnings && u.warnings.length > 0 && (
                    <div style={{ marginBottom: '14px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '6px', color: '#374151' }}>📋 آخر المخالفات ({u.warnings.length})</div>
                        <div style={{ maxHeight: '160px', overflowY: 'auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                            {u.warnings.slice(-10).reverse().map((w, i) => (
                                <div key={i} style={{ padding: '8px 12px', borderBottom: i < Math.min(9, u.warnings.length - 1) ? '1px solid #f3f4f6' : 'none', fontSize: '12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                        <span style={{
                                            padding: '1px 6px', borderRadius: '6px', fontSize: '10px',
                                            background: w.action === 'permanent_ban' ? '#111827' : w.action === 'auto_suspend' ? '#fecaca' : w.action === 'suspend' ? '#fed7aa' : '#fef3c7',
                                            color: w.action === 'permanent_ban' ? '#fca5a5' : '#000'
                                        }}>{w.action}</span>
                                        <span style={{ color: '#6b7280', fontSize: '10px' }}>{formatDateTimeLong(w.date)}</span>
                                    </div>
                                    <div style={{ color: '#374151' }}>{w.reason}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* محادثة (thread) */}
                <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '6px', color: '#374151' }}>💬 المحادثة</div>
                    <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '10px', maxHeight: '260px', overflowY: 'auto' }}>
                        {(a.thread || []).length === 0 ? (
                            <p style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center', padding: '16px' }}>لا توجد رسائل بعد — ابدأ المحادثة</p>
                        ) : (
                            a.thread.map((m, i) => {
                                const isAdmin = m.senderType === 'admin';
                                return (
                                    <div key={i} style={{
                                        display: 'flex',
                                        justifyContent: isAdmin ? 'flex-start' : 'flex-end',
                                        marginBottom: '6px'
                                    }}>
                                        <div style={{
                                            maxWidth: '75%',
                                            padding: '8px 12px',
                                            borderRadius: '12px',
                                            background: isAdmin ? '#dbeafe' : '#fff',
                                            border: isAdmin ? 'none' : '1px solid #e5e7eb'
                                        }}>
                                            <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '2px', fontWeight: '600' }}>
                                                {isAdmin ? `🛡️ ${m.senderName || 'الإدارة'}` : `👤 ${m.senderName || 'المستخدم'}`}
                                            </div>
                                            <div style={{ fontSize: '13px', whiteSpace: 'pre-wrap' }}>{m.message}</div>
                                            <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px', textAlign: 'left' }}>
                                                {formatDateTimeLong(m.createdAt)}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                    {/* صندوق إرسال رسالة */}
                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                        <input
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                            placeholder="اكتب رسالة للمستخدم..."
                            style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px' }}
                        />
                        <button onClick={sendReply} disabled={!replyText.trim()}
                            style={{
                                padding: '8px 16px', borderRadius: '8px', border: 'none',
                                background: replyText.trim() ? '#6366f1' : '#d1d5db',
                                color: '#fff', cursor: replyText.trim() ? 'pointer' : 'not-allowed',
                                fontWeight: '700', fontSize: '13px'
                            }}>إرسال 📤</button>
                    </div>
                </div>

                {/* أدوات القرار */}
                {isPending ? (
                    <div style={{ background: '#fffbeb', padding: '12px', borderRadius: '10px', border: '1px solid #fbbf24' }}>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: '#92400e', marginBottom: '6px' }}>⚙️ اتخاذ قرار:</div>
                        <textarea
                            value={notes[a._id] || ''}
                            onChange={(e) => setNotes({ ...notes, [a._id]: e.target.value })}
                            placeholder="ملاحظة الإدارة (ستصل للمستخدم كإشعار)..."
                            rows={3}
                            style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                        />
                        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                            <button onClick={handleApprove} disabled={processingId === a._id}
                                style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>
                                ✅ قبول وفك الحظر
                            </button>
                            <button onClick={handleReject} disabled={processingId === a._id}
                                style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>
                                ❌ رفض
                            </button>
                            <button onClick={() => handleDelete(a)} disabled={processingId === a._id}
                                title="حذف الطلب"
                                style={{ padding: '10px 14px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', color: '#6b7280', cursor: 'pointer' }}>
                                🗑️
                            </button>
                        </div>
                    </div>
                ) : (
                    <div style={{ padding: '12px', background: a.status === 'approved' ? '#f0fdf4' : '#fef2f2', borderRadius: '8px', fontSize: '13px' }}>
                        <div><b>قرار:</b> {a.reviewedBy?.name || '-'} · {formatDateTimeLong(a.reviewedAt)}</div>
                        {a.decisionNote && <div style={{ marginTop: '4px', whiteSpace: 'pre-wrap' }}><b>ملاحظة:</b> {a.decisionNote}</div>}
                        <button onClick={() => handleDelete(a)} style={{ marginTop: '8px', padding: '6px 12px', border: '1px solid #d1d5db', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>🗑️ حذف السجل</button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={{ padding: '20px', height: 'calc(100vh - 80px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '22px' }}>📝 طلبات الاستئناف</h1>
                    <p style={{ color: '#6b7280', margin: '4px 0 0', fontSize: '13px' }}>
                        قيد المراجعة: <b style={{ color: '#f59e0b' }}>{pendingCount}</b>
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '4px', background: '#f3f4f6', padding: '4px', borderRadius: '8px' }}>
                        {[
                            { v: 'pending', l: '⏳' },
                            { v: 'approved', l: '✅' },
                            { v: 'rejected', l: '❌' },
                            { v: 'all', l: '📋' }
                        ].map(opt => (
                            <button key={opt.v} onClick={() => { setFilter(opt.v); closeDetails(); }}
                                style={{
                                    padding: '6px 12px', borderRadius: '6px', border: 'none',
                                    background: filter === opt.v ? '#fff' : 'transparent',
                                    cursor: 'pointer', fontSize: '14px',
                                    boxShadow: filter === opt.v ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                                }}>
                                {opt.l}
                            </button>
                        ))}
                    </div>
                    <button onClick={fetchList} style={{ padding: '6px 12px', border: '1px solid #d1d5db', background: '#fff', borderRadius: '8px', cursor: 'pointer' }}>🔄</button>
                </div>
            </div>

            {/* Split Layout */}
            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '16px', height: 'calc(100vh - 160px)' }}>
                {/* Left: List */}
                <div style={{ overflowY: 'auto', paddingLeft: '4px' }}>
                    {loading ? (
                        <p style={{ textAlign: 'center', padding: '20px', color: '#9ca3af' }}>جاري...</p>
                    ) : appeals.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', background: '#f9fafb', borderRadius: '10px' }}>
                            <div style={{ fontSize: '36px' }}>📬</div>
                            <p style={{ color: '#6b7280', fontSize: '13px', marginTop: '8px' }}>لا توجد طلبات</p>
                        </div>
                    ) : (
                        appeals.map(renderListCard)
                    )}
                </div>

                {/* Right: Details */}
                <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflowY: 'auto' }}>
                    {renderDetailsPanel()}
                </div>
            </div>
        </div>
    );
}

export default Appeals;
