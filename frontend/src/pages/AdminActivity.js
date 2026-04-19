import React, { useState, useEffect } from 'react';
import { getAdminActivity, getAdminActions } from '../services/api';
import { useToast } from '../components/Toast';
import { formatDateTimeLong } from '../utils/formatters';

// ترجمة actions إلى العربية + أيقونة/لون
const ACTION_INFO = {
    admin_user_suspend: { label: 'تعليق مستخدم', icon: '⏸️', color: '#f59e0b' },
    admin_user_unsuspend: { label: 'فك تعليق', icon: '▶️', color: '#10b981' },
    admin_user_ban_permanent: { label: 'حظر دائم', icon: '🚫', color: '#dc2626' },
    admin_user_unban: { label: 'فك الحظر', icon: '✅', color: '#10b981' },
    admin_user_warn: { label: 'تحذير', icon: '⚠️', color: '#f59e0b' },
    admin_user_delete: { label: 'حذف مستخدم', icon: '🗑️', color: '#dc2626' },
    admin_user_activate: { label: 'تفعيل', icon: '🔓', color: '#10b981' },
    admin_user_deactivate: { label: 'تعطيل', icon: '🔒', color: '#6b7280' },
    admin_user_ban_name: { label: 'حظر اسم', icon: '🏷️', color: '#f59e0b' },
    admin_user_reset_avatar: { label: 'حذف صورة', icon: '🖼️', color: '#f59e0b' },
    admin_user_adjust_violations: { label: 'تعديل مخالفات', icon: '📊', color: '#8b5cf6' },
    admin_user_clear_violations: { label: 'مسح مخالفات', icon: '🧹', color: '#10b981' },
    admin_user_notify: { label: 'إرسال تنبيه', icon: '📢', color: '#3b82f6' },
    admin_device_ban: { label: 'حظر جهاز', icon: '📵', color: '#dc2626' },
    admin_device_unban: { label: 'فك حظر جهاز', icon: '📱', color: '#10b981' },
    admin_ip_ban: { label: 'حظر IP', icon: '🌐', color: '#dc2626' },
    admin_ip_unban: { label: 'فك حظر IP', icon: '🌍', color: '#10b981' },
    admin_appeal_approve: { label: 'قبول استئناف', icon: '✅', color: '#10b981' },
    admin_appeal_reject: { label: 'رفض استئناف', icon: '❌', color: '#dc2626' },
    admin_report_resolve: { label: 'حل بلاغ', icon: '✓', color: '#10b981' },
    admin_report_reject: { label: 'رفض بلاغ', icon: '✗', color: '#6b7280' }
};

const getActionInfo = (action) => ACTION_INFO[action] || { label: action, icon: '📝', color: '#6b7280' };

const SEVERITY_COLORS = {
    low: { bg: '#e5e7eb', color: '#374151' },
    medium: { bg: '#fef3c7', color: '#92400e' },
    high: { bg: '#fee2e2', color: '#991b1b' },
    critical: { bg: '#111827', color: '#fca5a5' }
};

function AdminActivity({ onViewDetail }) {
    const [logs, setLogs] = useState([]);
    const [actions, setActions] = useState([]);
    const [stats24h, setStats24h] = useState([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [filters, setFilters] = useState({ action: '', severity: '', from: '', to: '' });
    const [skip, setSkip] = useState(0);
    const LIMIT = 50;
    const toast = useToast();

    const fetch = async (reset = false) => {
        try {
            setLoading(true);
            const currentSkip = reset ? 0 : skip;
            const params = {
                skip: currentSkip,
                limit: LIMIT,
                ...(filters.action && { action: filters.action }),
                ...(filters.severity && { severity: filters.severity }),
                ...(filters.from && { from: filters.from }),
                ...(filters.to && { to: filters.to })
            };
            const res = await getAdminActivity(params);
            if (res.success) {
                setLogs(res.data.logs || []);
                setTotal(res.data.total || 0);
                setStats24h(res.data.stats24h || []);
                if (reset) setSkip(0);
            }
        } catch { toast.error('فشل تحميل السجلات'); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        (async () => {
            try {
                const res = await getAdminActions();
                if (res.success) setActions(res.data || []);
            } catch {}
            fetch(true);
        })();
        // eslint-disable-next-line
    }, []);

    useEffect(() => { fetch(true); /* eslint-disable-next-line */ }, [filters]);
    useEffect(() => { fetch(false); /* eslint-disable-next-line */ }, [skip]);

    const totalLast24 = stats24h.reduce((s, e) => s + e.count, 0);

    return (
        <div style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                    <h2 style={{ margin: 0 }}>📜 سجل نشاط الأدمن</h2>
                    <p style={{ color: '#6b7280', margin: '4px 0 0', fontSize: '13px' }}>
                        آخر 24 ساعة: {totalLast24} عملية · الإجمالي: {total}
                    </p>
                </div>
                <button
                    onClick={() => fetch(true)}
                    style={{ padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                >🔄 تحديث</button>
            </div>

            {/* إحصائيات آخر 24 ساعة */}
            {stats24h.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem' }}>
                    {stats24h.map((s) => {
                        const info = getActionInfo(s._id);
                        return (
                            <div key={s._id} style={{
                                padding: '8px 12px', background: '#f3f4f6', borderRadius: '8px',
                                display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px'
                            }}>
                                <span style={{ color: info.color }}>{info.icon}</span>
                                <span>{info.label}:</span>
                                <strong>{s.count}</strong>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* فلاتر */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', marginBottom: '1rem', padding: '12px', background: '#f9fafb', borderRadius: '8px' }}>
                <select
                    value={filters.action}
                    onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                >
                    <option value="">كل الأنواع</option>
                    {actions.map((a) => (
                        <option key={a} value={a}>{getActionInfo(a).label}</option>
                    ))}
                </select>
                <select
                    value={filters.severity}
                    onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                >
                    <option value="">كل الأهميات</option>
                    <option value="low">منخفض</option>
                    <option value="medium">متوسط</option>
                    <option value="high">مرتفع</option>
                    <option value="critical">حرج</option>
                </select>
                <input
                    type="datetime-local"
                    value={filters.from}
                    onChange={(e) => setFilters({ ...filters, from: e.target.value })}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                />
                <input
                    type="datetime-local"
                    value={filters.to}
                    onChange={(e) => setFilters({ ...filters, to: e.target.value })}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                />
                {(filters.action || filters.severity || filters.from || filters.to) && (
                    <button
                        onClick={() => setFilters({ action: '', severity: '', from: '', to: '' })}
                        style={{ padding: '8px', background: '#f87171', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                    >✕ مسح الفلاتر</button>
                )}
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>جاري التحميل...</div>
            ) : logs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>لا توجد سجلات</div>
            ) : (
                <>
                    <div style={{ display: 'grid', gap: '8px' }}>
                        {logs.map((log) => {
                            const info = getActionInfo(log.action);
                            const sev = SEVERITY_COLORS[log.severity] || SEVERITY_COLORS.low;
                            return (
                                <div
                                    key={log._id}
                                    style={{
                                        background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px',
                                        padding: '12px', display: 'flex', gap: '12px', alignItems: 'start'
                                    }}
                                >
                                    <div style={{
                                        width: '40px', height: '40px', borderRadius: '8px',
                                        background: `${info.color}22`, color: info.color,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '20px', flexShrink: 0
                                    }}>{info.icon}</div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                            <strong style={{ fontSize: '14px' }}>{info.label}</strong>
                                            <span style={{ padding: '2px 6px', background: sev.bg, color: sev.color, borderRadius: '6px', fontSize: '10px', fontWeight: 'bold' }}>
                                                {log.severity}
                                            </span>
                                            {log.targetName && (
                                                <span
                                                    onClick={() => log.targetType === 'User' && log.targetId && onViewDetail?.(log.targetId)}
                                                    style={{ fontSize: '12px', color: '#2563eb', cursor: log.targetType === 'User' ? 'pointer' : 'default', textDecoration: log.targetType === 'User' ? 'underline' : 'none' }}
                                                >
                                                    → {log.targetName}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '13px', color: '#374151' }}>{log.description}</div>
                                        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                            <span>👤 {log.user?.name || 'مجهول'}</span>
                                            <span>🕐 {formatDateTimeLong(log.createdAt)}</span>
                                            {log.requestInfo?.ipAddress && <span>🌐 {log.requestInfo.ipAddress}</span>}
                                        </div>
                                        {log.metadata?.additionalInfo && Object.keys(log.metadata.additionalInfo).length > 0 && (
                                            <details style={{ marginTop: '6px', fontSize: '11px', color: '#6b7280' }}>
                                                <summary style={{ cursor: 'pointer' }}>تفاصيل إضافية</summary>
                                                <pre style={{ background: '#f9fafb', padding: '8px', borderRadius: '4px', marginTop: '4px', overflow: 'auto', direction: 'ltr' }}>
                                                    {JSON.stringify(log.metadata.additionalInfo, null, 2)}
                                                </pre>
                                            </details>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Pagination */}
                    {total > LIMIT && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '1rem' }}>
                            <button
                                onClick={() => setSkip(Math.max(0, skip - LIMIT))}
                                disabled={skip === 0}
                                style={{ padding: '6px 14px', background: skip === 0 ? '#e5e7eb' : '#2563eb', color: skip === 0 ? '#9ca3af' : 'white', border: 'none', borderRadius: '6px', cursor: skip === 0 ? 'not-allowed' : 'pointer' }}
                            >← السابق</button>
                            <span style={{ padding: '6px 14px', color: '#6b7280', fontSize: '13px' }}>
                                {skip + 1}–{Math.min(skip + LIMIT, total)} من {total}
                            </span>
                            <button
                                onClick={() => setSkip(skip + LIMIT)}
                                disabled={skip + LIMIT >= total}
                                style={{ padding: '6px 14px', background: skip + LIMIT >= total ? '#e5e7eb' : '#2563eb', color: skip + LIMIT >= total ? '#9ca3af' : 'white', border: 'none', borderRadius: '6px', cursor: skip + LIMIT >= total ? 'not-allowed' : 'pointer' }}
                            >التالي →</button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default AdminActivity;
