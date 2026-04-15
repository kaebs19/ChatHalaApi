import React, { useState, useEffect } from 'react';
import { getBannedDevices, unbanUserDevice } from '../services/api';
import { useToast } from '../components/Toast';
import { formatDateTimeLong } from '../utils/formatters';

function BannedDevices() {
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
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
            fetch();
        } catch { toast.error('فشل فك الحظر'); }
    };

    return (
        <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h1 style={{ margin: 0 }}>📵 الأجهزة المحظورة</h1>
                    <p style={{ color: '#6b7280', margin: '4px 0 0' }}>إجمالي: {devices.length}</p>
                </div>
                <button onClick={fetch} className="refresh-btn">تحديث</button>
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
                                <th>نوع الجهاز</th>
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
                                        <div style={{ fontSize: '11px', color: '#6b7280' }}>{d.originalUserId}</div>
                                    </td>
                                    <td style={{ fontSize: '13px' }}>
                                        {d.deviceInfo?.platform ? (
                                            <>
                                                <div>{d.deviceInfo.platform} {d.deviceInfo.osVersion}</div>
                                                <div style={{ fontSize: '11px', color: '#6b7280' }}>v{d.deviceInfo.appVersion || '-'}</div>
                                            </>
                                        ) : '-'}
                                    </td>
                                    <td style={{ fontSize: '13px', maxWidth: '300px' }}>{d.reason}</td>
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
        </div>
    );
}

export default BannedDevices;
