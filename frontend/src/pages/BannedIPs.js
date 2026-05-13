import React, { useState, useEffect } from 'react';
import { getBannedIPs, banIP, unbanIP, getBannedIPAccounts } from '../services/api';
import { useToast } from '../components/Toast';
import { formatDateTimeLong } from '../utils/formatters';

function BannedIPs({ onViewDetail }) {
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(null);
    const [accounts, setAccounts] = useState([]);
    const [showAddForm, setShowAddForm] = useState(false);
    const [form, setForm] = useState({ ip: '', reason: 'حظر يدوي من الأدمن', days: '30' });
    const toast = useToast();

    const fetch = async () => {
        try {
            setLoading(true);
            const res = await getBannedIPs();
            if (res.success) setList(res.data || []);
        } catch { toast.error('فشل تحميل القائمة'); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetch(); }, []); // eslint-disable-line

    const handleBan = async (e) => {
        e.preventDefault();
        if (!form.ip.trim()) { toast.error('IP مطلوب'); return; }
        try {
            const days = form.days === '' || form.days === 'permanent' ? null : Number(form.days);
            await banIP({ ip: form.ip.trim(), reason: form.reason, days });
            toast.success('تم حظر IP');
            setShowAddForm(false);
            setForm({ ip: '', reason: 'حظر يدوي من الأدمن', days: '30' });
            fetch();
        } catch { toast.error('فشل الحظر'); }
    };

    const handleUnban = async (item) => {
        if (!window.confirm(`فك حظر IP ${item.ip}؟`)) return;
        try {
            await unbanIP(item._id);
            toast.success('تم فك الحظر');
            if (selected?._id === item._id) setSelected(null);
            fetch();
        } catch { toast.error('فشل فك الحظر'); }
    };

    const handleShow = async (item) => {
        setSelected(item);
        try {
            const res = await getBannedIPAccounts(item._id);
            if (res.success) setAccounts(res.data?.accounts || []);
        } catch { toast.error('فشل تحميل الحسابات'); }
    };

    const remainingText = (expiresAt) => {
        if (!expiresAt) return 'دائم';
        const diff = new Date(expiresAt) - new Date();
        if (diff <= 0) return 'منتهي';
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        const hours = Math.ceil(diff / (1000 * 60 * 60));
        return days > 1 ? `${days} يوم` : `${hours} ساعة`;
    };

    if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>جاري التحميل...</div>;

    return (
        <div style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0 }}>🌐 IPs المحظورة ({list.length})</h2>
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    style={{ padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                >
                    {showAddForm ? '✕ إلغاء' : '➕ حظر IP جديد'}
                </button>
            </div>

            {showAddForm && (
                <form onSubmit={handleBan} style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', display: 'grid', gap: '8px' }}>
                    <input
                        type="text"
                        placeholder="IP (مثل 192.168.1.1)"
                        value={form.ip}
                        onChange={(e) => setForm({ ...form, ip: e.target.value })}
                        style={{ padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', direction: 'ltr' }}
                    />
                    <input
                        type="text"
                        placeholder="سبب الحظر"
                        value={form.reason}
                        onChange={(e) => setForm({ ...form, reason: e.target.value })}
                        style={{ padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                    />
                    <select
                        value={form.days}
                        onChange={(e) => setForm({ ...form, days: e.target.value })}
                        style={{ padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                    >
                        <option value="1">يوم واحد</option>
                        <option value="7">7 أيام</option>
                        <option value="30">30 يوم (الافتراضي)</option>
                        <option value="90">90 يوم</option>
                        <option value="permanent">دائم</option>
                    </select>
                    <button
                        type="submit"
                        style={{ padding: '10px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                    >
                        🛡️ حظر
                    </button>
                </form>
            )}

            {list.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                    لا يوجد IPs محظورة
                </div>
            ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: '8px', overflow: 'hidden' }}>
                    <thead style={{ background: '#f3f4f6' }}>
                        <tr>
                            <th style={{ padding: '10px', textAlign: 'right' }}>IP</th>
                            <th style={{ padding: '10px', textAlign: 'right' }}>السبب</th>
                            <th style={{ padding: '10px', textAlign: 'center' }}>الحسابات</th>
                            <th style={{ padding: '10px', textAlign: 'center' }}>المدة المتبقية</th>
                            <th style={{ padding: '10px', textAlign: 'center' }}>بواسطة</th>
                            <th style={{ padding: '10px', textAlign: 'center' }}>التاريخ</th>
                            <th style={{ padding: '10px', textAlign: 'center' }}>إجراء</th>
                        </tr>
                    </thead>
                    <tbody>
                        {list.map((item) => (
                            <tr key={item._id} style={{ borderTop: '1px solid #e5e7eb' }}>
                                <td style={{ padding: '10px', fontFamily: 'monospace', color: '#2563eb', cursor: 'pointer' }} onClick={() => handleShow(item)}>
                                    {item.ip}
                                </td>
                                <td style={{ padding: '10px', fontSize: '13px', color: '#6b7280' }}>{item.reason}</td>
                                <td style={{ padding: '10px', textAlign: 'center' }}>
                                    <span style={{ padding: '2px 8px', background: '#fef3c7', color: '#92400e', borderRadius: '12px', fontSize: '12px' }}>
                                        {item.accountsCount || 0}
                                    </span>
                                </td>
                                <td style={{ padding: '10px', textAlign: 'center', fontSize: '12px' }}>
                                    <span style={{
                                        padding: '2px 8px',
                                        background: item.expiresAt ? '#dbeafe' : '#fecaca',
                                        color: item.expiresAt ? '#1e40af' : '#991b1b',
                                        borderRadius: '12px'
                                    }}>
                                        {remainingText(item.expiresAt)}
                                    </span>
                                </td>
                                <td style={{ padding: '10px', textAlign: 'center', fontSize: '13px' }}>{item.bannedBy?.name || '-'}</td>
                                <td style={{ padding: '10px', textAlign: 'center', fontSize: '12px', color: '#6b7280' }}>{formatDateTimeLong(item.bannedAt)}</td>
                                <td style={{ padding: '10px', textAlign: 'center' }}>
                                    <button
                                        onClick={() => handleUnban(item)}
                                        style={{ padding: '4px 12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                                    >
                                        ✓ فك
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {selected && (
                <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h3 style={{ margin: 0 }}>الحسابات التي استخدمت IP: <code style={{ color: '#2563eb' }}>{selected.ip}</code></h3>
                        <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>✕</button>
                    </div>
                    {accounts.length === 0 ? (
                        <div style={{ color: '#6b7280' }}>لا توجد حسابات</div>
                    ) : (
                        <div style={{ display: 'grid', gap: '6px' }}>
                            {accounts.map((a) => (
                                <div
                                    key={a._id}
                                    onClick={() => onViewDetail?.(a._id)}
                                    style={{ padding: '8px 12px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                >
                                    <div>
                                        <strong>{a.name}</strong>
                                        <span style={{ marginRight: '8px', color: '#6b7280', fontSize: '12px' }}>{a.email}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        {a.deviceBanned && <span style={{ padding: '2px 6px', background: '#111827', color: '#fca5a5', borderRadius: '8px', fontSize: '10px' }}>📵 محظور</span>}
                                        {!a.isActive && !a.deviceBanned && <span style={{ padding: '2px 6px', background: '#fecaca', color: '#991b1b', borderRadius: '8px', fontSize: '10px' }}>معلّق</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default BannedIPs;
