import React, { useState, useEffect } from 'react';
import { getUserActivity, getUserViolations, warnUser, resetUserAvatar, banUserName, suspendUser, toggleUserActive, banUserPermanent, unbanUser, banUserDevice, unbanUserDevice, getUserLinkedAccounts, sendUserNotification, adjustUserViolations, clearUserViolations, getAccountsByIP, banIP } from '../services/api';
import { useToast } from '../components/Toast';
import { getImageUrl, getDefaultAvatar } from '../config';
import { formatDateTimeLong, formatDateLong } from '../utils/formatters';
import ConversationDetail from './ConversationDetail';
import ConversationMessages from './ConversationMessages';
import './UserDetail.css';

function UserDetail({ userId, onBack }) {
    const [loading, setLoading] = useState(true);
    const [userData, setUserData] = useState(null);
    const [activeTab, setActiveTab] = useState('info');
    const [viewingConversationId, setViewingConversationId] = useState(null);
    const [viewingConversationMessages, setViewingConversationMessages] = useState(false);
    const [violations, setViolations] = useState(null);
    const [linkedAccounts, setLinkedAccounts] = useState(null);
    const { showToast } = useToast();

    useEffect(() => {
        fetchUserActivity();
    }, [userId]);

    const fetchUserActivity = async () => {
        try {
            setLoading(true);
            const response = await getUserActivity(userId);
            setUserData(response.data);
        } catch (error) {
            showToast('فشل في تحميل بيانات المستخدم', 'error');
            console.error('Error fetching user activity:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchLinkedAccounts = async () => {
        try {
            const res = await getUserLinkedAccounts(userId);
            if (res.success) setLinkedAccounts(res.data);
        } catch {}
    };

    const fetchViolations = async () => {
        try {
            const response = await getUserViolations(userId);
            setViolations(response.data);
        } catch (error) {
            console.error('Error fetching violations:', error);
        }
    };

    const handleWarn = async () => {
        const reason = window.prompt('سبب التحذير:', 'مخالفة سياسة الاستخدام');
        if (!reason) return;
        try {
            const result = await warnUser(userId, reason);
            showToast(result.message, 'success');
            fetchUserActivity();
            fetchViolations();
        } catch (error) { showToast('فشل', 'error'); }
    };

    const handleResetAvatar = async () => {
        if (!window.confirm('حذف صورة المستخدم؟')) return;
        try {
            await resetUserAvatar(userId);
            showToast('تم حذف الصورة', 'success');
            fetchUserActivity();
        } catch (error) { showToast('فشل', 'error'); }
    };

    const handleBanName = async () => {
        if (!window.confirm(`حظر اسم "${user?.name}"؟`)) return;
        try {
            await banUserName(userId);
            showToast('تم حظر الاسم', 'success');
            fetchUserActivity();
        } catch (error) { showToast('فشل', 'error'); }
    };

    const handleSuspend = async () => {
        const days = window.prompt('عدد أيام التعليق:', '7');
        if (!days) return;
        const reason = window.prompt(
            'سبب التعليق؟\n(سيظهر للمستخدم في إشعار)',
            'مخالفة سياسة الاستخدام'
        );
        if (reason === null) return;
        try {
            await suspendUser(userId, parseInt(days), reason.trim() || 'مخالفة سياسة الاستخدام');
            showToast(`تم التعليق ${days} يوم`, 'success');
            fetchUserActivity();
        } catch (error) { showToast('فشل', 'error'); }
    };

    const handleBanDevice = async () => {
        const u = userData?.user || userData;
        if (u?.deviceBanned) {
            if (!window.confirm('فك حظر الجهاز عن هذا المستخدم؟')) return;
            try {
                await unbanUserDevice(userId);
                showToast('تم فك حظر الجهاز', 'success');
                fetchUserActivity();
            } catch (error) { showToast('فشل فك الحظر', 'error'); }
            return;
        }
        const reason = window.prompt('سبب حظر الجهاز:', 'حظر الجهاز نهائياً - مخالفات متكررة');
        if (reason === null) return;
        if (!window.confirm(`⚠️ حظر جهاز "${u?.name || 'المستخدم'}" نهائياً؟\nسيتم منع الجهاز من التسجيل بأي حساب جديد.`)) return;
        try {
            await banUserDevice(userId, reason || 'حظر الجهاز نهائياً');
            showToast('تم حظر الجهاز نهائياً', 'success');
            fetchUserActivity();
        } catch (error) {
            showToast(error.response?.data?.message || 'فشل حظر الجهاز', 'error');
        }
    };

    const handleBan = async () => {
        const u = userData?.user || userData;
        // إذا كان المستخدم محظوراً نهائياً → فك الحظر
        const isPermBanned = u?.suspendedUntil &&
            (new Date(u.suspendedUntil) - new Date()) / (1000 * 60 * 60 * 24) > 365;

        if (isPermBanned) {
            if (!window.confirm('فك الحظر النهائي عن هذا المستخدم؟')) return;
            try {
                await unbanUser(userId);
                showToast('تم فك الحظر', 'success');
                fetchUserActivity();
            } catch (error) { showToast('فشل فك الحظر', 'error'); }
            return;
        }

        const reason = window.prompt('سبب الحظر النهائي:', 'حظر دائم - مخالفات متكررة');
        if (reason === null) return;
        if (!window.confirm(`⚠️ حظر "${u?.name || 'المستخدم'}" نهائياً؟\nلن يستطيع الدخول للتطبيق إلا بعد فك الحظر يدوياً.`)) return;
        try {
            await banUserPermanent(userId, reason || 'حظر دائم من قبل الإدارة');
            showToast('تم الحظر نهائياً', 'success');
            fetchUserActivity();
        } catch (error) {
            showToast(error.response?.data?.message || 'فشل الحظر', 'error');
        }
    };

    const formatDate = (date) => formatDateTimeLong(date) === '-' ? 'غير محدد' : formatDateTimeLong(date);
    const formatBirthDate = (date) => formatDateLong(date) === '-' ? 'غير محدد' : formatDateLong(date);

    const calculateAge = (birthDate) => {
        if (!birthDate) return null;
        const today = new Date();
        const birth = new Date(birthDate);
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        return age;
    };

    const getGenderText = (gender) => {
        switch (gender) {
            case 'male': return 'ذكر';
            case 'female': return 'أنثى';
            default: return 'غير محدد';
        }
    };

    const getAuthProviderText = (provider) => {
        switch (provider) {
            case 'google': return 'Google';
            case 'apple': return 'Apple';
            case 'app': return 'التطبيق';
            default: return 'غير محدد';
        }
    };

    const getAuthProviderIcon = (provider) => {
        switch (provider) {
            case 'google': return '🔵';
            case 'apple': return '🍎';
            case 'app': return '📱';
            default: return '❓';
        }
    };

    if (loading) {
        return (
            <div className="user-detail">
                <div className="loading">جاري التحميل...</div>
            </div>
        );
    }

    if (!userData) {
        return (
            <div className="user-detail">
                <div className="error">لم يتم العثور على بيانات المستخدم</div>
            </div>
        );
    }

    const { user, stats, conversations, recentMessages } = userData;
    const userAge = calculateAge(user.birthDate);

    // عرض تفاصيل محادثة
    if (viewingConversationId && !viewingConversationMessages) {
        return (
            <ConversationDetail
                conversationId={viewingConversationId}
                onBack={() => setViewingConversationId(null)}
            />
        );
    }

    // عرض رسائل محادثة مباشرة
    if (viewingConversationId && viewingConversationMessages) {
        return (
            <ConversationMessages
                conversationId={viewingConversationId}
                onBack={() => {
                    setViewingConversationId(null);
                    setViewingConversationMessages(false);
                }}
            />
        );
    }

    return (
        <div className="user-detail">
            <div className="detail-header">
                <button onClick={onBack} className="back-btn">
                    ← رجوع
                </button>
                <h2>تفاصيل المستخدم</h2>
            </div>

            {/* User Info Card */}
            <div className="user-info-card">
                <div className="user-avatar-container">
                    {user.profileImage ? (
                        <img
                            src={getImageUrl(user.profileImage)}
                            alt={user.name}
                            className="user-avatar-image"
                            onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = getDefaultAvatar(user.name);
                            }}
                        />
                    ) : (
                        <div className="user-avatar-large">
                            {user.name.charAt(0)}
                        </div>
                    )}
                    <span className={`status-indicator ${user.isActive ? 'online' : 'offline'}`}></span>
                </div>
                <div className="user-info-details">
                    <h3>{user.name}</h3>
                    <p className="user-email">{user.email}</p>
                    <div className="user-badges">
                        <span className={`role-badge ${user.role}`}>
                            {user.role === 'admin' ? 'مدير' : 'مستخدم'}
                        </span>
                        <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                            {user.isActive ? 'نشط' : 'غير نشط'}
                        </span>
                        <span className="auth-badge">
                            {getAuthProviderIcon(user.authProvider)} {getAuthProviderText(user.authProvider)}
                        </span>
                    </div>
                    <p className="user-joined">
                        انضم في: {formatDate(user.createdAt)}
                    </p>
                    {user.lastLogin && (
                        <p className="user-last-login">
                            آخر دخول: {formatDate(user.lastLogin)}
                        </p>
                    )}
                </div>
            </div>

            {/* Tabs Navigation */}
            <div className="tabs-navigation">
                <button
                    className={`tab-btn ${activeTab === 'info' ? 'active' : ''}`}
                    onClick={() => setActiveTab('info')}
                >
                    👤 المعلومات الشخصية
                </button>
                <button
                    className={`tab-btn ${activeTab === 'stats' ? 'active' : ''}`}
                    onClick={() => setActiveTab('stats')}
                >
                    📊 الإحصائيات
                </button>
                <button
                    className={`tab-btn ${activeTab === 'conversations' ? 'active' : ''}`}
                    onClick={() => setActiveTab('conversations')}
                >
                    💬 المحادثات
                </button>
                <button
                    className={`tab-btn ${activeTab === 'messages' ? 'active' : ''}`}
                    onClick={() => setActiveTab('messages')}
                >
                    📨 الرسائل
                </button>
                <button
                    className={`tab-btn ${activeTab === 'violations' ? 'active' : ''}`}
                    onClick={() => { setActiveTab('violations'); fetchViolations(); }}
                >
                    ⚠️ المخالفات
                </button>
                <button
                    className={`tab-btn ${activeTab === 'linked' ? 'active' : ''}`}
                    onClick={() => { setActiveTab('linked'); fetchLinkedAccounts(); }}
                >👥 حسابات مرتبطة</button>
                <button
                    className={`tab-btn ${activeTab === 'admin' ? 'active' : ''}`}
                    onClick={() => setActiveTab('admin')}
                    style={{ background: activeTab === 'admin' ? '#ef4444' : '', color: activeTab === 'admin' ? '#fff' : '' }}
                >
                    🛡️ أدوات الإشراف
                </button>
            </div>

            {/* Tab Content */}
            <div className="tab-content">
                {/* Personal Info Tab */}
                {activeTab === 'info' && (
                    <div className="personal-info-section">
                        <h3>👤 المعلومات الشخصية</h3>
                        <div className="info-grid">
                            <div className="info-item">
                                <span className="info-icon">🎂</span>
                                <div className="info-content">
                                    <p className="info-label">تاريخ الميلاد</p>
                                    <p className="info-value">
                                        {formatBirthDate(user.birthDate)}
                                        {userAge && <span className="age-badge">({userAge} سنة)</span>}
                                    </p>
                                </div>
                            </div>
                            <div className="info-item">
                                <span className="info-icon">⚧</span>
                                <div className="info-content">
                                    <p className="info-label">الجنس</p>
                                    <p className="info-value">{getGenderText(user.gender)}</p>
                                </div>
                            </div>
                            <div className="info-item">
                                <span className="info-icon">🌍</span>
                                <div className="info-content">
                                    <p className="info-label">الدولة</p>
                                    <p className="info-value">{user.country || 'غير محدد'}</p>
                                </div>
                            </div>
                            {user.location && user.location.coordinates &&
                             user.location.coordinates.length === 2 &&
                             (user.location.coordinates[0] !== 0 || user.location.coordinates[1] !== 0) && (
                                <div className="info-item">
                                    <span className="info-icon">📍</span>
                                    <div className="info-content">
                                        <p className="info-label">الموقع الجغرافي</p>
                                        <p className="info-value">
                                            {user.location.coordinates[1].toFixed(4)}, {user.location.coordinates[0].toFixed(4)}
                                            <a
                                                href={`https://www.google.com/maps?q=${user.location.coordinates[1]},${user.location.coordinates[0]}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="map-link"
                                            >
                                                عرض على الخريطة
                                            </a>
                                        </p>
                                    </div>
                                </div>
                            )}
                            <div className="info-item">
                                <span className="info-icon">🔐</span>
                                <div className="info-content">
                                    <p className="info-label">طريقة التسجيل</p>
                                    <p className="info-value">
                                        {getAuthProviderIcon(user.authProvider)} {getAuthProviderText(user.authProvider)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Bio Section */}
                        <div className="bio-section">
                            <h4>📝 نبذة عن المستخدم</h4>
                            <div className="bio-content">
                                {user.bio ? (
                                    <p>{user.bio}</p>
                                ) : (
                                    <p className="no-bio">لم يتم إضافة نبذة</p>
                                )}
                            </div>
                        </div>

                        {/* Privacy Settings */}
                        {user.privacySettings && (
                            <div className="privacy-section">
                                <h4>🔒 إعدادات الخصوصية</h4>
                                <div className="privacy-grid">
                                    <div className="privacy-item">
                                        <span className="privacy-label">ظهور الملف الشخصي:</span>
                                        <span className="privacy-value">
                                            {user.privacySettings.profileVisibility === 'public' && '🌐 عام'}
                                            {user.privacySettings.profileVisibility === 'contacts' && '👥 جهات الاتصال'}
                                            {user.privacySettings.profileVisibility === 'private' && '🔒 خاص'}
                                        </span>
                                    </div>
                                    <div className="privacy-item">
                                        <span className="privacy-label">إظهار آخر ظهور:</span>
                                        <span className="privacy-value">
                                            {user.privacySettings.showLastSeen ? '✅ مفعل' : '❌ معطل'}
                                        </span>
                                    </div>
                                    <div className="privacy-item">
                                        <span className="privacy-label">صوت الإشعارات:</span>
                                        <span className="privacy-value">
                                            {user.privacySettings.notificationSound ? '🔔 مفعل' : '🔕 معطل'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Device Info */}
                        {user.deviceInfo && (user.deviceInfo.platform || user.deviceInfo.osVersion || user.deviceInfo.appVersion) && (
                            <div className="device-section">
                                <h4>📱 معلومات الجهاز</h4>
                                <div className="device-grid">
                                    {user.deviceInfo.platform && (
                                        <div className="device-item">
                                            <span className="device-label">النظام:</span>
                                            <span className="device-value">{user.deviceInfo.platform}</span>
                                        </div>
                                    )}
                                    {user.deviceInfo.osVersion && (
                                        <div className="device-item">
                                            <span className="device-label">إصدار النظام:</span>
                                            <span className="device-value">{user.deviceInfo.osVersion}</span>
                                        </div>
                                    )}
                                    {user.deviceInfo.appVersion && (
                                        <div className="device-item">
                                            <span className="device-label">إصدار التطبيق:</span>
                                            <span className="device-value">{user.deviceInfo.appVersion}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Known IPs (audit trail) */}
                        {Array.isArray(user.knownIPs) && user.knownIPs.length > 0 && (
                            <div className="device-section" style={{ marginTop: '1rem' }}>
                                <h4>🌐 عناوين IP المستخدمة (للتدقيق)</h4>
                                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                                    آخر {user.knownIPs.length} عناوين — اضغط على IP للبحث عن حسابات أخرى استخدمته
                                </div>
                                <div style={{ display: 'grid', gap: '6px' }}>
                                    {[...user.knownIPs]
                                        .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen))
                                        .map((entry, idx) => (
                                            <div key={idx} style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '8px 12px',
                                                background: '#f9fafb',
                                                borderRadius: '8px',
                                                border: '1px solid #e5e7eb',
                                                fontSize: '13px'
                                            }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <code
                                                        onClick={async () => {
                                                            try {
                                                                const res = await getAccountsByIP(entry.ip);
                                                                const accounts = res?.data?.accounts || [];
                                                                const count = accounts.length;
                                                                const names = accounts.map(a => `• ${a.name}${a.isActive === false ? ' (معلّق)' : ''}`).join('\n');
                                                                alert(`${count} حساب يستخدم IP ${entry.ip}:\n\n${names}`);
                                                            } catch (e) { alert('فشل البحث'); }
                                                        }}
                                                        title="اضغط للبحث"
                                                        style={{ color: '#2563eb', cursor: 'pointer', fontWeight: 'bold' }}
                                                    >
                                                        {entry.ip}
                                                    </code>
                                                    {entry.userAgent && (
                                                        <span style={{ color: '#9ca3af', fontSize: '11px' }}>
                                                            {entry.userAgent.substring(0, 60)}
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', color: '#6b7280', fontSize: '11px' }}>
                                                    <span>{entry.count} مرة</span>
                                                    <span>{formatDate(entry.lastSeen)}</span>
                                                    <button
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            const days = prompt(`حظر IP ${entry.ip} لكم يوم؟\n(اتركه فارغاً للحظر الدائم، أو أدخل عدد الأيام)`, '30');
                                                            if (days === null) return;
                                                            const reason = prompt('سبب الحظر:', `حظر بسبب المستخدم: ${user.name}`) || 'حظر يدوي';
                                                            try {
                                                                await banIP({
                                                                    ip: entry.ip,
                                                                    reason,
                                                                    days: days.trim() === '' ? null : Number(days),
                                                                    originalUserId: user._id
                                                                });
                                                                alert('تم حظر IP');
                                                            } catch { alert('فشل الحظر'); }
                                                        }}
                                                        style={{ padding: '3px 8px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                                                    >
                                                        🛡️ حظر
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Stats Tab */}
                {activeTab === 'stats' && (
                    <div className="stats-section">
                        <h3>📊 إحصائيات النشاط</h3>
                        <div className="stats-grid">
                            <div className="stat-card">
                                <div className="stat-icon">💬</div>
                                <div className="stat-info">
                                    <p className="stat-label">المحادثات</p>
                                    <p className="stat-value">{stats.totalConversations}</p>
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-icon">📨</div>
                                <div className="stat-info">
                                    <p className="stat-label">الرسائل المرسلة</p>
                                    <p className="stat-value">{stats.totalMessagesSent}</p>
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-icon">👥</div>
                                <div className="stat-info">
                                    <p className="stat-label">المحادثات النشطة</p>
                                    <p className="stat-value">{stats.activeConversations}</p>
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-icon">📅</div>
                                <div className="stat-info">
                                    <p className="stat-label">آخر رسالة</p>
                                    <p className="stat-value">
                                        {stats.lastMessageDate
                                            ? formatDate(stats.lastMessageDate).split(' ')[0]
                                            : 'لا يوجد'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Additional Stats */}
                        <div className="additional-stats">
                            <div className="stat-row">
                                <span className="stat-row-label">🚫 المستخدمين المحظورين:</span>
                                <span className="stat-row-value">{user.blockedUsers?.length || 0}</span>
                            </div>
                            <div className="stat-row">
                                <span className="stat-row-label">🔇 المحادثات المكتومة:</span>
                                <span className="stat-row-value">{user.mutedConversations?.length || 0}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Conversations Tab */}
                {activeTab === 'conversations' && (
                    <div className="conversations-section">
                        <h3>💬 المحادثات ({conversations.length})</h3>
                        {conversations.length === 0 ? (
                            <p className="empty-message">لا توجد محادثات لهذا المستخدم</p>
                        ) : (
                            <div className="conversations-list">
                                {conversations.map((conv) => (
                                    <div key={conv._id} className="conversation-item clickable">
                                        <div className="conversation-header">
                                            <h4>{conv.title}</h4>
                                            <span className={`conv-type ${conv.type}`}>
                                                {conv.type === 'private' ? 'خاصة' : 'جماعية'}
                                            </span>
                                        </div>
                                        <div className="conversation-meta">
                                            <p>👥 {conv.metadata.totalParticipants} مشارك</p>
                                            <p>📨 {conv.metadata.totalMessages} رسالة</p>
                                            <p className={conv.isActive ? 'active' : 'inactive'}>
                                                {conv.isActive ? '● نشطة' : '○ غير نشطة'}
                                            </p>
                                        </div>
                                        <p className="conversation-date">
                                            آخر تحديث: {formatDate(conv.updatedAt)}
                                        </p>
                                        <div className="conversation-actions-row">
                                            <button
                                                className="conv-action-btn view-detail"
                                                onClick={() => setViewingConversationId(conv._id)}
                                            >
                                                👁️ التفاصيل
                                            </button>
                                            <button
                                                className="conv-action-btn view-messages"
                                                onClick={() => {
                                                    setViewingConversationId(conv._id);
                                                    setViewingConversationMessages(true);
                                                }}
                                            >
                                                💬 الرسائل
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Messages Tab */}
                {activeTab === 'messages' && (
                    <div className="messages-section">
                        <h3>📨 آخر الرسائل ({recentMessages.length})</h3>
                        {recentMessages.length === 0 ? (
                            <p className="empty-message">لا توجد رسائل حديثة</p>
                        ) : (
                            <div className="messages-list">
                                {recentMessages.map((msg) => (
                                    <div key={msg._id} className="message-item enhanced">
                                        <div className="message-header">
                                            <span className={`message-type ${msg.type}`}>
                                                {msg.type === 'text' && '📝 نص'}
                                                {msg.type === 'image' && '🖼️ صورة'}
                                                {msg.type === 'file' && '📎 ملف'}
                                                {msg.type === 'audio' && '🎵 صوت'}
                                                {msg.type === 'video' && '🎥 فيديو'}
                                            </span>
                                            <span className={`message-status ${msg.status}`}>
                                                {msg.status === 'read' && '✓✓ مقروءة'}
                                                {msg.status === 'delivered' && '✓ مُوصلة'}
                                                {msg.status === 'sent' && '○ مرسلة'}
                                            </span>
                                        </div>
                                        {msg.content && <p className="message-content">{msg.content}</p>}
                                        {msg.type === 'image' && msg.mediaUrl && (
                                            <div className="message-media">
                                                <img
                                                    src={getImageUrl(msg.mediaUrl)}
                                                    alt="صورة"
                                                    className="message-image-preview"
                                                    onError={(e) => { e.target.style.display = 'none'; }}
                                                />
                                            </div>
                                        )}
                                        <p className="message-date">
                                            {formatDate(msg.createdAt)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Violations Tab */}
                {activeTab === 'violations' && (
                    <div className="violations-section">
                        <h3>⚠️ سجل المخالفات</h3>
                        {violations ? (
                            <>
                                <div className="violation-summary" style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                                    <div style={{ padding: '15px 25px', borderRadius: '12px', background: violations.violationCount >= 5 ? '#fecaca' : violations.violationCount >= 3 ? '#fef3c7' : '#d1fae5', textAlign: 'center' }}>
                                        <div style={{ fontSize: '28px', fontWeight: '700', color: violations.violationCount >= 5 ? '#991b1b' : violations.violationCount >= 3 ? '#92400e' : '#065f46' }}>
                                            {violations.violationCount}/5
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#666' }}>عدد المخالفات</div>
                                    </div>
                                    <div style={{ padding: '15px 25px', borderRadius: '12px', background: '#f3f4f6', textAlign: 'center' }}>
                                        <div style={{ fontSize: '28px', fontWeight: '700' }}>{violations.flaggedMessagesCount}</div>
                                        <div style={{ fontSize: '12px', color: '#666' }}>رسائل مخالفة</div>
                                    </div>
                                    {violations.nameBanned && (
                                        <div style={{ padding: '15px 25px', borderRadius: '12px', background: '#fecaca', textAlign: 'center' }}>
                                            <div style={{ fontSize: '20px' }}>🚫</div>
                                            <div style={{ fontSize: '12px', color: '#991b1b' }}>الاسم محظور</div>
                                        </div>
                                    )}
                                </div>
                                {/* الأسماء المحظورة السابقة */}
                                {violations.bannedNamesHistory && violations.bannedNamesHistory.length > 0 && (
                                    <div style={{ marginBottom: '20px', padding: '15px', background: '#fce7f3', borderRadius: '12px', border: '2px solid #f9a8d4' }}>
                                        <h4 style={{ margin: '0 0 10px', color: '#be185d' }}>🚫 أسماء محظورة سابقة ({violations.bannedNamesHistory.length})</h4>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                            {violations.bannedNamesHistory.map((n, i) => (
                                                <span key={i} style={{
                                                    padding: '6px 12px', borderRadius: '20px',
                                                    background: '#fff', border: '1px solid #f9a8d4',
                                                    fontSize: '13px', color: '#be185d'
                                                }} title={`تم حظره بواسطة: ${n.adminId?.name || 'غير معروف'} في ${new Date(n.bannedAt).toLocaleDateString('ar-SA')}`}>
                                                    {n.name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* الرسائل المخالفة مع الصور (دليل) */}
                                {violations.flaggedMessages && violations.flaggedMessages.length > 0 && (
                                    <div style={{ marginBottom: '20px', padding: '15px', background: '#fef2f2', borderRadius: '12px', border: '2px solid #fca5a5' }}>
                                        <h4 style={{ margin: '0 0 10px', color: '#991b1b' }}>📸 رسائل مخالفة (دليل) — {violations.flaggedMessages.length}</h4>
                                        <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                                            {violations.flaggedMessages.map((m, i) => (
                                                <div key={i} style={{ padding: '10px', background: '#fff', borderRadius: '8px', border: '1px solid #fecaca' }}>
                                                    <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>
                                                        {new Date(m.createdAt).toLocaleString('ar-SA')}
                                                        {m.isDeleted && <span style={{ marginRight: '8px', color: '#dc2626' }}>• محذوفة</span>}
                                                    </div>
                                                    {m.type === 'image' && m.mediaUrl ? (
                                                        <img src={getImageUrl(m.mediaUrl)} alt="" style={{ width: '100%', maxHeight: '180px', objectFit: 'cover', borderRadius: '6px' }}
                                                            onError={(e) => { e.target.style.display = 'none'; }} />
                                                    ) : (
                                                        <div style={{ fontSize: '13px', color: '#1f2937', wordBreak: 'break-word', maxHeight: '120px', overflow: 'auto' }}>
                                                            {m.content || '(رسالة فارغة)'}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {violations.warnings && violations.warnings.length > 0 ? (
                                    <table className="data-table" style={{ width: '100%' }}>
                                        <thead>
                                            <tr>
                                                <th>التاريخ</th>
                                                <th>الإجراء</th>
                                                <th>السبب / الدليل</th>
                                                <th>بواسطة</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {violations.warnings.slice().reverse().map((w, i) => (
                                                <tr key={i}>
                                                    <td style={{ fontSize: '12px' }}>{w.date ? new Date(w.date).toLocaleDateString('ar-SA') : '-'}</td>
                                                    <td>
                                                        <span style={{ padding: '2px 8px', borderRadius: '8px', fontSize: '11px', background:
                                                            w.action === 'permanent_ban' || w.action === 'device_ban' ? '#111827' :
                                                            w.action === 'auto_suspend' ? '#fecaca' :
                                                            w.action === 'suspend' ? '#fed7aa' :
                                                            w.action === 'name_ban' ? '#fce7f3' :
                                                            w.action === 'avatar_reset' ? '#e0e7ff' :
                                                            w.action === 'unban' ? '#d1fae5' : '#fef3c7',
                                                            color: (w.action === 'permanent_ban' || w.action === 'device_ban') ? '#fca5a5' : '#000'
                                                        }}>
                                                            {w.action === 'warn' ? '⚠️ تحذير' :
                                                             w.action === 'name_ban' ? '✏️ حظر اسم' :
                                                             w.action === 'avatar_reset' ? '🖼️ حذف صورة' :
                                                             w.action === 'suspend' ? '⏸️ تعليق' :
                                                             w.action === 'auto_suspend' ? '🔴 إيقاف تلقائي' :
                                                             w.action === 'permanent_ban' ? '🚫 حظر نهائي' :
                                                             w.action === 'device_ban' ? '📵 حظر جهاز' :
                                                             w.action === 'unban' ? '✅ فك حظر' : w.action}
                                                        </span>
                                                    </td>
                                                    <td style={{ fontSize: '13px' }}>
                                                        {w.reason}
                                                        {w.oldName && (
                                                            <div style={{ fontSize: '11px', color: '#be185d', marginTop: '4px' }}>
                                                                الاسم القديم: <b>{w.oldName}</b>
                                                            </div>
                                                        )}
                                                        {w.evidence && (w.evidence.messageContent || w.evidence.messageMedia) && (
                                                            <div style={{ marginTop: '8px', padding: '8px', background: '#fef2f2', borderRadius: '6px', borderRight: '3px solid #dc2626' }}>
                                                                <div style={{ fontSize: '11px', color: '#991b1b', marginBottom: '4px', fontWeight: '600' }}>📎 الدليل:</div>
                                                                {w.evidence.messageType === 'image' && w.evidence.messageMedia ? (
                                                                    <img src={getImageUrl(w.evidence.messageMedia)} alt="" style={{ maxWidth: '150px', maxHeight: '150px', borderRadius: '4px' }}
                                                                        onError={(e) => { e.target.style.display = 'none'; }} />
                                                                ) : (
                                                                    <div style={{ fontSize: '12px', color: '#7f1d1d' }}>{w.evidence.messageContent || '(بدون محتوى)'}</div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ fontSize: '12px' }}>{w.adminId?.name || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <p style={{ textAlign: 'center', color: '#999', padding: '30px' }}>لا توجد مخالفات مسجلة</p>
                                )}
                            </>
                        ) : (
                            <p style={{ textAlign: 'center', color: '#999', padding: '30px' }}>جاري التحميل...</p>
                        )}
                    </div>
                )}

                {/* Linked Accounts Tab */}
                {activeTab === 'linked' && (
                    <div>
                        <h3>👥 الحسابات المرتبطة (نفس الجهاز)</h3>
                        {!linkedAccounts ? (
                            <p style={{ textAlign: 'center', padding: '30px', color: '#9ca3af' }}>جاري التحميل...</p>
                        ) : linkedAccounts.accounts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', background: '#f9fafb', borderRadius: '12px' }}>
                                <div style={{ fontSize: '36px' }}>✅</div>
                                <p style={{ color: '#6b7280', marginTop: '8px' }}>لا توجد حسابات مرتبطة بنفس الجهاز</p>
                                <p style={{ color: '#9ca3af', fontSize: '12px' }}>هذا المستخدم لم يُنشئ حسابات أخرى من نفس التطبيق</p>
                            </div>
                        ) : (
                            <>
                                <div style={{
                                    padding: '10px 14px', background: '#fef2f2', borderRadius: '8px',
                                    marginBottom: '12px', fontSize: '13px', color: '#991b1b',
                                    border: '1px solid #fecaca'
                                }}>
                                    ⚠️ تم اكتشاف <b>{linkedAccounts.accounts.length}</b> حسابات أخرى مرتبطة بنفس الجهاز — قد يكون المستخدم يتحايل على الحظر
                                </div>
                                <div style={{ display: 'grid', gap: '8px' }}>
                                    {linkedAccounts.accounts.map(a => {
                                        const isBanned = a.deviceBanned || (a.suspendedUntil && (new Date(a.suspendedUntil) - new Date()) > 365 * 24 * 60 * 60 * 1000);
                                        return (
                                            <div key={a._id} style={{
                                                display: 'flex', gap: '10px', alignItems: 'center',
                                                padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px',
                                                background: isBanned ? '#fef2f2' : '#fff'
                                            }}>
                                                <img
                                                    src={a.profileImage ? getImageUrl(a.profileImage) : getDefaultAvatar(a.name)}
                                                    alt="" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }}
                                                    onError={(e) => { e.target.onerror = null; e.target.src = getDefaultAvatar(a.name); }}
                                                />
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                                        <span style={{ fontWeight: '700' }}>{a.name}</span>
                                                        {a.deviceBanned && <span style={{ padding: '2px 6px', borderRadius: '8px', background: '#111827', color: '#fca5a5', fontSize: '10px' }}>📵 محظور</span>}
                                                        {!a.isActive && !a.deviceBanned && <span style={{ padding: '2px 6px', borderRadius: '8px', background: '#fecaca', color: '#991b1b', fontSize: '10px' }}>غير نشط</span>}
                                                        {a.violationCount > 0 && <span style={{ padding: '2px 6px', borderRadius: '8px', background: '#fee2e2', color: '#991b1b', fontSize: '10px' }}>⚠️ {a.violationCount}</span>}
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: '#6b7280' }}>{a.email} · {a.uniqueTag}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Admin Tools Tab */}
                {activeTab === 'admin' && (
                    <div className="admin-tools-section">

                        {/* ═══ 📨 تنبيهات احترافية ═══ */}
                        <div style={{ marginBottom: '24px' }}>
                            <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>📨 إرسال تنبيه رسمي</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                                {[
                                    { key: 'photo', icon: '🖼️', label: 'صورة مخالفة', desc: 'تنبيه لتغيير الصورة', color: '#6366f1' },
                                    { key: 'name', icon: '✏️', label: 'اسم مخالف', desc: 'تنبيه لتغيير الاسم', color: '#ec4899' },
                                    { key: 'content', icon: '📝', label: 'محتوى غير لائق', desc: 'تنبيه عن المحتوى', color: '#f59e0b' },
                                    { key: 'behavior', icon: '🤝', label: 'سلوك مزعج', desc: 'تنبيه عن السلوك', color: '#0ea5e9' },
                                    { key: 'bio', icon: '📋', label: 'نبذة مخالفة', desc: 'تنبيه عن النبذة', color: '#8b5cf6' },
                                    { key: 'final_warning', icon: '🚫', label: 'تحذير أخير', desc: 'آخر فرصة قبل الإيقاف', color: '#dc2626' }
                                ].map(t => (
                                    <button key={t.key} onClick={async () => {
                                        if (!window.confirm(`إرسال تنبيه "${t.label}" لـ ${user?.name}؟\n\nسيصله إشعار push فوري.`)) return;
                                        try {
                                            await sendUserNotification(userId, { template: t.key });
                                            showToast(`تم إرسال تنبيه "${t.label}"`, 'success');
                                        } catch { showToast('فشل', 'error'); }
                                    }} style={{
                                        padding: '12px', borderRadius: '10px',
                                        border: `1px solid ${t.color}30`,
                                        background: `${t.color}08`,
                                        cursor: 'pointer', textAlign: 'right'
                                    }}>
                                        <div style={{ fontSize: '14px', fontWeight: '600' }}>{t.icon} {t.label}</div>
                                        <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>{t.desc}</div>
                                    </button>
                                ))}
                                {/* رسالة مخصصة */}
                                <button onClick={async () => {
                                    const title = window.prompt('عنوان التنبيه:', '⚠️ تنبيه من الإدارة');
                                    if (!title) return;
                                    const body = window.prompt('محتوى التنبيه:', '');
                                    if (!body) return;
                                    try {
                                        await sendUserNotification(userId, { title, body });
                                        showToast('تم إرسال التنبيه المخصص', 'success');
                                    } catch { showToast('فشل', 'error'); }
                                }} style={{
                                    padding: '12px', borderRadius: '10px',
                                    border: '2px dashed #9ca3af',
                                    background: '#f9fafb',
                                    cursor: 'pointer', textAlign: 'right'
                                }}>
                                    <div style={{ fontSize: '14px', fontWeight: '600' }}>💬 رسالة مخصصة</div>
                                    <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>اكتب عنوان ومحتوى</div>
                                </button>
                            </div>
                        </div>

                        {/* ═══ ⚠️ إدارة المخالفات ═══ */}
                        <div style={{ marginBottom: '24px', padding: '16px', background: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                            <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>⚠️ إدارة المخالفات</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                <div style={{ fontSize: '13px', color: '#374151' }}>
                                    العدد الحالي:
                                    <span style={{
                                        display: 'inline-block', padding: '4px 14px', borderRadius: '12px',
                                        background: (user?.violationCount || 0) >= 5 ? '#fecaca' : (user?.violationCount || 0) > 0 ? '#fef3c7' : '#d1fae5',
                                        fontWeight: '800', fontSize: '16px', marginRight: '8px', marginLeft: '8px'
                                    }}>
                                        {user?.violationCount || 0}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    {[
                                        { amount: 1, label: '+1', bg: '#fef3c7', color: '#92400e' },
                                        { amount: 3, label: '+3', bg: '#fed7aa', color: '#c2410c' },
                                        { amount: 5, label: '+5', bg: '#fecaca', color: '#991b1b' },
                                        { amount: -1, label: '-1', bg: '#d1fae5', color: '#065f46' },
                                        { amount: -3, label: '-3', bg: '#a7f3d0', color: '#047857' }
                                    ].map(v => (
                                        <button key={v.label} onClick={async () => {
                                            const reason = v.amount > 0 ? window.prompt('سبب الإضافة (اختياري):', '') : null;
                                            if (v.amount > 0 && reason === null) return;
                                            try {
                                                const res = await adjustUserViolations(userId, v.amount, reason || '');
                                                showToast(res.message, 'success');
                                                fetchUserActivity();
                                            } catch { showToast('فشل', 'error'); }
                                        }} style={{
                                            padding: '6px 14px', borderRadius: '8px', border: 'none',
                                            background: v.bg, color: v.color,
                                            fontWeight: '700', fontSize: '14px', cursor: 'pointer'
                                        }}>{v.label}</button>
                                    ))}
                                </div>
                                <button onClick={async () => {
                                    if (!window.confirm(`تصفير جميع مخالفات ${user?.name}؟\n\nسيُمحى: عداد المخالفات + عداد اليومي + عداد الإيقافات`)) return;
                                    try {
                                        const res = await clearUserViolations(userId);
                                        showToast(res.message, 'success');
                                        fetchUserActivity();
                                    } catch { showToast('فشل', 'error'); }
                                }} style={{
                                    padding: '6px 14px', borderRadius: '8px', border: '1px solid #dc2626',
                                    background: '#fff', color: '#dc2626',
                                    fontWeight: '600', fontSize: '13px', cursor: 'pointer'
                                }}>🗑️ تصفير الكل</button>
                            </div>
                        </div>

                        {/* ═══ 🔧 إجراءات ═══ */}
                        <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>🔧 إجراءات</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                            <button onClick={handleWarn} style={{ padding: '16px', borderRadius: '12px', border: '2px solid #f59e0b', background: '#fffbeb', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
                                ⚠️ تحذير + مخالفة
                                <div style={{ fontSize: '11px', color: '#92400e', marginTop: '4px' }}>يزيد العداد +1 + تعليق تلقائي عند 5</div>
                            </button>
                            <button onClick={handleResetAvatar} style={{ padding: '16px', borderRadius: '12px', border: '2px solid #6366f1', background: '#eef2ff', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
                                🖼️ حذف الصورة
                                <div style={{ fontSize: '11px', color: '#4338ca', marginTop: '4px' }}>إزالة صورة الملف الشخصي</div>
                            </button>
                            <button onClick={handleBanName} style={{ padding: '16px', borderRadius: '12px', border: '2px solid #ec4899', background: '#fdf2f8', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
                                ✏️ حظر الاسم
                                <div style={{ fontSize: '11px', color: '#be185d', marginTop: '4px' }}>يظهر ***مستخدم محظور***</div>
                            </button>
                            <button onClick={handleSuspend} style={{ padding: '16px', borderRadius: '12px', border: '2px solid #f97316', background: '#fff7ed', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
                                ⏸️ تعليق مؤقت
                                <div style={{ fontSize: '11px', color: '#c2410c', marginTop: '4px' }}>تعليق لفترة محددة</div>
                            </button>
                            {(() => {
                                const u = userData?.user || userData;
                                const isPermBanned = u?.suspendedUntil &&
                                    (new Date(u.suspendedUntil) - new Date()) / (1000 * 60 * 60 * 24) > 365;
                                const isDeviceBanned = u?.deviceBanned;
                                return (
                                    <>
                                        <button onClick={handleBan} style={{
                                            padding: '16px', borderRadius: '12px',
                                            border: isPermBanned ? '2px solid #10b981' : '2px solid #ef4444',
                                            background: isPermBanned ? '#ecfdf5' : '#fef2f2',
                                            cursor: 'pointer', fontSize: '14px', fontWeight: '600',
                                            color: isPermBanned ? '#059669' : '#dc2626'
                                        }}>
                                            {isPermBanned ? '✅ فك الحظر النهائي' : '🚫 حظر نهائي'}
                                            <div style={{ fontSize: '11px', color: isPermBanned ? '#065f46' : '#991b1b', marginTop: '4px' }}>
                                                {isPermBanned ? 'إعادة تفعيل الحساب' : 'إيقاف الحساب بالكامل'}
                                            </div>
                                        </button>
                                        <button onClick={handleBanDevice} style={{
                                            padding: '16px', borderRadius: '12px',
                                            border: isDeviceBanned ? '2px solid #10b981' : '2px solid #111827',
                                            background: isDeviceBanned ? '#ecfdf5' : '#1f2937',
                                            cursor: 'pointer', fontSize: '14px', fontWeight: '600',
                                            color: isDeviceBanned ? '#059669' : '#fca5a5'
                                        }}>
                                            {isDeviceBanned ? '✅ فك حظر الجهاز' : '📵 حظر الجهاز'}
                                            <div style={{ fontSize: '11px', color: isDeviceBanned ? '#065f46' : '#fecaca', marginTop: '4px' }}>
                                                {isDeviceBanned ? 'السماح للجهاز بالتسجيل' : 'منع التسجيل من نفس الجهاز'}
                                            </div>
                                        </button>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default UserDetail;
