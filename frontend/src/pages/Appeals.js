import React, { useState, useEffect } from 'react';
import { getAppeals, approveAppeal, rejectAppeal } from '../services/api';
import { useToast } from '../components/Toast';
import { getImageUrl, getDefaultAvatar } from '../config';
import { formatDateTimeLong } from '../utils/formatters';

function Appeals({ onViewDetail }) {
    const [appeals, setAppeals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('pending');
    const [pendingCount, setPendingCount] = useState(0);
    const toast = useToast();

    const fetch = async () => {
        try {
            setLoading(true);
            const res = await getAppeals({ status: filter });
            if (res.success) {
                setAppeals(res.data || []);
                setPendingCount(res.pendingCount || 0);
            }
        } catch { toast.error('فشل تحميل الطلبات'); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetch(); /* eslint-disable-next-line */ }, [filter]);

    const handleApprove = async (appeal) => {
        const note = window.prompt('ملاحظة (اختياري):', '');
        if (note === null) return;
        if (!window.confirm(`قبول الطلب وفك الحظر عن "${appeal.user?.name}"؟`)) return;
        try {
            await approveAppeal(appeal._id, note);
            toast.success('تم قبول الطلب وفك الحظر');
            fetch();
        } catch (e) { toast.error(e.response?.data?.message || 'فشل القبول'); }
    };

    const handleReject = async (appeal) => {
        const note = window.prompt('سبب الرفض (سيظهر للمستخدم):', '');
        if (note === null) return;
        try {
            await rejectAppeal(appeal._id, note);
            toast.success('تم رفض الطلب');
            fetch();
        } catch { toast.error('فشل الرفض'); }
    };

    const statusBadge = (status) => {
        const map = {
            pending: { bg: '#fef3c7', color: '#92400e', label: '⏳ قيد المراجعة' },
            approved: { bg: '#d1fae5', color: '#065f46', label: '✅ مقبول' },
            rejected: { bg: '#fecaca', color: '#991b1b', label: '❌ مرفوض' }
        };
        const s = map[status] || map.pending;
        return <span style={{ padding: '4px 10px', borderRadius: '12px', background: s.bg, color: s.color, fontSize: '12px', fontWeight: '700' }}>{s.label}</span>;
    };

    const typeLabel = (t) => ({
        temporary: 'تعليق مؤقت',
        permanent: 'حظر نهائي',
        device: 'حظر جهاز',
        name: 'حظر اسم'
    }[t] || t);

    return (
        <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h1 style={{ margin: 0 }}>📝 طلبات الاستئناف</h1>
                    <p style={{ color: '#6b7280', margin: '4px 0 0' }}>
                        قيد المراجعة: <b style={{ color: '#f59e0b' }}>{pendingCount}</b>
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <select value={filter} onChange={(e) => setFilter(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}>
                        <option value="pending">قيد المراجعة</option>
                        <option value="approved">مقبولة</option>
                        <option value="rejected">مرفوضة</option>
                        <option value="all">الكل</option>
                    </select>
                    <button onClick={fetch} className="refresh-btn">تحديث</button>
                </div>
            </div>

            {loading ? (
                <p style={{ textAlign: 'center', padding: '40px' }}>جاري التحميل...</p>
            ) : appeals.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', background: '#f9fafb', borderRadius: '12px' }}>
                    <div style={{ fontSize: '48px' }}>📬</div>
                    <p style={{ color: '#6b7280', marginTop: '12px' }}>لا توجد طلبات</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gap: '15px' }}>
                    {appeals.map((a) => (
                        <div key={a._id} style={{
                            background: '#fff',
                            borderRadius: '12px',
                            padding: '20px',
                            border: a.status === 'pending' ? '2px solid #fbbf24' : '1px solid #e5e7eb',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                        }}>
                            <div style={{ display: 'flex', gap: '15px', marginBottom: '15px', alignItems: 'flex-start' }}>
                                <img
                                    src={a.user?.profileImage ? getImageUrl(a.user.profileImage) : getDefaultAvatar(a.user?.name)}
                                    alt=""
                                    style={{ width: '48px', height: '48px', borderRadius: '50%', cursor: 'pointer', objectFit: 'cover' }}
                                    onClick={() => onViewDetail && onViewDetail(a.user._id)}
                                    onError={(e) => { e.target.onerror = null; e.target.src = getDefaultAvatar(a.user?.name); }}
                                />
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <h4 style={{ margin: 0, cursor: 'pointer' }}
                                            onClick={() => onViewDetail && onViewDetail(a.user._id)}>
                                            {a.user?.name || 'مستخدم محذوف'}
                                        </h4>
                                        {statusBadge(a.status)}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                                        {a.user?.email} · النوع: <b>{typeLabel(a.suspensionType)}</b> · قُدّم في {formatDateTimeLong(a.createdAt)}
                                    </div>
                                    {a.user?.violationCount > 0 && (
                                        <div style={{ fontSize: '12px', color: '#dc2626', marginTop: '2px' }}>
                                            ⚠️ عدد المخالفات: {a.user.violationCount}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {a.suspendReasonSnapshot && (
                                <div style={{ padding: '8px 12px', background: '#fef2f2', borderRadius: '8px', fontSize: '13px', marginBottom: '10px', borderRight: '3px solid #dc2626' }}>
                                    <b>سبب الحظر:</b> {a.suspendReasonSnapshot}
                                </div>
                            )}

                            <div style={{ padding: '12px', background: '#f9fafb', borderRadius: '8px', borderRight: '3px solid #6366f1' }}>
                                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', fontWeight: '600' }}>📩 رسالة المستخدم:</div>
                                <div style={{ fontSize: '14px', whiteSpace: 'pre-wrap' }}>{a.message}</div>
                            </div>

                            {a.status !== 'pending' && (
                                <div style={{ marginTop: '10px', padding: '10px', background: a.status === 'approved' ? '#f0fdf4' : '#fef2f2', borderRadius: '8px', fontSize: '13px' }}>
                                    <div><b>القرار بواسطة:</b> {a.reviewedBy?.name || '-'} · {formatDateTimeLong(a.reviewedAt)}</div>
                                    {a.decisionNote && <div style={{ marginTop: '4px' }}><b>ملاحظة:</b> {a.decisionNote}</div>}
                                </div>
                            )}

                            {a.status === 'pending' && (
                                <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                                    <button onClick={() => handleApprove(a)} style={{
                                        flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
                                        background: '#10b981', color: '#fff', cursor: 'pointer', fontWeight: '700'
                                    }}>✅ قبول وفك الحظر</button>
                                    <button onClick={() => handleReject(a)} style={{
                                        flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
                                        background: '#ef4444', color: '#fff', cursor: 'pointer', fontWeight: '700'
                                    }}>❌ رفض</button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default Appeals;
