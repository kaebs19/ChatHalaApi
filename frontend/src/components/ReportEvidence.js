// HalaChat Dashboard - Report Evidence
// عرض لقطة الشاشة المرفقة ببلاغ

import React, { useEffect, useState } from 'react';
import api from '../services/api';

/**
 * لقطة البلاغ لا تُخدَم عبر /uploads العام — محتواها محادثة خاصة.
 * تُجلب هنا عبر مسار الأدمن كـ blob لأن <img src> لا يحمل رأس المصادقة.
 */
const ReportEvidence = ({ evidenceUrl, uploadedAt }) => {
    const [objectUrl, setObjectUrl] = useState(null);
    const [state, setState] = useState('loading'); // loading | ready | error
    const [zoomed, setZoomed] = useState(false);

    useEffect(() => {
        if (!evidenceUrl) return;

        // اسم الملف فقط — الرابط المخزَّن قد يحمل دوميناً قديماً
        const filename = evidenceUrl.split('/').pop().split('?')[0];
        let revoked = false;
        let created = null;

        api.get(`/reports/evidence/${filename}`, { responseType: 'blob' })
            .then((res) => {
                if (revoked) return;
                created = URL.createObjectURL(res.data);
                setObjectUrl(created);
                setState('ready');
            })
            .catch(() => {
                if (!revoked) setState('error');
            });

        return () => {
            revoked = true;
            if (created) URL.revokeObjectURL(created);
        };
    }, [evidenceUrl]);

    if (!evidenceUrl) return null;

    return (
        <div className="report-evidence">
            <div className="report-evidence-header">
                <span className="report-evidence-label">📎 لقطة شاشة مرفقة</span>
                {uploadedAt && (
                    <span className="report-evidence-date">
                        {new Date(uploadedAt).toLocaleString('ar-SA')}
                    </span>
                )}
            </div>

            {state === 'loading' && (
                <div className="report-evidence-placeholder">جارٍ التحميل…</div>
            )}

            {state === 'error' && (
                <div className="report-evidence-placeholder error">
                    تعذّر تحميل اللقطة — قد تكون حُذفت من الخادم
                </div>
            )}

            {state === 'ready' && (
                <>
                    <img
                        src={objectUrl}
                        alt="لقطة شاشة مرفقة بالبلاغ"
                        className="report-evidence-image"
                        onClick={() => setZoomed(true)}
                        title="اضغط للتكبير"
                    />
                    {zoomed && (
                        <div className="report-evidence-lightbox" onClick={() => setZoomed(false)}>
                            <img src={objectUrl} alt="لقطة شاشة مرفقة بالبلاغ" />
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default ReportEvidence;
