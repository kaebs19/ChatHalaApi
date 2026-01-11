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
import { getReportsStats } from '../services/api';
import './MainLayout.css';

function MainLayout({ onLogout, user }) {
    const [currentPage, setCurrentPage] = useState('dashboard');
    const [selectedUserId, setSelectedUserId] = useState(null);
    const [pendingReportsCount, setPendingReportsCount] = useState(0);

    useEffect(() => {
        // Fetch reports stats every minute if admin
        if (user?.role === 'admin') {
            fetchReportsCount();
            const interval = setInterval(fetchReportsCount, 60000); // Update every minute
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
                        {currentPage === 'user-detail' && '👤 تفاصيل المستخدم'}
                    </h1>
                    <div className="header-actions">
                        {user?.role === 'admin' && pendingReportsCount > 0 && (
                            <button
                                className="reports-notification-btn"
                                onClick={() => setCurrentPage('reports')}
                                title={`${pendingReportsCount} بلاغات في انتظار المراجعة`}
                            >
                                <span className="notification-icon">🔔</span>
                                <span className="notification-badge">{pendingReportsCount}</span>
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
