import React, { useState, useEffect } from 'react';
import { getAppSettings, updateAppVersionSettings, getAppVersionInfo } from '../services/api';
import { useToast } from '../components/Toast';

function AppVersion() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        ios: { minVersion: '1.0.0', latestVersion: '1.0.0', storeURL: '', enabled: false },
        android: { minVersion: '1.0.0', latestVersion: '1.0.0', storeURL: '', enabled: false },
        message: ''
    });
    const [testVersion, setTestVersion] = useState('1.0.0');
    const [testResult, setTestResult] = useState(null);
    const toast = useToast();

    const fetch = async () => {
        try {
            setLoading(true);
            const res = await getAppSettings();
            if (res.success) {
                const fu = res.data?.forceUpdate || {};
                setForm({
                    ios: fu.ios || { minVersion: '1.0.0', latestVersion: '1.0.0', storeURL: '', enabled: false },
                    android: fu.android || { minVersion: '1.0.0', latestVersion: '1.0.0', storeURL: '', enabled: false },
                    message: fu.message || 'يتوفر إصدار جديد يحتوي على تحسينات مهمة. يُرجى التحديث للمتابعة.'
                });
            }
        } catch { toast.error('فشل تحميل الإعدادات'); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetch(); /* eslint-disable-next-line */ }, []);

    const handleSave = async () => {
        // تحقق بسيط: minVersion <= latestVersion
        const cmp = (a, b) => {
            const pa = (a || '0').split('.').map(Number);
            const pb = (b || '0').split('.').map(Number);
            for (let i = 0; i < 3; i++) {
                if ((pa[i] || 0) < (pb[i] || 0)) return -1;
                if ((pa[i] || 0) > (pb[i] || 0)) return 1;
            }
            return 0;
        };
        for (const p of ['ios', 'android']) {
            if (cmp(form[p].minVersion, form[p].latestVersion) > 0) {
                toast.error(`${p}: الحد الأدنى يجب أن يكون ≤ الإصدار الحالي`);
                return;
            }
        }
        try {
            setSaving(true);
            await updateAppVersionSettings(form);
            toast.success('تم حفظ الإعدادات ✅');
        } catch { toast.error('فشل الحفظ'); }
        finally { setSaving(false); }
    };

    const handleTest = async (platform) => {
        try {
            const res = await getAppVersionInfo(platform, testVersion);
            setTestResult({ platform, ...res.data });
        } catch { toast.error('فشل الاختبار'); }
    };

    if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>جاري التحميل...</div>;

    const platformSection = (key, title, icon) => (
        <div style={{
            background: 'white', padding: '1.25rem', borderRadius: '12px',
            border: '1px solid #e5e7eb', marginBottom: '1rem'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '24px' }}>{icon}</span>
                    {title}
                </h3>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={form[key].enabled}
                        onChange={(e) => setForm({ ...form, [key]: { ...form[key], enabled: e.target.checked } })}
                    />
                    <span style={{ fontSize: '13px', fontWeight: '600' }}>
                        {form[key].enabled ? '✅ مُفعّل' : '⏸️ مُعطّل'}
                    </span>
                </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                        🔻 الحد الأدنى المطلوب
                    </label>
                    <input
                        type="text"
                        placeholder="1.0.0"
                        value={form[key].minVersion}
                        onChange={(e) => setForm({ ...form, [key]: { ...form[key], minVersion: e.target.value } })}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', direction: 'ltr', fontFamily: 'monospace' }}
                    />
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                        أقل من هذا الإصدار = إجبار تحديث
                    </div>
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                        🔺 أحدث إصدار
                    </label>
                    <input
                        type="text"
                        placeholder="1.2.0"
                        value={form[key].latestVersion}
                        onChange={(e) => setForm({ ...form, [key]: { ...form[key], latestVersion: e.target.value } })}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', direction: 'ltr', fontFamily: 'monospace' }}
                    />
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                        الإصدار الحالي في المتجر
                    </div>
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                        🔗 رابط المتجر
                    </label>
                    <input
                        type="text"
                        placeholder={key === 'ios' ? 'https://apps.apple.com/...' : 'https://play.google.com/...'}
                        value={form[key].storeURL}
                        onChange={(e) => setForm({ ...form, [key]: { ...form[key], storeURL: e.target.value } })}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', direction: 'ltr' }}
                    />
                </div>

                <button
                    onClick={() => handleTest(key)}
                    style={{ gridColumn: '1 / -1', padding: '8px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
                >
                    🧪 اختبر (مقارنة {testVersion} مع هذه الإعدادات)
                </button>
            </div>
        </div>
    );

    const statusColor = (status) =>
        status === 'force_update' ? '#dc2626' :
        status === 'update_available' ? '#f59e0b' :
        '#10b981';
    const statusLabel = (status) =>
        status === 'force_update' ? '🚫 إجبار تحديث' :
        status === 'update_available' ? '⬆️ تحديث متوفر' :
        '✅ محدّث';

    return (
        <div style={{ padding: '1rem', maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ marginBottom: '1.5rem' }}>
                <h2 style={{ margin: 0 }}>🔄 إعدادات تحديث التطبيق</h2>
                <p style={{ color: '#6b7280', fontSize: '13px', margin: '4px 0 0' }}>
                    التحكم في إجبار المستخدمين على تحديث التطبيق حسب المنصة
                </p>
            </div>

            {platformSection('ios', 'iOS (Apple)', '🍎')}
            {platformSection('android', 'Android (Google)', '🤖')}

            {/* الرسالة المعروضة */}
            <div style={{
                background: 'white', padding: '1.25rem', borderRadius: '12px',
                border: '1px solid #e5e7eb', marginBottom: '1rem'
            }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
                    💬 رسالة المستخدم (مشترك لـ iOS و Android)
                </label>
                <textarea
                    rows={3}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', resize: 'vertical', fontFamily: 'inherit' }}
                />
            </div>

            {/* اختبار */}
            <div style={{
                background: '#f9fafb', padding: '1rem', borderRadius: '12px', border: '1px dashed #d1d5db', marginBottom: '1rem'
            }}>
                <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>🧪 اختبار الإعدادات</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                        type="text"
                        placeholder="أدخل نسخة للاختبار"
                        value={testVersion}
                        onChange={(e) => setTestVersion(e.target.value)}
                        style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', direction: 'ltr', fontFamily: 'monospace' }}
                    />
                </div>
                {testResult && (
                    <div style={{ marginTop: '10px', padding: '10px', background: 'white', borderRadius: '6px', fontSize: '13px' }}>
                        <div>المنصة: <strong>{testResult.platform}</strong></div>
                        <div>الإصدار المُختبر: <code>{testResult.currentVersion}</code></div>
                        <div>النتيجة: <span style={{ color: statusColor(testResult.status), fontWeight: 'bold' }}>
                            {statusLabel(testResult.status)}
                        </span></div>
                    </div>
                )}
            </div>

            {/* حفظ */}
            <button
                onClick={handleSave}
                disabled={saving}
                style={{
                    width: '100%', padding: '14px', background: saving ? '#9ca3af' : '#2563eb',
                    color: 'white', border: 'none', borderRadius: '10px', cursor: saving ? 'not-allowed' : 'pointer',
                    fontSize: '16px', fontWeight: 'bold'
                }}
            >
                {saving ? 'جاري الحفظ...' : '💾 حفظ الإعدادات'}
            </button>

            {/* تعليمات */}
            <div style={{ marginTop: '1rem', padding: '1rem', background: '#eff6ff', borderRadius: '8px', fontSize: '12px', color: '#1e40af' }}>
                <div style={{ fontWeight: '600', marginBottom: '6px' }}>💡 كيف يعمل النظام؟</div>
                <ul style={{ margin: 0, paddingInlineStart: '20px' }}>
                    <li>إذا <strong>إصدار المستخدم &lt; الحد الأدنى</strong> → تظهر شاشة إجبار تحديث (لا يمكن تجاوزها)</li>
                    <li>إذا <strong>إصدار المستخدم &lt; الإصدار الحالي</strong> فقط → إشعار اختياري (لاحقاً)</li>
                    <li>المنصة غير المُفعّلة → لا يتم أي فحص عليها</li>
                    <li>الفحص يحدث عند فتح التطبيق ورجوعه من الخلفية</li>
                </ul>
            </div>
        </div>
    );
}

export default AppVersion;
