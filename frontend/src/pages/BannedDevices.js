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
    const [view, setView] = useState('grid'); // grid | list
    const [banAllLoading, setBanAllLoading] = useState(null);
    const [unbanLoading, setUnbanLoading] = useState(null);
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
            (d.originalUserName || d.originalUser?.name || '').toLowerCase().includes(q) ||
            (d.originalUser?.email || '').toLowerCase().includes(q) ||
            (d.originalUser?.uniqueTag || '').toLowerCase().includes(q) ||
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
        const userId = device.originalUserId?._id || device.originalUserId;
        if (!userId) { toast.error('لا يمكن فك الحظر بدون معرف مستخدم'); return; }
        if (!window.confirm(`فك حظر جهاز "${device.originalUser?.name || device.originalUserName || 'مستخدم'}"؟`)) return;
        try {
            setUnbanLoading(device._id);
            await unbanUserDevice(userId);
            toast.success('تم فك الحظر');
            if (selectedDevice?._id === device._id) setSelectedDevice(null);
            fetch();
        } catch { toast.error('فشل فك الحظر'); }
        finally { setUnbanLoading(null); }
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

    const handleBanAllLinked = async (device, e) => {
        e?.stopPropagation();
        const count = device.activeLinkedCount || 0;
        if (count === 0) return;
        if (!window.confirm(`حظر ${count} حساب نشط على هذا الجهاز؟\n\nهذا سيُعطّلهم فوراً ويقطع جلساتهم.`)) return;
        try {
            setBanAllLoading(device._id);
            const res = await banActiveLinkedAccounts(device._id);
            if (res.success) {
                toast.success(`✅ ${res.message}`);
                fetch();
                if (selectedDevice?._id === device._id) handleShowLinked(device);
            }
        } catch { toast.error('فشل حظر الحسابات'); }
        finally { setBanAllLoading(null); }
    };

    const handleViewProfile = (device, e) => {
        e?.stopPropagation();
        const userId = device.originalUserId?._id || device.originalUserId;
        if (userId && onViewDetail) onViewDetail(userId);
    };

    const handleExportCSV = () => {
        const rows = [['الاسم', 'البريد', 'المعرّف', 'النظام', 'حسابات مرتبطة', 'حسابات نشطة', 'السبب', 'تاريخ الحظر']];
        filtered.forEach(d => {
            rows.push([
                d.originalUser?.name || d.originalUserName || '-',
                d.originalUser?.email || '-',
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

    const getDeviceIcon = (platform) => {
        const p = (platform || '').toLowerCase();
        if (p.includes('ios') || p.includes('iphone') || p.includes('apple')) return '📱';
        if (p.includes('android')) return '🤖';
        if (p.includes('web') || p.includes('mac') || p.includes('windows')) return '💻';
        return '📵';
    };

    const filterChip = (key, label, count) => {
        const active = filter === key;
        return (
            <button
                onClick={() => setFilter(key)}
                style={{
                    padding: '7px 14px', borderRadius: '20px',
                    border: active ? '2px solid #6366f1' : '1px solid #d1d5db',
                    background: active ? '#eef2ff' : '#fff',
                    color: active ? '#3730a3' : '#374151',
                    fontWeight: active ? '700' : '500', fontSize: '13px',
                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px'
                }}
            >
                {label}
                <span style={{
                    background: active ? '#6366f1' : '#e5e7eb',
                    color: active ? '#fff' : '#6b7280',
                    padding: '1px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700'
                }}>{count}</span>
            </button>
        );
    };

    const statCard = (label, value, bg, color, onClick) => (
        <div
            onClick={onClick}
            style={{
                padding: '14px 18px', background: bg, borderRadius: '12px', minWidth: '140px',
                cursor: onClick ? 'pointer' : 'default'
            }}
        >
            <div style={{ fontSize: '11px', color, opacity: 0.85, fontWeight: '600' }}>{label}</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color, marginTop: '4px' }}>{value}</div>
        </div>
    );

    // ════════ بطاقة الجهاز (grid card) ════════
    const renderDeviceCard = (d) => {
        const user = d.originalUser;
        const userName = user?.name || d.originalUserName || 'مستخدم محذوف';
        const userImg = user?.profileImage ? getImageUrl(user.profileImage) : getDefaultAvatar(userName);
        const hasBypass = (d.activeLinkedCount || 0) > 0;
        const platform = d.deviceInfo?.platform || '';
        const days = Math.floor((new Date() - new Date(d.bannedAt)) / (1000 * 60 * 60 * 24));

        return (
            <div
                key={d._id}
                onClick={() => handleShowLinked(d)}
                style={{
                    background: '#fff',
                    borderRadius: '14px',
                    border: hasBypass ? '1.5px solid #fca5a5' : '1px solid #e5e7eb',
                    boxShadow: hasBypass ? '0 4px 12px rgba(220,38,38,0.08)' : '0 2px 8px rgba(0,0,0,0.04)',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    flexDirection: 'column'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = hasBypass ? '0 4px 12px rgba(220,38,38,0.08)' : '0 2px 8px rgba(0,0,0,0.04)'; }}
            >
                {/* Header — ملوّن */}
                <div style={{
                    background: hasBypass
                        ? 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)'
                        : 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)',
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #e5e7eb'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ fontSize: '28px', lineHeight: 1 }}>{getDeviceIcon(platform)}</div>
                        <div>
                            <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827' }}>
                                {platform || 'جهاز غير معروف'}
                            </div>
                            <div style={{ fontSize: '11px', color: '#6b7280' }}>
                                {d.deviceInfo?.osVersion ? `iOS ${d.deviceInfo.osVersion}` : ''}
                                {d.deviceInfo?.appVersion ? ` · v${d.deviceInfo.appVersion}` : ''}
                            </div>
                        </div>
                    </div>
                    {hasBypass && (
                        <span style={{
                            background: '#dc2626', color: '#fff',
                            padding: '4px 10px', borderRadius: '12px',
                            fontSize: '11px', fontWeight: '700'
                        }}>🚨 تهرّب</span>
                    )}
                </div>

                {/* بيانات المستخدم */}
                <div style={{ padding: '16px', display: 'flex', gap: '12px', alignItems: 'center', borderBottom: '1px solid #f3f4f6' }}>
                    <img
                        src={userImg}
                        alt=""
                        onClick={(e) => handleViewProfile(d, e)}
                        style={{
                            width: '52px', height: '52px', borderRadius: '50%',
                            objectFit: 'cover', cursor: 'pointer',
                            border: '2px solid #e5e7eb', flexShrink: 0
                        }}
                        onError={(e) => { e.target.onerror = null; e.target.src = getDefaultAvatar(userName); }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                            onClick={(e) => handleViewProfile(d, e)}
                            style={{
                                fontWeight: '700', fontSize: '14px', color: '#111827',
                                cursor: 'pointer', overflow: 'hidden',
                                textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                            }}
                            title={userName}
                        >{userName}</div>
                        {user?.uniqueTag && (
                            <div style={{ fontSize: '11px', color: '#6366f1', fontWeight: '600' }}>@{user.uniqueTag}</div>
                        )}
                        {user?.email && (
                            <div style={{
                                fontSize: '11px', color: '#6b7280', marginTop: '2px',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                            }} title={user.email}>{user.email}</div>
                        )}
                    </div>
                </div>

                {/* أرقام الحسابات */}
                <div style={{
                    padding: '12px 16px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                    borderBottom: '1px solid #f3f4f6'
                }}>
                    <div style={{ background: '#f3f4f6', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '20px', fontWeight: '800', color: '#111827' }}>
                            👥 {d.linkedAccountsCount || 0}
                        </div>
                        <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>حساب مرتبط</div>
                    </div>
                    <div style={{
                        background: hasBypass ? '#fee2e2' : '#d1fae5',
                        padding: '10px', borderRadius: '8px', textAlign: 'center'
                    }}>
                        <div style={{
                            fontSize: '20px', fontWeight: '800',
                            color: hasBypass ? '#991b1b' : '#065f46'
                        }}>
                            {hasBypass ? '🚨' : '✅'} {d.activeLinkedCount || 0}
                        </div>
                        <div style={{
                            fontSize: '10px',
                            color: hasBypass ? '#991b1b' : '#065f46',
                            marginTop: '2px', fontWeight: '600'
                        }}>{hasBypass ? 'يتخطّى الحظر' : 'لا تهرّب'}</div>
                    </div>
                </div>

                {/* السبب + تاريخ */}
                <div style={{ padding: '12px 16px', flex: 1 }}>
                    <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: '600' }}>السبب</div>
                    <div style={{
                        fontSize: '13px', color: '#374151', marginTop: '4px',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                    }} title={d.reason}>{d.reason || '—'}</div>

                    <div style={{ display: 'flex', gap: '12px', marginTop: '10px', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '11px', color: '#6b7280' }}>
                            🗓️ {days === 0 ? 'اليوم' : days === 1 ? 'البارحة' : `${days} يوم`}
                        </div>
                        {d.persistentDeviceId && (
                            <div
                                style={{ fontSize: '10px', color: '#1e40af', fontFamily: 'monospace', cursor: 'help' }}
                                title={`Keychain ID:\n${d.persistentDeviceId}`}
                            >🔑 {d.persistentDeviceId.substring(0, 8)}…</div>
                        )}
                    </div>
                </div>

                {/* Actions footer */}
                <div style={{
                    padding: '10px 12px',
                    background: '#f9fafb',
                    borderTop: '1px solid #f3f4f6',
                    display: 'flex',
                    gap: '6px',
                    flexWrap: 'wrap'
                }}>
                    <button
                        onClick={(e) => { e.stopPropagation(); handleShowLinked(d); }}
                        style={{
                            flex: 1, padding: '8px 10px', borderRadius: '8px',
                            border: 'none', background: '#e0e7ff', color: '#3730a3',
                            fontWeight: '700', fontSize: '12px', cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                        }}
                    >👁️ عرض الحسابات</button>

                    {hasBypass && (
                        <button
                            onClick={(e) => handleBanAllLinked(d, e)}
                            disabled={banAllLoading === d._id}
                            style={{
                                flex: 1, padding: '8px 10px', borderRadius: '8px',
                                border: 'none', background: '#dc2626', color: '#fff',
                                fontWeight: '700', fontSize: '12px',
                                cursor: banAllLoading === d._id ? 'wait' : 'pointer',
                                opacity: banAllLoading === d._id ? 0.6 : 1,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                            }}
                        >
                            {banAllLoading === d._id ? '⏳' : '🔒'} حظر {d.activeLinkedCount}
                        </button>
                    )}

                    <button
                        onClick={(e) => { e.stopPropagation(); handleUnban(d); }}
                        disabled={unbanLoading === d._id}
                        style={{
                            padding: '8px 12px', borderRadius: '8px',
                            border: '1px solid #d1fae5', background: '#fff', color: '#065f46',
                            fontWeight: '700', fontSize: '12px',
                            cursor: unbanLoading === d._id ? 'wait' : 'pointer',
                            opacity: unbanLoading === d._id ? 0.6 : 1
                        }}
                        title="فك الحظر"
                    >{unbanLoading === d._id ? '⏳' : '✅'}</button>
                </div>
            </div>
        );
    };

    // ════════ صف القائمة (list view) ════════
    const renderDeviceRow = (d) => {
        const user = d.originalUser;
        const userName = user?.name || d.originalUserName || 'مستخدم محذوف';
        const userImg = user?.profileImage ? getImageUrl(user.profileImage) : getDefaultAvatar(userName);
        const hasBypass = (d.activeLinkedCount || 0) > 0;

        return (
            <div
                key={d._id}
                onClick={() => handleShowLinked(d)}
                style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 14px', background: '#fff',
                    borderRadius: '10px',
                    border: hasBypass ? '1.5px solid #fca5a5' : '1px solid #e5e7eb',
                    cursor: 'pointer',
                    transition: 'background 0.15s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
            >
                <div style={{ fontSize: '26px' }}>{getDeviceIcon(d.deviceInfo?.platform)}</div>
                <img
                    src={userImg} alt=""
                    onClick={(e) => handleViewProfile(d, e)}
                    style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', cursor: 'pointer', flexShrink: 0 }}
                    onError={(e) => { e.target.onerror = null; e.target.src = getDefaultAvatar(userName); }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: '700', fontSize: '14px' }}>{userName}</span>
                        {user?.uniqueTag && (
                            <span style={{ fontSize: '11px', color: '#6366f1', fontWeight: '600' }}>@{user.uniqueTag}</span>
                        )}
                        {hasBypass && (
                            <span style={{
                                background: '#dc2626', color: '#fff',
                                padding: '2px 8px', borderRadius: '10px',
                                fontSize: '10px', fontWeight: '700'
                            }}>🚨 {d.activeLinkedCount} يتخطّى</span>
                        )}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                        {user?.email || '—'} · 👥 {d.linkedAccountsCount || 0} حساب · {formatDateTimeLong(d.bannedAt)}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    {hasBypass && (
                        <button
                            onClick={(e) => handleBanAllLinked(d, e)}
                            disabled={banAllLoading === d._id}
                            style={{
                                padding: '6px 10px', borderRadius: '6px', border: 'none',
                                background: '#dc2626', color: '#fff', fontWeight: '700', fontSize: '11px',
                                cursor: banAllLoading === d._id ? 'wait' : 'pointer'
                            }}
                        >🔒 حظر {d.activeLinkedCount}</button>
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); handleUnban(d); }}
                        style={{
                            padding: '6px 10px', borderRadius: '6px', border: '1px solid #d1fae5',
                            background: '#fff', color: '#065f46', fontWeight: '700', fontSize: '11px', cursor: 'pointer'
                        }}
                    >✅</button>
                </div>
            </div>
        );
    };

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
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {/* Toggle View */}
                    <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: '8px', padding: '3px' }}>
                        <button
                            onClick={() => setView('grid')}
                            style={{
                                padding: '6px 12px', border: 'none',
                                background: view === 'grid' ? '#fff' : 'transparent',
                                color: view === 'grid' ? '#3730a3' : '#6b7280',
                                fontWeight: '700', fontSize: '12px', borderRadius: '6px', cursor: 'pointer',
                                boxShadow: view === 'grid' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                            }}
                            title="عرض شبكي"
                        >▦ شبكة</button>
                        <button
                            onClick={() => setView('list')}
                            style={{
                                padding: '6px 12px', border: 'none',
                                background: view === 'list' ? '#fff' : 'transparent',
                                color: view === 'list' ? '#3730a3' : '#6b7280',
                                fontWeight: '700', fontSize: '12px', borderRadius: '6px', cursor: 'pointer',
                                boxShadow: view === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                            }}
                            title="عرض قائمة"
                        >☰ قائمة</button>
                    </div>
                    {filtered.length > 0 && (
                        <button
                            onClick={handleExportCSV}
                            style={{
                                padding: '8px 14px', borderRadius: '8px', border: '1px solid #d1d5db',
                                background: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600'
                            }}
                            title="تصدير CSV"
                        >📊 CSV</button>
                    )}
                    <button onClick={fetch} className="refresh-btn">🔄</button>
                </div>
            </div>

            {/* تنبيه التهرب */}
            {stats.bypassing > 0 && filter !== 'bypass' && (
                <div style={{
                    background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                    border: '1.5px solid #fca5a5', borderRadius: '12px',
                    padding: '14px 18px', marginBottom: '16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap'
                }}>
                    <div>
                        <div style={{ fontSize: '15px', fontWeight: '700', color: '#991b1b' }}>
                            🚨 {stats.bypassing} حساب نشط على {stats.bypassDevices} جهاز محظور
                        </div>
                        <div style={{ fontSize: '12px', color: '#7f1d1d', marginTop: '4px' }}>
                            هؤلاء يستخدمون التطبيق رغم حظر جهازهم — استخدم زر "🔒 حظر" لكل بطاقة
                        </div>
                    </div>
                    <button
                        onClick={() => setFilter('bypass')}
                        style={{
                            background: '#dc2626', color: '#fff', padding: '8px 16px', border: 'none',
                            borderRadius: '8px', fontWeight: '700', fontSize: '13px', cursor: 'pointer'
                        }}
                    >👁️ عرض هذه فقط</button>
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

            {/* فلاتر */}
            {devices.length > 0 && (
                <>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                        {filterChip('all', '🌐 الكل', devices.length)}
                        {filterChip('bypass', '🚨 التهرّب', stats.bypassDevices)}
                        {filterChip('recent', '🆕 آخر 7 أيام', stats.last7d)}
                    </div>
                    <input
                        type="text"
                        placeholder="🔍 ابحث بالاسم، البريد، المعرّف، أو السبب..."
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
            ) : view === 'grid' ? (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: '16px'
                }}>
                    {filtered.map(renderDeviceCard)}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {filtered.map(renderDeviceRow)}
                </div>
            )}

            {/* Modal: تفاصيل + الحسابات المرتبطة */}
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
                            background: '#fff', borderRadius: '14px',
                            maxWidth: '800px', width: '100%', maxHeight: '90vh',
                            overflowY: 'auto', display: 'flex', flexDirection: 'column'
                        }}
                    >
                        {/* Header الـ Modal */}
                        <div style={{
                            padding: '18px 20px',
                            background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)',
                            borderBottom: '1px solid #e5e7eb',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            position: 'sticky', top: 0, zIndex: 1
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ fontSize: '32px' }}>{getDeviceIcon(selectedDevice.deviceInfo?.platform)}</div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '17px' }}>تفاصيل الجهاز المحظور</h3>
                                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                                        {selectedDevice.deviceInfo?.platform || 'غير معروف'}
                                        {selectedDevice.deviceInfo?.osVersion ? ` · iOS ${selectedDevice.deviceInfo.osVersion}` : ''}
                                        {selectedDevice.deviceInfo?.appVersion ? ` · v${selectedDevice.deviceInfo.appVersion}` : ''}
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setSelectedDevice(null)} style={{
                                padding: '6px 12px', border: 'none', background: '#fff',
                                borderRadius: '8px', cursor: 'pointer', fontSize: '14px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                            }}>✕</button>
                        </div>

                        <div style={{ padding: '20px' }}>
                            {/* بيانات المستخدم الأصلي */}
                            {selectedDevice.originalUser && (
                                <div style={{
                                    display: 'flex', gap: '14px', alignItems: 'center',
                                    padding: '14px', background: '#fef3c7',
                                    borderRadius: '10px', marginBottom: '16px',
                                    border: '1px solid #fde68a'
                                }}>
                                    <img
                                        src={selectedDevice.originalUser.profileImage ? getImageUrl(selectedDevice.originalUser.profileImage) : getDefaultAvatar(selectedDevice.originalUser.name)}
                                        alt=""
                                        style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', cursor: 'pointer', flexShrink: 0 }}
                                        onClick={(e) => { setSelectedDevice(null); onViewDetail && onViewDetail(selectedDevice.originalUser._id); }}
                                        onError={(e) => { e.target.onerror = null; e.target.src = getDefaultAvatar(selectedDevice.originalUser.name); }}
                                    />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: '700', fontSize: '15px' }}>{selectedDevice.originalUser.name}</span>
                                            <span style={{ background: '#f59e0b', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '700' }}>⭐ الأصلي</span>
                                            {selectedDevice.originalUser.uniqueTag && (
                                                <span style={{ fontSize: '11px', color: '#6366f1', fontWeight: '600' }}>@{selectedDevice.originalUser.uniqueTag}</span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>{selectedDevice.originalUser.email}</div>
                                    </div>
                                    <button
                                        onClick={() => { setSelectedDevice(null); onViewDetail && onViewDetail(selectedDevice.originalUser._id); }}
                                        style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #f59e0b', background: '#fff', color: '#92400e', fontWeight: '700', fontSize: '12px', cursor: 'pointer' }}
                                    >👁️ الملف</button>
                                </div>
                            )}

                            {/* معلومات الحظر */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                gap: '10px', marginBottom: '16px'
                            }}>
                                <div style={{ padding: '10px 12px', background: '#f9fafb', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: '600' }}>السبب</div>
                                    <div style={{ fontSize: '13px', marginTop: '2px' }}>{selectedDevice.reason || '—'}</div>
                                </div>
                                <div style={{ padding: '10px 12px', background: '#f9fafb', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: '600' }}>تاريخ الحظر</div>
                                    <div style={{ fontSize: '13px', marginTop: '2px' }}>{formatDateTimeLong(selectedDevice.bannedAt)}</div>
                                </div>
                                <div style={{ padding: '10px 12px', background: '#f9fafb', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: '600' }}>بواسطة</div>
                                    <div style={{ fontSize: '13px', marginTop: '2px' }}>{selectedDevice.bannedBy?.name || 'النظام'}</div>
                                </div>
                                {selectedDevice.persistentDeviceId && (
                                    <div style={{ padding: '10px 12px', background: '#dbeafe', borderRadius: '8px' }}>
                                        <div style={{ fontSize: '11px', color: '#1e40af', fontWeight: '600' }}>🔑 Keychain ID</div>
                                        <div style={{ fontSize: '11px', marginTop: '2px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                            {selectedDevice.persistentDeviceId}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* زر "حظر كل النشطين" بارز */}
                            {(selectedDevice.activeLinkedCount || 0) > 0 && (
                                <div style={{
                                    background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '10px',
                                    padding: '14px 16px', marginBottom: '16px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap'
                                }}>
                                    <div style={{ fontSize: '13px', color: '#7f1d1d', fontWeight: '700' }}>
                                        🚨 {selectedDevice.activeLinkedCount} حساب يتخطّى الحظر
                                    </div>
                                    <button
                                        onClick={() => handleBanAllLinked(selectedDevice)}
                                        disabled={banAllLoading === selectedDevice._id}
                                        style={{
                                            background: '#dc2626', color: '#fff', padding: '9px 18px', border: 'none',
                                            borderRadius: '8px', fontWeight: '700', fontSize: '13px', cursor: 'pointer'
                                        }}
                                    >🔒 حظر الكل ({selectedDevice.activeLinkedCount})</button>
                                </div>
                            )}

                            {/* الحسابات المرتبطة */}
                            <div style={{ marginBottom: '8px' }}>
                                <h4 style={{ margin: 0, fontSize: '14px', color: '#111827' }}>
                                    👥 جميع الحسابات على هذا الجهاز ({linkedAccounts.length})
                                </h4>
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
                                        const isBypass = u.isActive && !u.deviceBanned;
                                        const isOriginal = u._id === (selectedDevice.originalUser?._id || selectedDevice.originalUserId);
                                        return (
                                            <div key={u._id} style={{
                                                display: 'flex', gap: '12px', padding: '12px',
                                                border: isBypass ? '1.5px solid #fca5a5' : '1px solid #e5e7eb',
                                                borderRadius: '10px',
                                                background: isOriginal ? '#fef3c7' : (isBypass ? '#fff5f5' : '#fff')
                                            }}>
                                                <img
                                                    src={u.profileImage ? getImageUrl(u.profileImage) : getDefaultAvatar(u.name)}
                                                    alt=""
                                                    style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover', cursor: 'pointer', flexShrink: 0 }}
                                                    onClick={() => { setSelectedDevice(null); onViewDetail && onViewDetail(u._id); }}
                                                    onError={(e) => { e.target.onerror = null; e.target.src = getDefaultAvatar(u.name); }}
                                                />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                        <span style={{ fontWeight: '700', cursor: 'pointer' }}
                                                            onClick={() => { setSelectedDevice(null); onViewDetail && onViewDetail(u._id); }}>
                                                            {u.name}
                                                        </span>
                                                        {u.uniqueTag && (
                                                            <span style={{ fontSize: '11px', color: '#6366f1', fontWeight: '600' }}>@{u.uniqueTag}</span>
                                                        )}
                                                        <span style={{
                                                            padding: '2px 8px', borderRadius: '10px',
                                                            background: st.bg, color: st.color, fontSize: '11px', fontWeight: '700'
                                                        }}>{st.label}</span>
                                                        {isOriginal && (
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
                                                        {u.email} · {formatDateTimeLong(u.createdAt)}
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
                                💡 الحسابات بخلفية حمراء لم تُحظر بعد رغم اشتراكها في نفس الجهاز.
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default BannedDevices;
