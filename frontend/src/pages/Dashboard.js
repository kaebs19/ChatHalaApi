import React, { useState, useEffect } from 'react';
import { getDashboardStats, getConversationsStats, getReportsStats, getAllChatRooms } from '../services/api';
import { useToast } from '../components/Toast';
import LoadingSpinner from '../components/LoadingSpinner';
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
    const [latestUsers, setLatestUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showNotificationModal, setShowNotificationModal] = useState(false);
    const [notificationData, setNotificationData] = useState({
        title: '',
        body: '',
        type: 'general',
        recipients: 'all'
    });
    const [sending, setSending] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            setLoading(true);

            // جلب إحصائيات المستخدمين
            const userStatsResponse = await getDashboardStats();
            if (userStatsResponse.success) {
                setStats(userStatsResponse.data.stats);
                setLatestUsers(userStatsResponse.data.latestUsers);
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
            // استخدم بيانات تجريبية إذا فشل
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

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('ar-SA', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
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
                    recipients: 'all'
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

    return (
        <div className="dashboard-content">
            {error && <div className="error-banner">{error}</div>}

            <div className="welcome-section">
                <div className="welcome-text">
                    <h2>مرحباً {user?.name || 'بك'} 👋</h2>
                    <p>هذه لوحة التحكم الرئيسية لتطبيق HalaChat</p>
                </div>
                {user?.role === 'admin' && (
                    <button
                        className="send-notification-btn"
                        onClick={() => setShowNotificationModal(true)}
                    >
                        📢 إرسال إشعار
                    </button>
                )}
            </div>

            {/* الإجراءات السريعة */}
            {user?.role === 'admin' && (
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

            {/* إحصائيات */}
            {loading ? (
                <LoadingSpinner text="جاري تحميل الإحصائيات..." />
            ) : (
                <>
                    <h3 className="section-title">📊 إحصائيات المستخدمين</h3>
                    <div className="stats-grid">
                        <div className="stat-card purple clickable" onClick={() => onPageChange && onPageChange('users')}>
                            <div className="stat-icon">👥</div>
                            <div className="stat-info">
                                <h3>{stats.totalUsers}</h3>
                                <p>إجمالي المستخدمين</p>
                            </div>
                        </div>

                        <div className="stat-card blue clickable" onClick={() => onPageChange && onPageChange('users')}>
                            <div className="stat-icon">✅</div>
                            <div className="stat-info">
                                <h3>{stats.activeUsers}</h3>
                                <p>مستخدمين نشطين</p>
                            </div>
                        </div>

                        <div className="stat-card green clickable" onClick={() => onPageChange && onPageChange('users')}>
                            <div className="stat-icon">🆕</div>
                            <div className="stat-info">
                                <h3>{stats.newUsers}</h3>
                                <p>مستخدمين جدد (7 أيام)</p>
                            </div>
                        </div>

                        <div className="stat-card orange clickable" onClick={() => onPageChange && onPageChange('users')}>
                            <div className="stat-icon">🟢</div>
                            <div className="stat-info">
                                <h3>{stats.recentLogins}</h3>
                                <p>دخول مؤخراً (24 ساعة)</p>
                            </div>
                        </div>
                    </div>

                    {/* إحصائيات المحادثات */}
                    {user?.role === 'admin' && conversationStats.totalConversations > 0 && (
                        <>
                            <h3 className="section-title">💬 إحصائيات المحادثات</h3>
                            <div className="stats-grid">
                                <div className="stat-card cyan clickable" onClick={() => onPageChange && onPageChange('conversations')}>
                                    <div className="stat-icon">💬</div>
                                    <div className="stat-info">
                                        <h3>{conversationStats.totalConversations}</h3>
                                        <p>إجمالي المحادثات</p>
                                    </div>
                                </div>

                                <div className="stat-card teal clickable" onClick={() => onPageChange && onPageChange('conversations')}>
                                    <div className="stat-icon">✨</div>
                                    <div className="stat-info">
                                        <h3>{conversationStats.activeConversations}</h3>
                                        <p>محادثات نشطة</p>
                                    </div>
                                </div>

                                <div className="stat-card pink clickable" onClick={() => onPageChange && onPageChange('conversations')}>
                                    <div className="stat-icon">📨</div>
                                    <div className="stat-info">
                                        <h3>{conversationStats.totalMessages}</h3>
                                        <p>إجمالي الرسائل</p>
                                    </div>
                                </div>

                                <div className="stat-card indigo clickable" onClick={() => onPageChange && onPageChange('conversations')}>
                                    <div className="stat-icon">👤</div>
                                    <div className="stat-info">
                                        <h3>{conversationStats.privateConversations}</h3>
                                        <p>محادثات خاصة</p>
                                    </div>
                                </div>

                                <div className="stat-card amber clickable" onClick={() => onPageChange && onPageChange('conversations')}>
                                    <div className="stat-icon">👥</div>
                                    <div className="stat-info">
                                        <h3>{conversationStats.groupConversations}</h3>
                                        <p>محادثات جماعية</p>
                                    </div>
                                </div>
                            </div>

                            {/* إحصائيات البلاغات والغرف */}
                            <h3 className="section-title">⚠️ البلاغات وغرف المحادثة</h3>
                            <div className="stats-grid">
                                <div className="stat-card red clickable" onClick={() => onPageChange && onPageChange('reports')}>
                                    <div className="stat-icon">📝</div>
                                    <div className="stat-info">
                                        <h3>{reportsStats.total || 0}</h3>
                                        <p>إجمالي البلاغات</p>
                                    </div>
                                </div>

                                <div className="stat-card yellow clickable" onClick={() => onPageChange && onPageChange('reports')}>
                                    <div className="stat-icon">⏳</div>
                                    <div className="stat-info">
                                        <h3>{reportsStats.pending || 0}</h3>
                                        <p>بلاغات معلقة</p>
                                    </div>
                                </div>

                                <div className="stat-card deep-purple clickable" onClick={() => onPageChange && onPageChange('chat-rooms')}>
                                    <div className="stat-icon">🏠</div>
                                    <div className="stat-info">
                                        <h3>{roomsStats.total || 0}</h3>
                                        <p>غرف المحادثة</p>
                                    </div>
                                </div>

                                <div className="stat-card light-green clickable" onClick={() => onPageChange && onPageChange('reports')}>
                                    <div className="stat-icon">✅</div>
                                    <div className="stat-info">
                                        <h3>{reportsStats.resolved || 0}</h3>
                                        <p>بلاغات تم حلها</p>
                                    </div>
                                </div>
                            </div>

                            {/* مخطط المحادثات */}
                            <div className="charts-section">
                                <h3 className="section-title">📊 التوزيع البياني</h3>
                                <div className="charts-grid">
                                    {/* Progress Bars */}
                                    <div className="chart-card">
                                        <h4>توزيع المستخدمين</h4>
                                        <div className="progress-bars">
                                            <div className="progress-item">
                                                <div className="progress-label">
                                                    <span>مستخدمين نشطين</span>
                                                    <span>{stats.activeUsers}</span>
                                                </div>
                                                <div className="progress-bar">
                                                    <div
                                                        className="progress-fill blue"
                                                        style={{width: `${(stats.activeUsers / stats.totalUsers * 100) || 0}%`}}
                                                    ></div>
                                                </div>
                                            </div>
                                            <div className="progress-item">
                                                <div className="progress-label">
                                                    <span>مستخدمين جدد</span>
                                                    <span>{stats.newUsers}</span>
                                                </div>
                                                <div className="progress-bar">
                                                    <div
                                                        className="progress-fill green"
                                                        style={{width: `${(stats.newUsers / stats.totalUsers * 100) || 0}%`}}
                                                    ></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Pie Chart (CSS) */}
                                    <div className="chart-card">
                                        <h4>نوع المحادثات</h4>
                                        <div className="pie-chart-container">
                                            <div className="pie-chart" style={{
                                                background: `conic-gradient(
                                                    #6366f1 0deg ${(conversationStats.privateConversations / conversationStats.totalConversations * 360) || 0}deg,
                                                    #f59e0b ${(conversationStats.privateConversations / conversationStats.totalConversations * 360) || 0}deg 360deg
                                                )`
                                            }}>
                                                <div className="pie-center">
                                                    <span>{conversationStats.totalConversations}</span>
                                                    <small>محادثة</small>
                                                </div>
                                            </div>
                                            <div className="pie-legend">
                                                <div className="legend-item">
                                                    <span className="legend-color indigo"></span>
                                                    <span>خاصة ({conversationStats.privateConversations})</span>
                                                </div>
                                                <div className="legend-item">
                                                    <span className="legend-color amber"></span>
                                                    <span>جماعية ({conversationStats.groupConversations})</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
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
                                        {formatDate(latestUser.createdAt)}
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
