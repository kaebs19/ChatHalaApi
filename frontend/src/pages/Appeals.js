import React, { useState, useEffect } from 'react';
import { getAppeals, approveAppeal, rejectAppeal, deleteAppeal } from '../services/api';
import { useToast } from '../components/Toast';
import { getImageUrl, getDefaultAvatar } from '../config';
import { formatDateTimeLong } from '../utils/formatters';

function Appeals({ onViewDetail }) {
    const [appeals, setAppeals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('pending');
    const [pendingCount, setPendingCount] = useState(0);
    const [notes, setNotes] = useState({}); // per-appeal note
    const [expandedIds, setExpandedIds] = useState(new Set());
    const [processingId, setProcessingId] = useState(null);
    const toast = useToast();

    const fetch = async () => {
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

    useEffect(() => { fetch(); /* eslint-disable-next-line */ }, [filter]);

    const toggleExpanded = (id) => {
        const s = new Set(expandedIds);
        s.has(id) ? s.delete(id) : s.add(id);
        setExpandedIds(s);
    };

    const handleApprove = async (appeal) => {
        const note = notes[appeal._id] || '';
        if (!window.confirm(`قبول الطلب وفك الحظر عن "${appeal.user?.name}"؟${note ? '\n\nملاحظة سترسل للمستخدم:\n' + note : ''}`)) return;
        try {
            setProcessingId(appeal._id);
            await approveAppeal(appeal._id, note);
            toast.success('تم قبول الطلب');
            setNotes({ ...notes, [appeal._id]: '' });
            fetch();
        } catch (e) { toast.error(e.response?.data?.message || 'فشل'); }
        finally { setProcessingId(null); }
    };

    const handleReject = async (appeal) => {
        const note = notes[appeal._id] || '';
        if (!note.trim()) {
            toast.error('اكتب سبب الرفض أولاً ليعرفه المستخدم');
            return;
        }
        if (!window.confirm(`رفض الطلب؟\n\nسبب الرفض الذي سيصل للمستخدم:\n${note}`)) return;
        try {
            setProcessingId(appeal._id);
            await rejectAppeal(appeal._id, note);
            toast.success('تم رفض الطلب');
            setNotes({ ...notes, [appeal._id]: '' });
            fetch();
        } catch { toast.error('فشل'); }
        finally { setProcessingId(null); }
    };

    const handleDelete = async (appeal) => {
        if (!window.confirm(`حذف الطلب نهائياً؟\n\nسيتمكن المستخدم "${appeal.user?.name}" من تقديم طلب جديد.`)) return;
        try {
            setProcessingId(appeal._id);
            await deleteAppeal(appeal._id);
            toast.success('تم حذف الطلب');
            fetch();
        } catch { toast.error('فشل الحذف'); }
        finally { setProcessingId(null); }
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

    const renderCard = (a) => {
        const t = typeInfo(a.suspensionType);
        const st = statusInfo(a.status);
        const isExpanded = expandedIds.has(a._id);
        const isPending = a.status === 'pending';
        const shortMsg = (a.message || '').length > 120 && !isExpanded
            ? (a.message || '').substring(0, 120) + '...'
            : a.message;

        return (
            <div key={a._id} style={{
                background: '#fff',
                borderRadius: '10px',
                padding: '12px 14px',
                border: isPending ? '1px solid #fbbf24' : '1px solid #e5e7eb',
                boxShadow: isPending ? '0 1px 2px rgba(245,158,11,0.1)' : 'none',
                marginBottom: '8px'
            }}>
                {/* سطر أعلى: الصورة + الاسم + النوع + الحالة */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <img
                        src={a.user?.profileImage ? getImageUrl(a.user.profileImage) : getDefaultAvatar(a.user?.name)}
                        alt=""
                        style={{ width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', objectFit: 'cover', flexShrink: 0 }}
                        onClick={() => onViewDetail && onViewDetail(a.user?._id)}
                        onError={(e) => { e.target.onerror = null; e.target.src = getDefaultAvatar(a.user?.name); }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}
                                onClick={() => onViewDetail && onViewDetail(a.user?._id)}>
                                {a.user?.name || 'مستخدم محذوف'}
                            </span>
                            <span style={{ padding: '2px 8px', borderRadius: '10px', background: t.bg, color: t.color, fontSize: '11px', fontWeight: '600' }}>
                                {t.label}
                            </span>
                            {a.user?.violationCount > 0 && (
                                <span style={{ padding: '2px 6px', borderRadius: '10px', background: '#fee2e2', color: '#991b1b', fontSize: '11px', fontWeight: '700' }}>
                                    ⚠️ {a.user.violationCount}
                                </span>
                            )}
                        </div>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                            {a.user?.email} · {formatDateTimeLong(a.createdAt)}
                        </div>
                    </div>
                    <span style={{ padding: '4px 10px', borderRadius: '12px', background: st.bg, color: st.color, fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>
                        {st.icon} {st.label}
                    </span>
                </div>

                {/* رسالة المستخدم */}
                <div style={{ marginTop: '10px', padding: '8px 10px', background: '#f9fafb', borderRadius: '6px', borderRight: '3px solid #6366f1' }}>
                    <div style={{ fontSize: '13px', color: '#1f2937', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{shortMsg}</div>
                    {(a.message || '').length > 120 && (
                        <button onClick={() => toggleExpanded(a._id)}
                            style={{ marginTop: '4px', background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: '11px', padding: 0 }}>
                            {isExpanded ? 'طي' : 'عرض الكل'}
                        </button>
                    )}
                </div>

                {/* تفاصيل إضافية إذا عم توسع */}
                {isExpanded && a.suspendReasonSnapshot && (
                    <div style={{ marginTop: '6px', padding: '6px 10px', background: '#fef2f2', borderRadius: '6px', fontSize: '12px', color: '#7f1d1d' }}>
                        <b>سبب الحظر:</b> {a.suspendReasonSnapshot}
                    </div>
                )}

                {/* قرار سابق */}
                {!isPending && (a.decisionNote || a.reviewedBy) && (
                    <div style={{ marginTop: '8px', padding: '8px 10px', background: a.status === 'approved' ? '#f0fdf4' : '#fef2f2', borderRadius: '6px', fontSize: '12px' }}>
                        {a.reviewedBy?.name && <span><b>{a.reviewedBy.name}</b> · {formatDateTimeLong(a.reviewedAt)}</span>}
                        {a.decisionNote && (
                            <div style={{ marginTop: '4px', whiteSpace: 'pre-wrap' }}>
                                <b>الملاحظة:</b> {a.decisionNote}
                            </div>
                        )}
                    </div>
                )}

                {/* أدوات القرار للطلبات المعلقة */}
                {isPending && (
                    <div style={{ marginTop: '10px' }}>
                        <textarea
                            value={notes[a._id] || ''}
                            onChange={(e) => setNotes({ ...notes, [a._id]: e.target.value })}
                            placeholder="اكتب ملاحظة ستصل للمستخدم كإشعار (مثلاً: سبب الرفض أو التنبيه)..."
                            rows={2}
                            style={{
                                width: '100%',
                                padding: '8px 10px',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '13px',
                                resize: 'vertical',
                                fontFamily: 'inherit',
                                boxSizing: 'border-box'
                            }}
                        />
                        <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                            <button onClick={() => handleApprove(a)} disabled={processingId === a._id}
                                style={{
                                    flex: 1, padding: '8px', borderRadius: '6px', border: 'none',
                                    background: processingId === a._id ? '#9ca3af' : '#10b981',
                                    color: '#fff', cursor: processingId === a._id ? 'wait' : 'pointer',
                                    fontWeight: '700', fontSize: '13px'
                                }}>
                                ✅ قبول وفك الحظر
                            </button>
                            <button onClick={() => handleReject(a)} disabled={processingId === a._id}
                                style={{
                                    flex: 1, padding: '8px', borderRadius: '6px', border: 'none',
                                    background: processingId === a._id ? '#9ca3af' : '#ef4444',
                                    color: '#fff', cursor: processingId === a._id ? 'wait' : 'pointer',
                                    fontWeight: '700', fontSize: '13px'
                                }}>
                                ❌ رفض
                            </button>
                            <button onClick={() => handleDelete(a)} disabled={processingId === a._id}
                                title="حذف الطلب (يسمح بتقديم طلب جديد)"
                                style={{
                                    padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db',
                                    background: '#fff', color: '#6b7280',
                                    cursor: processingId === a._id ? 'wait' : 'pointer',
                                    fontWeight: '600', fontSize: '13px'
                                }}>
                                🗑️
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '22px' }}>📝 طلبات الاستئناف</h1>
                    <p style={{ color: '#6b7280', margin: '4px 0 0', fontSize: '13px' }}>
                        قيد المراجعة: <b style={{ color: '#f59e0b' }}>{pendingCount}</b>
                        {appeals.length > 0 && filter !== 'pending' && <> · معروض: <b>{appeals.length}</b></>}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '4px', background: '#f3f4f6', padding: '4px', borderRadius: '8px' }}>
                        {[
                            { v: 'pending', l: '⏳ قيد المراجعة' },
                            { v: 'approved', l: '✅ مقبولة' },
                            { v: 'rejected', l: '❌ مرفوضة' },
                            { v: 'all', l: '📋 الكل' }
                        ].map(opt => (
                            <button key={opt.v} onClick={() => setFilter(opt.v)}
                                style={{
                                    padding: '6px 12px', borderRadius: '6px', border: 'none',
                                    background: filter === opt.v ? '#fff' : 'transparent',
                                    color: filter === opt.v ? '#111827' : '#6b7280',
                                    fontWeight: filter === opt.v ? '700' : '500',
                                    cursor: 'pointer', fontSize: '12px',
                                    boxShadow: filter === opt.v ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                                }}>
                                {opt.l}
                            </button>
                        ))}
                    </div>
                    <button onClick={fetch} className="refresh-btn" style={{ padding: '6px 12px', fontSize: '13px' }}>🔄</button>
                </div>
            </div>

            {loading ? (
                <p style={{ textAlign: 'center', padding: '40px' }}>جاري التحميل...</p>
            ) : appeals.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '50px', background: '#f9fafb', borderRadius: '10px' }}>
                    <div style={{ fontSize: '42px' }}>📬</div>
                    <p style={{ color: '#6b7280', marginTop: '8px', fontSize: '14px' }}>لا توجد طلبات</p>
                </div>
            ) : (
                <div>{appeals.map(renderCard)}</div>
            )}
        </div>
    );
}

export default Appeals;
