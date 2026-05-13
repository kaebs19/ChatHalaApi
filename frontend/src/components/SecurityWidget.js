import React, { useState, useEffect } from 'react';
import { getBannedDevices, getBannedIPs, getAdminActivity } from '../services/api';

// Widget أمني في Dashboard: إحصائيات سريعة + آخر عمليات الأدمن
function SecurityWidget({ onNavigate }) {
    const [data, setData] = useState({
        bannedDevices: 0,
        bannedIPs: 0,
        last24h: 0,
        recent: []
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const [devs, ips, logs] = await Promise.all([
                    getBannedDevices().catch(() => ({ data: [] })),
                    getBannedIPs().catch(() => ({ data: [] })),
                    getAdminActivity({ limit: 5 }).catch(() => ({ data: { logs: [], stats24h: [] } }))
                ]);
                const stats24h = logs.data?.stats24h || [];
                const total24h = stats24h.reduce((s, e) => s + e.count, 0);
                setData({
                    bannedDevices: (devs.data || []).length,
                    bannedIPs: (ips.data || []).length,
                    last24h: total24h,
                    recent: logs.data?.logs || []
                });
            } catch {}
            finally { setLoading(false); }
        })();
    }, []);

    const card = (label, value, icon, color, page) => (
        <div
            onClick={() => page && onNavigate?.(page)}
            style={{
                flex: 1, minWidth: '140px', padding: '14px', borderRadius: '10px',
                background: `${color}15`, border: `1px solid ${color}40`,
                cursor: page ? 'pointer' : 'default', transition: 'transform 0.15s'
            }}
            onMouseOver={(e) => { if (page) e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseOut={(e) => { if (page) e.currentTarget.style.transform = 'translateY(0)'; }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontSize: '20px' }}>{icon}</span>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>{label}</span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: '800', color }}>{value}</div>
        </div>
    );

    if (loading) return null;

    return (
        <div style={{
            background: 'white', padding: '16px', borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)', marginBottom: '1.5rem'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '16px' }}>🛡️ الأمن</h3>
                <button
                    onClick={() => onNavigate?.('admin-activity')}
                    style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '12px' }}
                >
                    عرض السجل الكامل →
                </button>
            </div>

            {/* إحصائيات */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                {card('أجهزة محظورة', data.bannedDevices, '📵', '#dc2626', 'banned-devices')}
                {card('IPs محظورة', data.bannedIPs, '🌐', '#f59e0b', 'banned-ips')}
                {card('عمليات آخر 24س', data.last24h, '⚡', '#10b981', 'admin-activity')}
            </div>

            {/* آخر 5 عمليات */}
            {data.recent.length > 0 && (
                <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>آخر العمليات:</div>
                    <div style={{ display: 'grid', gap: '4px' }}>
                        {data.recent.slice(0, 5).map((log) => (
                            <div key={log._id} style={{
                                padding: '6px 10px', background: '#f9fafb', borderRadius: '6px',
                                display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px'
                            }}>
                                <span style={{ flex: 1, color: '#374151' }}>
                                    <strong>{log.user?.name || '-'}</strong> · {log.description}
                                </span>
                                <span style={{ color: '#9ca3af', fontSize: '10px' }}>
                                    {new Date(log.createdAt).toLocaleString('ar', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default SecurityWidget;
