import React, { useState, useEffect } from 'react';
import { getUserActivity } from '../services/api';
import { useToast } from '../components/Toast';
import './UserDetail.css';

function UserDetail({ userId, onBack }) {
    const [loading, setLoading] = useState(true);
    const [userData, setUserData] = useState(null);
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

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('ar-SA', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
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
                <div className="user-avatar-large">
                    {user.name.charAt(0)}
                </div>
                <div className="user-info-details">
                    <h3>{user.name}</h3>
                    <p className="user-email">{user.email}</p>
                    <span className={`role-badge ${user.role}`}>
                        {user.role === 'admin' ? 'مدير' : 'مستخدم'}
                    </span>
                    <p className="user-joined">
                        انضم في: {formatDate(user.createdAt)}
                    </p>
                </div>
            </div>

            {/* Activity Stats */}
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
            </div>

            {/* Conversations List */}
            <div className="conversations-section">
                <h3>💬 المحادثات ({conversations.length})</h3>
                {conversations.length === 0 ? (
                    <p className="empty-message">لا توجد محادثات لهذا المستخدم</p>
                ) : (
                    <div className="conversations-list">
                        {conversations.map((conv) => (
                            <div key={conv._id} className="conversation-item">
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
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Recent Messages */}
            <div className="messages-section">
                <h3>📨 آخر الرسائل ({recentMessages.length})</h3>
                {recentMessages.length === 0 ? (
                    <p className="empty-message">لا توجد رسائل حديثة</p>
                ) : (
                    <div className="messages-list">
                        {recentMessages.map((msg) => (
                            <div key={msg._id} className="message-item">
                                <div className="message-header">
                                    <span className={`message-type ${msg.type}`}>
                                        {msg.type === 'text' ? '📝' : '📎'}
                                    </span>
                                    <span className={`message-status ${msg.status}`}>
                                        {msg.status === 'read' && '✓✓'}
                                        {msg.status === 'delivered' && '✓'}
                                        {msg.status === 'sent' && '○'}
                                    </span>
                                </div>
                                <p className="message-content">{msg.content}</p>
                                <p className="message-date">
                                    {formatDate(msg.createdAt)}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default UserDetail;
