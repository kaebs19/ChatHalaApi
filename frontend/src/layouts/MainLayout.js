import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import Dashboard from '../pages/Dashboard';
import UsersManagement from '../pages/UsersManagement';
import Conversations from '../pages/Conversations';
import UserDetail from '../pages/UserDetail';
import ReportsManagement from '../pages/ReportsManagement';
import ConversationMessages from '../pages/ConversationMessages';
import Stats from '../pages/Stats';
import Settings from '../pages/Settings';
import Profile from '../pages/Profile';
import Notifications from '../pages/Notifications';

import Appeals from '../pages/Appeals';
import BannedDevices from '../pages/BannedDevices';
import BannedIPs from '../pages/BannedIPs';
import AdminActivity from '../pages/AdminActivity';
import { getReportsStats, getNotifications, getAppeals } from '../services/api';
import socketService from '../services/socket';
import { useToast } from '../components/Toast';
import config from '../config';
import './MainLayout.css';

function MainLayout({ onLogout, user: initialUser }) {
    const [currentPage, setCurrentPage] = useState('dashboard');
    const [selectedUserId, setSelectedUserId] = useState(null);
    const [previousPage, setPreviousPage] = useState('users');
    const [viewingConversationFromReport, setViewingConversationFromReport] = useState(null);
    const [pendingReportsCount, setPendingReportsCount] = useState(0);
    const [pendingAppealsCount, setPendingAppealsCount] = useState(0);
    const [unreadNotifications, setUnreadNotifications] = useState(0);
    const [user, setUser] = useState(initialUser);
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
        // Fetch reports stats every minute if admin
        if (user?.role === 'admin') {
            fetchReportsCount();
            fetchNotificationsCount();
            fetchAppealsCount();
            const interval = setInterval(() => {
                fetchReportsCount();
                fetchNotificationsCount();
                fetchAppealsCount();
            }, 60000); // Update every minute
            return () => clearInterval(interval);
        }
    }, [user]);

    // Socket listener لاستئناف جديد أو رسالة — زيادة فورية للـ badge
    useEffect(() => {
        if (user?.role !== 'admin') return;
        // انتظر حتى يتصل الـ socket
        const attach = () => {
            const sock = socketService.socket;
            if (!sock) return false;
            sock.on('appeal-submitted', (data) => {
                console.log('📝 استئناف جديد', data);
                setPendingAppealsCount((c) => c + 1);
                if (showToast) {
                    showToast(`📝 استئناف جديد من ${data.userName || 'مستخدم'}`, 'info');
                }
            });
            sock.on('appeal-message', (data) => {
                console.log('💬 رسالة استئناف جديدة', data);
                if (showToast) {
                    showToast(`💬 رد جديد من ${data.senderName || 'مستخدم'} على استئناف`, 'info');
                }
            });
            return true;
        };

        if (!attach()) {
            const t = setInterval(() => { if (attach()) clearInterval(t); }, 500);
            setTimeout(() => clearInterval(t), 10000);
        }

        return () => {
            const sock = socketService.socket;
            if (sock) {
                sock.off('appeal-submitted');
                sock.off('appeal-message');
            }
        };
    }, [user, showToast]);

    const fetchReportsCount = async () => {
        try {
            const response = await getReportsStats();
            if (response.success) {
                setPendingReportsCount(response.data.pending || 0);
            }
        } catch (error) {
            console.error('خطأ في جلب عدد البلاغات:', error);
        }
    };

    const fetchAppealsCount = async () => {
        try {
            const response = await getAppeals({ status: 'pending', limit: 1 });
            if (response.success) {
                setPendingAppealsCount(response.count || 0);
            }
        } catch (error) {
            console.error('خطأ في جلب عدد الاستئنافات:', error);
        }
    };

    const fetchNotificationsCount = async () => {
        try {
            const response = await getNotifications({ unreadOnly: true, limit: 1 });
            if (response.success) {
                setUnreadNotifications(response.data.unreadCount || 0);
            }
        } catch (error) {
            console.error('خطأ في جلب عدد الإشعارات:', error);
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
                showToast('تم إرسال الإشعار بنجاح', 'success');
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

    const handleUserUpdate = (updatedUser) => {
        setUser(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
    };

    const handleViewUserDetail = (userId) => {
        setSelectedUserId(userId);
        setPreviousPage(currentPage);
        setCurrentPage('user-detail');
    };

    const handleBackFromUserDetail = () => {
        setSelectedUserId(null);
        setCurrentPage(previousPage);
    };

    const handleViewConversation = (conversationId) => {
        setViewingConversationFromReport(conversationId);
        setCurrentPage('report-conversation');
    };

    const handleBackFromReportConversation = () => {
        setViewingConversationFromReport(null);
        setCurrentPage('reports');
    };

    const renderPage = () => {
        switch (currentPage) {
            case 'dashboard':
                return <Dashboard user={user} onPageChange={setCurrentPage} />;
            case 'users':
                return <UsersManagement onViewDetail={handleViewUserDetail} initialTab="users" />;
            case 'premium-users':
                return <UsersManagement onViewDetail={handleViewUserDetail} initialTab="premium" />;
            case 'conversations':
                return <Conversations onViewUserDetail={handleViewUserDetail} />;
            case 'reports':
                return <ReportsManagement initialTab="reports" onViewUserDetail={handleViewUserDetail} onViewConversation={handleViewConversation} />;
            case 'flagged-messages':
                return <ReportsManagement initialTab="flagged" onViewUserDetail={handleViewUserDetail} onViewConversation={handleViewConversation} />;
            case 'report-conversation':
                return <ConversationMessages conversationId={viewingConversationFromReport} onBack={handleBackFromReportConversation} onViewUser={handleViewUserDetail} />;
            case 'stats':
                return <Stats />;
            case 'settings':
                return <Settings />;
            case 'profile':
                return <Profile user={user} onUserUpdate={handleUserUpdate} />;
            case 'notifications':
                return <Notifications onNotificationRead={fetchNotificationsCount} />;
            case 'banned-words':
                return <ReportsManagement initialTab="banned-words" onViewUserDetail={handleViewUserDetail} onViewConversation={handleViewConversation} />;
            case 'name-blocking':
                return <ReportsManagement initialTab="name-blocking" onViewUserDetail={handleViewUserDetail} onViewConversation={handleViewConversation} />;
            case 'appeals':
                return <Appeals onViewDetail={handleViewUserDetail} />;
            case 'banned-devices':
                return <BannedDevices />;
            case 'banned-ips':
                return <BannedIPs onViewDetail={handleViewUserDetail} />;
            case 'admin-activity':
                return <AdminActivity onViewDetail={handleViewUserDetail} />;
            case 'user-detail':
                return <UserDetail userId={selectedUserId} onBack={handleBackFromUserDetail} />;
            default:
                return <Dashboard user={user} onPageChange={setCurrentPage} />;
        }
    };

    return (
        <div className="main-layout">
            <Sidebar
                currentPage={currentPage}
                onPageChange={(page) => {
                    setCurrentPage(page);
                    // صفر العدّاد عند فتح صفحة الاستئنافات
                    if (page === 'appeals') {
                        setPendingAppealsCount(0);
                        // إعادة جلب بعد ثانية للتأكد من المزامنة مع السيرفر
                        setTimeout(() => fetchAppealsCount(), 3000);
                    }
                }}
                user={user}
                onProfileClick={() => setCurrentPage('profile')}
                badges={{ appeals: pendingAppealsCount, reports: pendingReportsCount }}
            />
            
            <div className="main-content">
                <header className="top-header">
                    <h1>
                        {currentPage === 'dashboard' && '📊 لوحة التحكم'}
                        {(currentPage === 'users' || currentPage === 'premium-users') && '👥 إدارة المستخدمين'}
                        {currentPage === 'conversations' && '💬 المحادثات'}
                        {(currentPage === 'reports' || currentPage === 'flagged-messages' || currentPage === 'banned-words' || currentPage === 'name-blocking') && '🛡️ الإشراف والمخالفات'}
                        {currentPage === 'stats' && '📈 الإحصائيات'}
                        {currentPage === 'settings' && '⚙️ الإعدادات'}
                        {currentPage === 'profile' && '👤 الملف الشخصي'}
                        {currentPage === 'notifications' && '🔔 الإشعارات'}
                        {currentPage === 'appeals' && '📝 طلبات الاستئناف'}
                        {currentPage === 'banned-devices' && '📵 الأجهزة المحظورة'}
                        {currentPage === 'banned-ips' && '🌐 IPs المحظورة'}
                        {currentPage === 'admin-activity' && '📜 سجل نشاط الأدمن'}
                        {currentPage === 'user-detail' && '👤 تفاصيل المستخدم'}
                        {currentPage === 'report-conversation' && '💬 رسائل المحادثة'}
                    </h1>
                    <div className="header-actions">
                        {/* زر إرسال إشعار */}
                        {user?.role === 'admin' && (
                            <button
                                className="header-icon-btn send-notification-btn"
                                onClick={() => setShowNotificationModal(true)}
                                title="إرسال إشعار"
                            >
                                <span className="notification-icon">📢</span>
                            </button>
                        )}

                        {/* زر الإشعارات */}
                        <button
                            className="header-icon-btn notifications-btn"
                            onClick={() => setCurrentPage('notifications')}
                            title="الإشعارات"
                        >
                            <span className="notification-icon">🔔</span>
                            {unreadNotifications > 0 && (
                                <span className="notification-badge">{unreadNotifications}</span>
                            )}
                        </button>

                        {/* زر البلاغات المعلقة */}
                        {user?.role === 'admin' && pendingReportsCount > 0 && (
                            <button
                                className="header-icon-btn reports-notification-btn"
                                onClick={() => setCurrentPage('reports')}
                                title={`${pendingReportsCount} بلاغات في انتظار المراجعة`}
                            >
                                <span className="notification-icon">⚠️</span>
                                <span className="notification-badge warning">{pendingReportsCount}</span>
                            </button>
                        )}

                        <button onClick={onLogout} className="logout-btn">
                            تسجيل الخروج 🚪
                        </button>
                    </div>
                </header>

                <div className="page-content">
                    {renderPage()}
                </div>
            </div>

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

export default MainLayout;
