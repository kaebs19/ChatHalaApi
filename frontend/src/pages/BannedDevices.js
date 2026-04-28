import React, { useState, useEffect } from 'react';
import { getBannedDevices, unbanUserDevice, getDeviceLinkedAccounts, banActiveLinkedAccounts } from '../services/api';
import { useToast } from '../components/Toast';
import { getImageUrl, getDefaultAvatar } from '../config';
import { formatDateTimeLong } from '../utils/formatters';

function BannedDevices({ onViewDetail }) {
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [linkedAccounts, setLinkedAccounts] = useState([]);
    const [linkedLoading, setLinkedLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all'); // all | bypass | recent
    const [banAllLoading, setBanAllLoading] = useState(null);
    const toast = useToast();

    // إحصائيات
    const stats = React.useMemo(() => ({
        total: devices.length,
        withPersistentId: devices.filter(d => d.persistentDeviceId).length,
        bypassing: devices.reduce((sum, d) => sum + (d.activeLinkedCount || 0), 0),
        bypassDevices: devices.filter(d => (d.activeLinkedCount || 0) > 0).length,
        last7d: devices.filter(d => {
            const days = (new Date() - new Date(d.bannedAt)) / (1000 * 60 * 60 * 24);
            return days <= 7;
        }).length
    }), [devices]);

    // فلترة + بحث
    const filtered = React.useMemo(() => {
        let list = devices;
        if (filter === 'bypass') list = list.filter(d => (d.activeLinkedCount || 0) > 0);
        else if (filter === 'recent') {
            list = list.filter(d => {
                const days = (new Date() - new Date(d.bannedAt)) / (1000 * 60 * 60 * 24);
                return days <= 7;
            });
        }
        if (!search.trim()) return list;
        const q = search.toLowerCase();
        return list.filter(d =>
            (d.originalUserName || '').toLowerCase().includes(q) ||
            (d.reason || '').toLowerCase().includes(q) ||
            (d.persistentDeviceId || '').toLowerCase().includes(q) ||
            (d.deviceFingerprint || '').toLowerCase().includes(q)
        );
    }, [devices, search, filter]);

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
        if (!window.confirm(`فك حظر جهاز "${device.originalUserName || 'مستخدم'}"؟`)) return;
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

    const handleBanAllLinked = async (device) => {
        const count = device.activeLinkedCount || 0;
        if (count === 0) return;
        if (!window.confirm(`حظر ${count} حساب نشط على هذا الجهاز؟\n\nهذا سيُعطّلهم فوراً ويقطع جلساتهم.`)) return;
        try {
            setBanAllLoading(device._id);
            const res = await banActiveLinkedAccounts(device._id);
            if (res.success) {
                toast.success(`✅ ${res.message}`);
                fetch();
                if (selectedDevice?._id === device._id) {
                    handleShowLinked(device); // إعادة تحميل القائمة
                }
            }
        } catch { toast.error('فشل حظر الحسابات'); }
        finally { setBanAllLoading(null); }
    };

    const handleExportCSV = () => {
        const rows = [['الاسم', 'البريد', 'المعرّف', 'النظام', 'حسابات مرتبطة', 'حسابات نشطة', 'السبب', 'تاريخ الحظر']];
        filtered.forEach(d => {
            rows.push([
                d.originalUserName || '-',
                d.originalUserId || '-',
                d.persistentDeviceId || d.deviceFingerprint || '-',
                d.deviceInfo?.platform ? `${d.deviceInfo.platform} ${d.deviceInfo.osVersion || ''}` : '-',
                d.linkedAccountsCount || 0,
                d.activeLinkedCount || 0,
                (d.reason || '').replace(/[\n,]/g, ' '),
                d.bannedAt ? new Date(d.bannedAt).toLocaleString('ar-SA') : '-'
            ]);
        });
        const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `banned-devices-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
    };

    const getAccountStatus = (u) => {
        if (u.deviceBanned) return { label: '📵 جهاز محظور', color: '#111827', bg: '#fca5a5' };
        if (u.suspendedUntil) {
            const days = (new Date(u.suspendedUntil) - new Date()) / (1000 * 60 * 60 * 24);
            if (days > 365) return { label: '🚫 محظور نهائياً', color: '#991b1b', bg: '#fecaca' };
            if (days > 0) return { label: '⏸️ معلّق', color: '#92400e', bg: '#fef3c7' };
        }
        return u.isActive
            ? { label: '🚨 نشط (يتخطّى!)', color: '#991b1b', bg: '#fecaca' }
            : { label: 'غير نشط', color: '#6b7280', bg: '#e5e7eb' };
    };

    const statCard = (label, value, bg, color, onClick) => (
        <div
            onClick={onClick}
            style={{
                padding: '14px 18px', background: bg, borderRadius: '12px', minWidth: '140px',
                cursor: onClick ? 'pointer' : 'default',
                transition: 'transform 0.15s',
                ...(onClick ? { ':hover': { transform: 'translateY(-2px)' } } : {})
            }}
        >
            <div style={{ fontSize: '11px', color, opacity: 0.85, fontWeight: '600' }}>{label}</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color, marginTop: '4px' }}>{value}</div>
        </div>
    );

    const filterChip = (key, label, active, count) => (
        <button
            onClick={() => setFilter(key)}
            style={{
                padding: '6px 14px', borderRadius: '20px',
                border: active ? '2px solid #6366f1' : '1px solid #d1d5db',
                background: active ? '#eef2ff' : '#fff',
                color: active ? '#3730a3' : '#374151',
                fontWeight: active ? '700' : '500', fontSize: '13px',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
            }}
        >
            {label}
            {count !== undefined && (
                <span style={{
                    background: active ? '#6366f1' : '#e5e7eb',
                    color: active ? '#fff' : '#6b7280',
                    padding: '1px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700'
                }}>{count}</span>
            )}
        </button>
    );

    return (
        <div style={{ padding: '20px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ margin: 0 }}>📵 الأجهزة المحظورة</h1>
                    <p style={{ color: '#6b7280', margin: '4px 0 0', fontSize: '13px' }}>
                        إجمالي: <strong>{devices.length}</strong> جهاز
                        {stats.bypassing > 0 && (
                            <> · <span style={{ color: '#dc2626', fontWeight: '700' }}>🚨 {stats.bypassing} حساب يتخطّى الحظر</span></>
                        )}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {filtered.length > 0 && (
                        <button
                            onClick={handleExportCSV}
                            style={{
                                padding: '8px 14px', borderRadius: '8px', border: '1px solid #d1d5db',
                                background: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600'
                            }}
                            title="تصدير القائمة كملف CSV"
                        >📊 تصدير CSV</button>
                    )}
                    <button onClick={fetch} className="refresh-btn">🔄 تحديث</button>
                </div>
            </div>

            {/* تنبيه التهرب — يظهر فقط إذا فيه حسابات تتخطّى */}
            {stats.bypassing > 0 && (
                <div style={{
                    background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                    border: '1.5px solid #fca5a5', borderRadius: '12px',
                    padding: '14px 18px', marginBottom: '16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap'
                }}>
                    <div>
                        <div style={{ fontSize: '15px', fontWeight: '700', color: '#991b1b' }}>
                            🚨 تنبيه: {stats.bypassing} حساب نشط على {stats.bypassDevices} جهاز محظور
                        </div>
                        <div style={{ fontSize: '12px', color: '#7f1d1d', marginTop: '4px' }}>
                            هؤلاء المستخدمون يستخدمون أجهزة محظورة بحسابات أخرى — استخدم زر "🔒 حظر الكل" لكل جهاز.
                        </div>
                    </div>
                    <button
                        onClick={() => setFilter('bypass')}
                        style={{
                            background: '#dc2626', color: '#fff', padding: '8px 16px', border: 'none',
                            borderRadius: '8px', fontWeight: '700', fontSize: '13px', cursor: 'pointer'
                        }}
                    >👁️ عرض هذه الأجهزة فقط</button>
                </div>
            )}

            {/* شريط إحصائيات */}
            {devices.length > 0 && (
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    {statCard('📦 الإجمالي', stats.total, '#f3f4f6', '#111827')}
                    {statCard('🔑 بمعرّف Keychain', stats.withPersistentId, '#dbeafe', '#1e40af')}
                    {statCard('🚨 حسابات تتخطّى', stats.bypassing, '#fee2e2', '#991b1b', () => setFilter('bypass'))}
                    {statCard('🆕 آخر 7 أيام', stats.last7d, '#fef3c7', '#92400e', () => setFilter('recent'))}
                </div>
            )}

            {/* فلاتر + بحث */}
            {devices.length > 0 && (
                <>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                        {filterChip('all', '🌐 الكل', filter === 'all', devices.length)}
                        {filterChip('bypass', '🚨 التهرّب', filter === 'bypass', stats.bypassDevices)}
                        {filterChip('recent', '🆕 آخر 7 أيام', filter === 'recent', stats.last7d)}
                    </div>
                    <input
                        type="text"
                        placeholder="🔍 ابحث بالاسم، السبب، أو معرّف الجهاز..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{
                            width: '100%', padding: '10px 14px', borderRadius: '8px',
                            border: '1px solid #d1d5db', marginBottom: '16px', fontSize: '14px',
                            boxSizing: 'border-box'
                        }}
                    />
                </>
            )}

            {loading ? (
                <p style={{ textAlign: 'center', padding: '40px' }}>جاري التحميل...</p>
            ) : devices.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', background: '#f9fafb', borderRadius: '12px' }}>
                    <div style={{ fontSize: '48px' }}>📱</div>
                    <p style={{ color: '#6b7280', marginTop: '12px' }}>لا توجد أجهزة محظورة</p>
                </div>
            ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', background: '#f9fafb', borderRadius: '12px' }}>
                    <p style={{ color: '#6b7280' }}>لا توجد نتائج تطابق الفلتر</p>
                </div>
            ) : (
                <div className="table-container">
                    <table className="users-table">
                        <thead>
                            <tr>
                                <th>المستخدم الأصلي</th>
                                <th>معرّف الجهاز</th>
                                <th>نوع الجهاز</th>
                                <th>حسابات</th>
                                <th>السبب</th>
                                <th>تاريخ الحظر</th>
                                <th>الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((d) => {
                                const hasBypass = (d.activeLinkedCount || 0) > 0;
                                return (
                                    <tr key={d._id} style={hasBypass ? { background: '#fffbeb' } : {}}>
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
                                            {d.persistentDeviceId ? (
                                                <div
                                                    title={`Keychain ID (الأدق)\n${d.persistentDeviceId}`}
                                                    style={{
                                                        fontFamily: 'monospace', fontSize: '11px', color: '#1e40af',
                                                        background: '#dbeafe', padding: '4px 8px', borderRadius: '6px',
                                                        display: 'inline-block', maxWidth: '120px', overflow: 'hidden',
                                                        textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'help'
                                                    }}
                                                >
                                                    🔑 {d.persistentDeviceId.substring(0, 8)}...
                                                </div>
                                            ) : d.deviceFingerprint ? (
                                                <div
                                                    title={`Fingerprint (fallback)\n${d.deviceFingerprint}`}
                                                    style={{
                                                        fontFamily: 'monospace', fontSize: '11px', color: '#7c3aed',
                                                        background: '#f5f3ff', padding: '4px 8px', borderRadius: '6px',
                                                        display: 'inline-block', maxWidth: '120px', overflow: 'hidden',
                                                        textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'help'
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
                                                <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                                                    <button
                                                        onClick={() => handleShowLinked(d)}
                                                        style={{
                                                            padding: '4px 12px', borderRadius: '12px', border: 'none',
                                                            background: hasBypass ? '#fecaca' : '#e0e7ff',
                                                            color: hasBypass ? '#991b1b' : '#3730a3',
                                                            fontWeight: '700', fontSize: '12px', cursor: 'pointer'
                                                        }}
                                                        title="عرض الحسابات المرتبطة"
                                                    >
                                                        👥 {d.linkedAccountsCount}
                                                    </button>
                                                    {hasBypass && (
                                                        <span style={{
                                                            fontSize: '10px', fontWeight: '700', color: '#dc2626',
                                                            background: '#fee2e2', padding: '2px 6px', borderRadius: '10px'
                                                        }}>
                                                            🚨 {d.activeLinkedCount} نشط
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span style={{ color: '#9ca3af' }}>—</span>
                                            )}
                                        </td>
                                        <td style={{ fontSize: '13px', maxWidth: '200px' }}>{d.reason}</td>
                                        <td style={{ fontSize: '12px' }}>{formatDateTimeLong(d.bannedAt)}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                {hasBypass && (
                                                    <button
                                                        onClick={() => handleBanAllLinked(d)}
                                                        disabled={banAllLoading === d._id}
                                                        style={{
                                                            padding: '5px 10px', borderRadius: '6px', border: 'none',
                                                            background: '#dc2626', color: '#fff', fontWeight: '700', fontSize: '11px',
                                                            cursor: banAllLoading === d._id ? 'wait' : 'pointer',
                                                            opacity: banAllLoading === d._id ? 0.6 : 1
                                                        }}
                                                        title={`حظر ${d.activeLinkedCount} حساب نشط على هذا الجهاز`}
                                                    >
                                                        {banAllLoading === d._id ? '⏳' : '🔒'} حظر {d.activeLinkedCount}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleUnban(d)}
                                                    className="action-btn btn-success"
                                                    title="فك الحظر"
                                                >✅</button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
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
                            maxWidth: '800px', width: '100%', maxHeight: '85vh', overflowY: 'auto'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <h3 style={{ margin: 0 }}>👥 الحسابات المرتبطة بهذا الجهاز</h3>
                                {selectedDevice.persistentDeviceId && (
                                    <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0' }}>
                                        🔑 معرّف Keychain: <code style={{ fontFamily: 'monospace', background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>
                                            {selectedDevice.persistentDeviceId}
                                        </code>
                                    </p>
                                )}
                            </div>
                            <button onClick={() => setSelectedDevice(null)} style={{
                                padding: '6px 12px', border: 'none', background: '#f3f4f6',
                                borderRadius: '8px', cursor: 'pointer', fontSize: '14px'
                            }}>✕</button>
                        </div>

                        {/* زر "حظر كل النشطين" بارز إذا وُجد */}
                        {(selectedDevice.activeLinkedCount || 0) > 0 && (
                            <div style={{
                                background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '10px',
                                padding: '12px 14px', marginBottom: '14px',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap'
                            }}>
                                <div style={{ fontSize: '13px', color: '#7f1d1d', fontWeight: '600' }}>
                                    🚨 {selectedDevice.activeLinkedCount} حساب نشط يستخدم هذا الجهاز
                                </div>
                                <button
                                    onClick={() => handleBanAllLinked(selectedDevice)}
                                    disabled={banAllLoading === selectedDevice._id}
                                    style={{
                                        background: '#dc2626', color: '#fff', padding: '8px 16px', border: 'none',
                                        borderRadius: '8px', fontWeight: '700', fontSize: '13px', cursor: 'pointer'
                                    }}
                                >🔒 حظر الكل ({selectedDevice.activeLinkedCount})</button>
                            </div>
                        )}

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
                                    const isBypass = u.isActive && !u.deviceBanned;
                                    return (
                                        <div key={u._id} style={{
                                            display: 'flex', gap: '12px', padding: '12px',
                                            border: isBypass ? '1.5px solid #fca5a5' : '1px solid #e5e7eb',
                                            borderRadius: '8px',
                                            background: u._id === selectedDevice.originalUserId ? '#fef3c7' : (isBypass ? '#fff5f5' : '#fff')
                                        }}>
                                            <img
                                                src={u.profileImage ? getImageUrl(u.profileImage) : getDefaultAvatar(u.name)}
                                                alt="" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', cursor: 'pointer', flexShrink: 0 }}
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
                            💡 الحسابات بخلفية حمراء (🚨 نشط) لم تُحظر بعد رغم اشتراكها في نفس الجهاز — استخدم زر "حظر الكل" لإيقافها.
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default BannedDevices;
