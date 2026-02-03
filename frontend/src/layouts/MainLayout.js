import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import Dashboard from '../pages/Dashboard';
import Users from '../pages/Users';
import Conversations from '../pages/Conversations';
import ChatRooms from '../pages/ChatRooms';
import UserDetail from '../pages/UserDetail';
import Reports from '../pages/Reports';
import Stats from '../pages/Stats';
import Settings from '../pages/Settings';
import Profile from '../pages/Profile';
import Notifications from '../pages/Notifications';
import BannedWords from '../pages/BannedWords';
import { getReportsStats, getNotifications } from '../services/api';
import './MainLayout.css';

function MainLayout({ onLogout, user: initialUser }) {
    const [currentPage, setCurrentPage] = useState('dashboard');
    const [selectedUserId, setSelectedUserId] = useState(null);
    const [pendingReportsCount, setPendingReportsCount] = useState(0);
    const [unreadNotifications, setUnreadNotifications] = useState(0);
    const [user, setUser] = useState(initialUser);

    useEffect(() => {
        // Fetch reports stats every minute if admin
        if (user?.role === 'admin') {
            fetchReportsCount();
            fetchNotificationsCount();
            const interval = setInterval(() => {
                fetchReportsCount();
                fetchNotificationsCount();
            }, 60000); // Update every minute
            return () => clearInterval(interval);
        }
    }, [user]);

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

    const handleUserUpdate = (updatedUser) => {
        setUser(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
    };

    const handleViewUserDetail = (userId) => {
        setSelectedUserId(userId);
        setCurrentPage('user-detail');
    };

    const handleBackFromUserDetail = () => {
        setSelectedUserId(null);
        setCurrentPage('users');
    };

    const renderPage = () => {
        switch (currentPage) {
            case 'dashboard':
                return <Dashboard user={user} onPageChange={setCurrentPage} />;
            case 'users':
                return <Users onViewDetail={handleViewUserDetail} />;
            case 'conversations':
                return <Conversations />;
            case 'chat-rooms':
                return <ChatRooms />;
            case 'reports':
                return <Reports />;
            case 'stats':
                return <Stats />;
            case 'settings':
                return <Settings />;
            case 'profile':
                return <Profile user={user} onUserUpdate={handleUserUpdate} />;
            case 'notifications':
                return <Notifications onNotificationRead={fetchNotificationsCount} />;
            case 'banned-words':
                return <BannedWords />;
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
                onPageChange={setCurrentPage}
                user={user}
                onProfileClick={() => setCurrentPage('profile')}
            />
            
            <div className="main-content">
                <header className="top-header">
                    <h1>
                        {currentPage === 'dashboard' && '📊 لوحة التحكم'}
                        {currentPage === 'users' && '👥 إدارة المستخدمين'}
                        {currentPage === 'conversations' && '💬 المحادثات'}
                        {currentPage === 'chat-rooms' && '🏠 غرف المحادثة'}
                        {currentPage === 'reports' && '⚠️ البلاغات'}
                        {currentPage === 'stats' && '📈 الإحصائيات'}
                        {currentPage === 'settings' && '⚙️ الإعدادات'}
                        {currentPage === 'profile' && '👤 الملف الشخصي'}
                        {currentPage === 'notifications' && '🔔 الإشعارات'}
                        {currentPage === 'banned-words' && '🚫 الكلمات المحظورة'}
                        {currentPage === 'user-detail' && '👤 تفاصيل المستخدم'}
                    </h1>
                    <div className="header-actions">
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
        </div>
    );
}

export default MainLayout;
