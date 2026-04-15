import React, { useState, useEffect } from 'react';
import { getBannedDevices, unbanUserDevice, getDeviceLinkedAccounts } from '../services/api';
import { useToast } from '../components/Toast';
import { getImageUrl, getDefaultAvatar } from '../config';
import { formatDateTimeLong } from '../utils/formatters';

function BannedDevices({ onViewDetail }) {
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [linkedAccounts, setLinkedAccounts] = useState([]);
    const [linkedLoading, setLinkedLoading] = useState(false);
    const toast = useToast();

    const fetch = async () => {
        try {
            setLoading(true);
            const res = await getBannedDevices();
            if (res.success) setDevices(res.data || []);
        } catch (e) { toast.error('فشل تحميل القائمة'); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetch(); }, []);

    const handleUnban = async (device) => {
        if (!device.originalUserId) {
            toast.error('لا يمكن فك الحظر بدون معرف مستخدم');
            return;
        }
        if (!window.confirm(`فك حظر جهاز "${device.originalUserName || 'مستخدم'}"?`)) return;
        try {
            await unbanUserDevice(device.originalUserId);
            toast.success('تم فك الحظر');
            if (selectedDevice?._id === device._id) setSelectedDevice(null);
            fetch();
        } catch { toast.error('فشل فك الحظر'); }
    };

    const handleShowLinked = async (device) => {
        setSelectedDevice(device);
        setLinkedLoading(true);
        setLinkedAccounts([]);
        try {
            const res = await getDeviceLinkedAccounts(device._id);
            if (res.success) setLinkedAccounts(res.data.accounts || []);
        } catch { toast.error('فشل تحميل الحسابات المرتبطة'); }
        finally { setLinkedLoading(false); }
    };

    const getAccountStatus = (u) => {
        if (u.deviceBanned) return { label: '📵 جهاز محظور', color: '#111827', bg: '#fca5a5' };
        if (u.suspendedUntil) {
            const days = (new Date(u.suspendedUntil) - new Date()) / (1000 * 60 * 60 * 24);
            if (days > 365) return { label: '🚫 محظور نهائياً', color: '#991b1b', bg: '#fecaca' };
            if (days > 0) return { label: '⏸️ معلّق', color: '#92400e', bg: '#fef3c7' };
        }
        return u.isActive
            ? { label: 'نشط', color: '#065f46', bg: '#d1fae5' }
            : { label: 'غير نشط', color: '#6b7280', bg: '#e5e7eb' };
    };

    return (
        <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h1 style={{ margin: 0 }}>📵 الأجهزة المحظورة</h1>
                    <p style={{ color: '#6b7280', margin: '4px 0 0' }}>إجمالي: {devices.length}</p>
                </div>
                <button onClick={fetch} className="refresh-btn">🔄 تحديث</button>
            </div>

            {loading ? (
                <p style={{ textAlign: 'center', padding: '40px' }}>جاري التحميل...</p>
            ) : devices.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', background: '#f9fafb', borderRadius: '12px' }}>
                    <div style={{ fontSize: '48px' }}>📱</div>
                    <p style={{ color: '#6b7280', marginTop: '12px' }}>لا توجد أجهزة محظورة</p>
                </div>
            ) : (
                <div className="table-container">
                    <table className="users-table">
                        <thead>
                            <tr>
                                <th>المستخدم الأصلي</th>
                                <th>بصمة الجهاز</th>
                                <th>نوع الجهاز</th>
                                <th>حسابات مرتبطة</th>
                                <th>السبب</th>
                                <th>تاريخ الحظر</th>
                                <th>بواسطة</th>
                                <th>الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            {devices.map((d) => (
                                <tr key={d._id}>
                                    <td>
                                        <div style={{ fontWeight: '600' }}>{d.originalUserName || '-'}</div>
                                        {d.originalUserId && onViewDetail && (
                                            <div
                                                style={{ fontSize: '10px', color: '#3b82f6', cursor: 'pointer', textDecoration: 'underline' }}
                                                onClick={() => onViewDetail(d.originalUserId)}
                                            >عرض الملف</div>
                                        )}
                                    </td>
                                    <td>
                                        {d.deviceFingerprint ? (
                                            <div
                                                title={d.deviceFingerprint}
                                                style={{
                                                    fontFamily: 'monospace', fontSize: '11px', color: '#7c3aed',
                                                    background: '#f5f3ff', padding: '4px 8px', borderRadius: '6px',
                                                    display: 'inline-block', maxWidth: '120px', overflow: 'hidden',
                                                    textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                                }}
                                            >
                                                🔒 {d.deviceFingerprint.substring(0, 12)}...
                                            </div>
                                        ) : (
                                            <span style={{ fontSize: '11px', color: '#9ca3af' }}>-</span>
                                        )}
                                    </td>
                                    <td style={{ fontSize: '13px' }}>
                                        {d.deviceInfo?.platform ? (
                                            <>
                                                <div>{d.deviceInfo.platform} {d.deviceInfo.osVersion}</div>
                                                <div style={{ fontSize: '11px', color: '#6b7280' }}>v{d.deviceInfo.appVersion || '-'}</div>
                                            </>
                                        ) : '-'}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        {d.linkedAccountsCount > 0 ? (
                                            <button
                                                onClick={() => handleShowLinked(d)}
                                                style={{
                                                    padding: '4px 10px', borderRadius: '12px', border: 'none',
                                                    background: d.linkedAccountsCount > 1 ? '#fee2e2' : '#e0e7ff',
                                                    color: d.linkedAccountsCount > 1 ? '#991b1b' : '#3730a3',
                                                    fontWeight: '700', fontSize: '12px', cursor: 'pointer'
                                                }}
                                                title="عرض الحسابات المرتبطة بنفس الجهاز"
                                            >
                                                👥 {d.linkedAccountsCount}
                                            </button>
                                        ) : (
                                            <span style={{ color: '#9ca3af' }}>—</span>
                                        )}
                                    </td>
                                    <td style={{ fontSize: '13px', maxWidth: '200px' }}>{d.reason}</td>
                                    <td style={{ fontSize: '12px' }}>{formatDateTimeLong(d.bannedAt)}</td>
                                    <td style={{ fontSize: '12px' }}>{d.bannedBy?.name || '-'}</td>
                                    <td>
                                        <button
                                            onClick={() => handleUnban(d)}
                                            className="action-btn btn-success"
                                            title="فك الحظر"
                                        >✅</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal: الحسابات المرتبطة */}
            {selectedDevice && (
                <div
                    onClick={() => setSelectedDevice(null)}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                        display: 'flex', justifyContent: 'center', alignItems: 'center',
                        zIndex: 1000, padding: '20px'
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: '#fff', borderRadius: '12px', padding: '20px',
                            maxWidth: '800px', width: '100%', maxHeight: '80vh', overflowY: 'auto'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                            <div>
                                <h3 style={{ margin: 0 }}>👥 الحسابات المرتبطة بهذا الجهاز</h3>
                                <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0' }}>
                                    البصمة: <code style={{ fontFamily: 'monospace', background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>
                                        {selectedDevice.deviceFingerprint || 'غير متوفر'}
                                    </code>
                                </p>
                            </div>
                            <button onClick={() => setSelectedDevice(null)} style={{
                                padding: '6px 12px', border: 'none', background: '#f3f4f6',
                                borderRadius: '8px', cursor: 'pointer', fontSize: '14px'
                            }}>✕</button>
                        </div>

                        {linkedLoading ? (
                            <p style={{ textAlign: 'center', padding: '30px' }}>جاري التحميل...</p>
                        ) : linkedAccounts.length === 0 ? (
                            <p style={{ textAlign: 'center', padding: '30px', color: '#6b7280' }}>
                                لا توجد حسابات مرتبطة حالياً
                            </p>
                        ) : (
                            <div style={{ display: 'grid', gap: '8px' }}>
                                {linkedAccounts.map((u) => {
                                    const st = getAccountStatus(u);
                                    return (
                                        <div key={u._id} style={{
                                            display: 'flex', gap: '12px', padding: '12px',
                                            border: '1px solid #e5e7eb', borderRadius: '8px',
                                            background: u._id === selectedDevice.originalUserId ? '#fef3c7' : '#fff'
                                        }}>
                                            <img
                                                src={u.profileImage ? getImageUrl(u.profileImage) : getDefaultAvatar(u.name)}
                                                alt="" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', cursor: 'pointer' }}
                                                onClick={() => { setSelectedDevice(null); onViewDetail && onViewDetail(u._id); }}
                                                onError={(e) => { e.target.onerror = null; e.target.src = getDefaultAvatar(u.name); }}
                                            />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    <span style={{ fontWeight: '700', cursor: 'pointer' }}
                                                        onClick={() => { setSelectedDevice(null); onViewDetail && onViewDetail(u._id); }}>
                                                        {u.name}
                                                    </span>
                                                    <span style={{
                                                        padding: '2px 8px', borderRadius: '10px',
                                                        background: st.bg, color: st.color, fontSize: '11px', fontWeight: '700'
                                                    }}>{st.label}</span>
                                                    {u._id === selectedDevice.originalUserId && (
                                                        <span style={{
                                                            padding: '2px 6px', borderRadius: '8px',
                                                            background: '#f59e0b', color: '#fff', fontSize: '10px', fontWeight: '700'
                                                        }}>⭐ الأصلي</span>
                                                    )}
                                                    {u.violationCount > 0 && (
                                                        <span style={{
                                                            padding: '2px 6px', borderRadius: '8px',
                                                            background: '#fee2e2', color: '#991b1b', fontSize: '11px', fontWeight: '700'
                                                        }}>⚠️ {u.violationCount}</span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                                                    {u.email} · سجّل في {formatDateTimeLong(u.createdAt)}
                                                </div>
                                                {u.suspendReason && (
                                                    <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '2px' }}>
                                                        سبب: {u.suspendReason}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div style={{ marginTop: '16px', padding: '10px', background: '#fef3c7', borderRadius: '8px', fontSize: '12px', color: '#92400e' }}>
                            💡 هذه الحسابات تشترك في نفس بصمة الجهاز أو الـ tokens. قد يكون مستخدم واحد يستخدم حسابات متعددة للتحايل على الحظر.
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default BannedDevices;
