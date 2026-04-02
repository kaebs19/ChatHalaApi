import React, { useState, useEffect } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getDashboardStats, getConversationsStats, getReportsStats, getAllChatRooms } from '../services/api';
import { useToast } from '../components/Toast';
import LoadingSpinner from '../components/LoadingSpinner';
import StatCard from '../components/StatCard';
import { formatDateLong } from '../utils/formatters';
import socketService from '../services/socket';
import config, { getImageUrl, getDefaultAvatar } from '../config';
import './Dashboard.css';

function Dashboard({ user, onPageChange }) {
    const [stats, setStats] = useState({
        totalUsers: 0,
        activeUsers: 0,
        newUsers: 0,
        recentLogins: 0
    });
    const [conversationStats, setConversationStats] = useState({
        totalConversations: 0,
        activeConversations: 0,
        totalMessages: 0,
        privateConversations: 0,
        groupConversations: 0
    });
    const [reportsStats, setReportsStats] = useState({
        total: 0,
        pending: 0,
        reviewed: 0,
        resolved: 0
    });
    const [roomsStats, setRoomsStats] = useState({
        total: 0,
        active: 0
    });
    const [premiumStats, setPremiumStats] = useState({
        total: 0,
        active: 0,
        expired: 0,
        byPlan: { weekly: 0, monthly: 0, quarterly: 0 },
        estimatedMonthlyRevenue: 0
    });
    const [superLikeStats, setSuperLikeStats] = useState({
        total: 0,
        last7Days: 0
    });
    const [stealthStats, setStealthStats] = useState({ activeUsers: 0 });
    const [flaggedStats, setFlaggedStats] = useState({
        last24h: 0,
        last7Days: 0,
        last30Days: 0,
        total: 0
    });
    const [latestUsers, setLatestUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showNotificationModal, setShowNotificationModal] = useState(false);
    const [notificationData, setNotificationData] = useState({
        title: '',
        body: '',
        type: 'general',
        recipients: 'all',
        targetGender: 'all',
        targetPremium: 'all'
    });
    const [sending, setSending] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        fetchDashboardData();
    }, []);

    // Real-time: الاستماع لتنبيهات الكلمات المحظورة
    useEffect(() => {
        if (!socketService.isConnected()) {
            socketService.connect();
        }

        socketService.onBannedWordAlert((data) => {
            const chatLabel = data.chatType === 'room' ? `غرفة: ${data.roomName || ''}` : 'محادثة خاصة';
            showToast(
                `⚠️ كلمة محظورة من ${data.senderName} (${chatLabel}): ${data.wordsFound?.join(', ')}`,
                'warning'
            );
            setFlaggedStats(prev => ({
                ...prev,
                last24h: prev.last24h + 1,
                total: prev.total + 1
            }));
        });

        return () => {
            socketService.offBannedWordAlert();
        };
    }, []);

    const fetchDashboardData = async () => {
        try {
            setLoading(true);

            // جلب إحصائيات المستخدمين + الإحصائيات المتقدمة
            const userStatsResponse = await getDashboardStats();
            if (userStatsResponse.success) {
                setStats(userStatsResponse.data.stats);
                setLatestUsers(userStatsResponse.data.latestUsers);
                if (userStatsResponse.data.premium) setPremiumStats(userStatsResponse.data.premium);
                if (userStatsResponse.data.superLikes) setSuperLikeStats(userStatsResponse.data.superLikes);
                if (userStatsResponse.data.stealthMode) setStealthStats(userStatsResponse.data.stealthMode);
                if (userStatsResponse.data.flaggedMessages) setFlaggedStats(userStatsResponse.data.flaggedMessages);
                if (userStatsResponse.data.conversations) {
                    setConversationStats(prev => ({
                        ...prev,
                        totalConversations: userStatsResponse.data.conversations.total || prev.totalConversations,
                        activeConversations: userStatsResponse.data.conversations.active || prev.activeConversations,
                        totalMessages: userStatsResponse.data.conversations.totalMessages || prev.totalMessages
                    }));
                }
            }

            // جلب إحصائيات المحادثات
            try {
                const convStatsResponse = await getConversationsStats();
                if (convStatsResponse.success) {
                    setConversationStats(convStatsResponse.data);
                }
            } catch (convErr) {
                console.log('تخطي إحصائيات المحادثات');
            }

            // جلب إحصائيات البلاغات
            try {
                const reportsResponse = await getReportsStats();
                if (reportsResponse.success) {
                    setReportsStats(reportsResponse.data);
                }
            } catch (reportsErr) {
                console.log('تخطي إحصائيات البلاغات');
            }

            // جلب إحصائيات الغرف
            try {
                const roomsResponse = await getAllChatRooms(1, 1);
                if (roomsResponse.success) {
                    setRoomsStats({
                        total: roomsResponse.data.pagination?.total || 0,
                        active: roomsResponse.data.rooms?.filter(r => r.isActive).length || 0
                    });
                }
            } catch (roomsErr) {
                console.log('تخطي إحصائيات الغرف');
            }
        } catch (err) {
            console.error('خطأ في جلب البيانات:', err);
            setError('فشل تحميل البيانات');
            setStats({
                totalUsers: 5,
                activeUsers: 4,
                newUsers: 2,
                recentLogins: 1
            });
        } finally {
            setLoading(false);
        }
    };

    const handleSendNotification = async (e) => {
        e.preventDefault();

        if (!notificationData.title || !notificationData.body) {
            showToast('العنوان والمحتوى مطلوبان', 'error');
            return;
        }

        try {
            setSending(true);
            const token = localStorage.getItem('token');

            const response = await fetch(`${config.API_URL}/notifications/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(notificationData)
            });

            const data = await response.json();

            if (data.success) {
                showToast('تم إرسال الإشعار بنجاح ✅', 'success');
                setShowNotificationModal(false);
                setNotificationData({
                    title: '',
                    body: '',
                    type: 'general',
                    recipients: 'all',
                    targetGender: 'all',
                    targetPremium: 'all'
                });
            } else {
                showToast(data.message || 'فشل إرسال الإشعار', 'error');
            }
        } catch (error) {
            console.error('خطأ في إرسال الإشعار:', error);
            showToast('فشل إرسال الإشعار', 'error');
        } finally {
            setSending(false);
        }
    };

    const isAdmin = user?.role === 'admin';

    return (
        <div className="dashboard-content">
            {error && <div className="error-banner">{error}</div>}

            {/* الإجراءات السريعة */}
            {isAdmin && (
                <div className="quick-actions-section">
                    <h3 className="section-title">⚡ إجراءات سريعة</h3>
                    <div className="quick-actions-grid">
                        <button className="quick-action-btn users" onClick={() => onPageChange && onPageChange('users')}>
                            <span className="action-icon">👥</span>
                            <span className="action-text">إدارة المستخدمين</span>
                        </button>
                        <button className="quick-action-btn conversations" onClick={() => onPageChange && onPageChange('conversations')}>
                            <span className="action-icon">💬</span>
                            <span className="action-text">المحادثات</span>
                        </button>
                        <button className="quick-action-btn rooms" onClick={() => onPageChange && onPageChange('chat-rooms')}>
                            <span className="action-icon">🏠</span>
                            <span className="action-text">غرف المحادثة</span>
                        </button>
                        <button className="quick-action-btn reports" onClick={() => onPageChange && onPageChange('reports')}>
                            <span className="action-icon">⚠️</span>
                            <span className="action-text">البلاغات</span>
                            {reportsStats.pending > 0 && <span className="action-badge">{reportsStats.pending}</span>}
                        </button>
                        <button className="quick-action-btn settings" onClick={() => onPageChange && onPageChange('settings')}>
                            <span className="action-icon">⚙️</span>
                            <span className="action-text">الإعدادات</span>
                        </button>
                        <button className="quick-action-btn notification" onClick={() => setShowNotificationModal(true)}>
                            <span className="action-icon">📢</span>
                            <span className="action-text">إرسال إشعار</span>
                        </button>
                    </div>
                </div>
            )}

            {/* الإحصائيات */}
            {loading ? (
                <LoadingSpinner text="جاري تحميل الإحصائيات..." />
            ) : (
                <>
                    {/* ===== القسم 1: نظرة عامة ===== */}
                    <div className="stats-section">
                        <h3 className="section-title">📊 نظرة عامة</h3>
                        <div className="stats-grid">
                            <StatCard icon="👥" value={stats.totalUsers} label="إجمالي المستخدمين" color="purple" onClick={() => onPageChange && onPageChange('users')} />
                            <StatCard icon="✅" value={stats.activeUsers} label="مستخدمين نشطين" color="blue" onClick={() => onPageChange && onPageChange('users')} />
                            <StatCard icon="💬" value={conversationStats.totalConversations} label="إجمالي المحادثات" color="cyan" onClick={() => onPageChange && onPageChange('conversations')} />
                            <StatCard icon="📨" value={conversationStats.totalMessages} label="إجمالي الرسائل" color="pink" onClick={() => onPageChange && onPageChange('conversations')} />
                        </div>
                    </div>

                    {/* ===== القسم 2: المستخدمين والنشاط ===== */}
                    {isAdmin && (
                        <div className="stats-section">
                            <h3 className="section-title">👥 المستخدمين والنشاط</h3>
                            <div className="stats-grid">
                                <StatCard icon="🆕" value={stats.newUsers} label="مستخدمين جدد (7 أيام)" color="green" onClick={() => onPageChange && onPageChange('users')} />
                                <StatCard icon="🟢" value={stats.recentLogins} label="دخول مؤخراً (24 ساعة)" color="orange" onClick={() => onPageChange && onPageChange('users')} />
                                <StatCard icon="👑" value={premiumStats.active} label="مشتركين مميزين نشطين" color="gold" onClick={() => onPageChange && onPageChange('premium-users')} />
                                <StatCard icon="⚡" value={superLikeStats.total} label="Super Likes" color="violet" onClick={() => onPageChange && onPageChange('super-likes')} />
                            </div>
                        </div>
                    )}

                    {/* ===== القسم 3: الإشراف والبلاغات ===== */}
                    {isAdmin && (
                        <div className="stats-section">
                            <h3 className="section-title">🛡️ الإشراف والبلاغات</h3>
                            <div className="stats-grid">
                                <StatCard icon="⏳" value={reportsStats.pending || 0} label="بلاغات معلقة" color="yellow" onClick={() => onPageChange && onPageChange('reports')} />
                                <StatCard icon="✅" value={reportsStats.resolved || 0} label="بلاغات تم حلها" color="light-green" onClick={() => onPageChange && onPageChange('reports')} />
                                <StatCard
                                    icon={flaggedStats.last24h > 0 ? '🚨' : '✅'}
                                    value={flaggedStats.last24h}
                                    label="رسائل مُبلّغة (24 ساعة)"
                                    color={flaggedStats.last24h > 0 ? 'danger' : 'light-green'}
                                    onClick={() => onPageChange && onPageChange('flagged-messages')}
                                />
                                <StatCard icon="🏠" value={roomsStats.total || 0} label="غرف المحادثة" color="deep-purple" onClick={() => onPageChange && onPageChange('chat-rooms')} />
                            </div>
                        </div>
                    )}

                    {/* ===== القسم 4: الرسوم البيانية ===== */}
                    {isAdmin && (
                        <div className="charts-section">
                            <h3 className="section-title">📊 الرسوم البيانية</h3>
                            <div className="charts-grid">
                                {/* Bar Chart - توزيع المستخدمين */}
                                <div className="chart-card">
                                    <h4>توزيع المستخدمين</h4>
                                    <ResponsiveContainer width="100%" height={250}>
                                        <BarChart data={[
                                            { name: 'الإجمالي', value: stats.totalUsers, fill: '#6366f1' },
                                            { name: 'نشطين', value: stats.activeUsers, fill: '#22c55e' },
                                            { name: 'جدد (7 أيام)', value: stats.newUsers, fill: '#f59e0b' },
                                            { name: 'Premium', value: premiumStats.active, fill: '#ec4899' },
                                        ]}>
                                            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                            <YAxis tick={{ fontSize: 12 }} />
                                            <Tooltip />
                                            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                                {[
                                                    { fill: '#6366f1' },
                                                    { fill: '#22c55e' },
                                                    { fill: '#f59e0b' },
                                                    { fill: '#ec4899' },
                                                ].map((entry, index) => (
                                                    <Cell key={index} fill={entry.fill} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* Pie Chart - نوع المحادثات */}
                                {conversationStats.totalConversations > 0 && (
                                    <div className="chart-card">
                                        <h4>نوع المحادثات</h4>
                                        <ResponsiveContainer width="100%" height={250}>
                                            <PieChart>
                                                <Pie
                                                    data={[
                                                        { name: 'خاصة', value: conversationStats.privateConversations || 0 },
                                                        { name: 'جماعية', value: conversationStats.groupConversations || 0 },
                                                    ]}
                                                    cx="50%" cy="50%"
                                                    innerRadius={55} outerRadius={85}
                                                    paddingAngle={4}
                                                    dataKey="value"
                                                    label={({ name, value }) => `${name} (${value})`}
                                                >
                                                    <Cell fill="#6366f1" />
                                                    <Cell fill="#f59e0b" />
                                                </Pie>
                                                <Tooltip />
                                                <Legend />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}

                                {/* Bar Chart - الاشتراكات Premium */}
                                {premiumStats.total > 0 && (
                                    <div className="chart-card">
                                        <h4>توزيع الاشتراكات</h4>
                                        <ResponsiveContainer width="100%" height={250}>
                                            <BarChart data={[
                                                { name: 'أسبوعي', value: premiumStats.byPlan?.weekly || 0 },
                                                { name: 'شهري', value: premiumStats.byPlan?.monthly || 0 },
                                                { name: 'ربع سنوي', value: premiumStats.byPlan?.quarterly || 0 },
                                            ]}>
                                                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                                <YAxis tick={{ fontSize: 12 }} />
                                                <Tooltip />
                                                <Bar dataKey="value" fill="#ec4899" radius={[6, 6, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                        <div className="chart-footer">
                                            <span>الإيراد الشهري المقدر: <strong>${premiumStats.estimatedMonthlyRevenue || 0}</strong></span>
                                        </div>
                                    </div>
                                )}

                                {/* Pie Chart - البلاغات */}
                                {(reportsStats.total > 0 || flaggedStats.total > 0) && (
                                    <div className="chart-card">
                                        <h4>حالة البلاغات والمخالفات</h4>
                                        <ResponsiveContainer width="100%" height={250}>
                                            <PieChart>
                                                <Pie
                                                    data={[
                                                        { name: 'معلقة', value: reportsStats.pending || 0 },
                                                        { name: 'قيد المراجعة', value: reportsStats.reviewed || 0 },
                                                        { name: 'تم الحل', value: reportsStats.resolved || 0 },
                                                    ].filter(d => d.value > 0)}
                                                    cx="50%" cy="50%"
                                                    innerRadius={55} outerRadius={85}
                                                    paddingAngle={4}
                                                    dataKey="value"
                                                    label={({ name, value }) => `${name} (${value})`}
                                                >
                                                    <Cell fill="#f59e0b" />
                                                    <Cell fill="#3b82f6" />
                                                    <Cell fill="#22c55e" />
                                                </Pie>
                                                <Tooltip />
                                                <Legend />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* أحدث المستخدمين */}
            {latestUsers.length > 0 && (
                <div className="latest-users-section">
                    <h3>أحدث المستخدمين 📋</h3>
                    <div className="users-list">
                        {latestUsers.map((latestUser, index) => (
                            <div key={latestUser._id || index} className="user-item">
                                <img
                                    src={latestUser.profileImage ? getImageUrl(latestUser.profileImage) : getDefaultAvatar(latestUser.name)}
                                    alt={latestUser.name}
                                    className="user-avatar"
                                    onError={(e) => {
                                        e.target.onerror = null;
                                        e.target.src = getDefaultAvatar(latestUser.name);
                                    }}
                                />
                                <div className="user-details">
                                    <h4>{latestUser.name}</h4>
                                    <p>{latestUser.email}</p>
                                    <span className="user-date">
                                        {formatDateLong(latestUser.createdAt)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Notification Modal */}
            {showNotificationModal && (
                <div className="modal-overlay" onClick={() => setShowNotificationModal(false)}>
                    <div className="notification-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>📢 إرسال إشعار جديد</h3>
                            <button
                                className="close-modal-btn"
                                onClick={() => setShowNotificationModal(false)}
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSendNotification} className="notification-form">
                            <div className="form-group">
                                <label>العنوان *</label>
                                <input
                                    type="text"
                                    value={notificationData.title}
                                    onChange={(e) => setNotificationData({
                                        ...notificationData,
                                        title: e.target.value
                                    })}
                                    placeholder="عنوان الإشعار"
                                    maxLength={100}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>المحتوى *</label>
                                <textarea
                                    value={notificationData.body}
                                    onChange={(e) => setNotificationData({
                                        ...notificationData,
                                        body: e.target.value
                                    })}
                                    placeholder="محتوى الإشعار"
                                    maxLength={500}
                                    rows={4}
                                    required
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>نوع الإشعار</label>
                                    <select
                                        value={notificationData.type}
                                        onChange={(e) => setNotificationData({
                                            ...notificationData,
                                            type: e.target.value
                                        })}
                                    >
                                        <option value="general">عام</option>
                                        <option value="message">رسالة</option>
                                        <option value="announcement">إعلان</option>
                                        <option value="report">بلاغ</option>
                                        <option value="system">نظام</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label>المستقبلون</label>
                                    <select
                                        value={notificationData.recipients}
                                        onChange={(e) => setNotificationData({
                                            ...notificationData,
                                            recipients: e.target.value
                                        })}
                                    >
                                        <option value="all">جميع المستخدمين</option>
                                        <option value="specific">مستخدمون محددون</option>
                                    </select>
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>الجنس</label>
                                    <select
                                        value={notificationData.targetGender}
                                        onChange={(e) => setNotificationData({
                                            ...notificationData,
                                            targetGender: e.target.value
                                        })}
                                    >
                                        <option value="all">الكل</option>
                                        <option value="male">ذكور فقط</option>
                                        <option value="female">إناث فقط</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>نوع الاشتراك</label>
                                    <select
                                        value={notificationData.targetPremium}
                                        onChange={(e) => setNotificationData({
                                            ...notificationData,
                                            targetPremium: e.target.value
                                        })}
                                    >
                                        <option value="all">الكل</option>
                                        <option value="premium">مشتركين Premium فقط</option>
                                        <option value="free">مستخدمين مجانيين فقط</option>
                                    </select>
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="cancel-btn"
                                    onClick={() => setShowNotificationModal(false)}
                                    disabled={sending}
                                >
                                    إلغاء
                                </button>
                                <button
                                    type="submit"
                                    className="submit-btn"
                                    disabled={sending}
                                >
                                    {sending ? 'جاري الإرسال...' : 'إرسال الإشعار'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Dashboard;
