import React, { useState, useEffect } from 'react';
import {
    getAllConversations,
    deleteConversation,
    toggleConversationActive,
    lockConversation,
    deleteConversationMessages,
    createGroup
} from '../services/api';
import { useToast } from '../components/Toast';
import LoadingSpinner from '../components/LoadingSpinner';
import ConversationDetail from './ConversationDetail';
import './Conversations.css';

function Conversations() {
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [selectedConv, setSelectedConv] = useState(null);
    const [showActionsModal, setShowActionsModal] = useState(false);
    const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
    const [viewingConversationId, setViewingConversationId] = useState(null);
    const [groupData, setGroupData] = useState({
        title: '',
        description: '',
        participants: [],
        groupImage: ''
    });
    const [creatingGroup, setCreatingGroup] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        fetchConversations();
    }, [filterType, filterStatus]);

    const fetchConversations = async () => {
        try {
            setLoading(true);
            const filters = {};
            if (filterType !== 'all') filters.type = filterType;
            if (filterStatus !== 'all') filters.isActive = filterStatus === 'active';

            const response = await getAllConversations(1, 100, filters);
            if (response.success) {
                setConversations(response.data.conversations);
            }
        } catch (err) {
            console.error('خطأ في جلب المحادثات:', err);
            showToast('فشل تحميل المحادثات', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleToggleActive = async (convId) => {
        try {
            const response = await toggleConversationActive(convId);
            if (response.success) {
                setConversations(conversations.map(c =>
                    c._id === convId ? { ...c, isActive: !c.isActive } : c
                ));
                showToast(response.message, 'success');
            }
        } catch (err) {
            showToast('فشل تحديث المحادثة', 'error');
        }
    };

    const handleLock = async (convId) => {
        try {
            const response = await lockConversation(convId);
            if (response.success) {
                showToast(response.message, 'success');
                fetchConversations();
            }
        } catch (err) {
            showToast('فشل قفل/فتح المحادثة', 'error');
        }
    };

    const handleDeleteMessages = async (convId) => {
        if (!window.confirm('هل أنت متأكد من حذف جميع رسائل هذه المحادثة؟')) return;

        try {
            const response = await deleteConversationMessages(convId);
            if (response.success) {
                showToast(response.message, 'success');
                fetchConversations();
            }
        } catch (err) {
            showToast('فشل حذف الرسائل', 'error');
        }
    };

    const handleDelete = async (convId) => {
        if (!window.confirm('هل أنت متأكد من حذف هذه المحادثة نهائياً؟')) return;

        try {
            const response = await deleteConversation(convId);
            if (response.success) {
                setConversations(conversations.filter(c => c._id !== convId));
                showToast('تم حذف المحادثة', 'success');
            }
        } catch (err) {
            showToast('فشل حذف المحادثة', 'error');
        }
    };

    const openActionsModal = (conv) => {
        setSelectedConv(conv);
        setShowActionsModal(true);
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('ar-SA', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const handleViewDetails = (convId) => {
        setViewingConversationId(convId);
    };

    const handleBackFromDetails = () => {
        setViewingConversationId(null);
        fetchConversations();
    };

    const handleCreateGroup = async () => {
        if (!groupData.title.trim()) {
            showToast('يرجى إدخال اسم القروب', 'error');
            return;
        }

        if (groupData.participants.length < 2) {
            showToast('يجب إضافة عضوين على الأقل', 'error');
            return;
        }

        try {
            setCreatingGroup(true);
            const response = await createGroup(groupData);
            if (response.success) {
                showToast('تم إنشاء القروب بنجاح', 'success');
                setShowCreateGroupModal(false);
                setGroupData({
                    title: '',
                    description: '',
                    participants: [],
                    groupImage: ''
                });
                fetchConversations();
            }
        } catch (err) {
            showToast(err.response?.data?.message || 'فشل إنشاء القروب', 'error');
        } finally {
            setCreatingGroup(false);
        }
    };

    const handleGroupDataChange = (field, value) => {
        setGroupData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    // إذا كنا نعرض تفاصيل محادثة
    if (viewingConversationId) {
        return <ConversationDetail conversationId={viewingConversationId} onBack={handleBackFromDetails} />;
    }

    return (
        <div className="conversations-page">
            {/* Header with Filters */}
            <div className="conversations-header">
                <div className="header-actions">
                    <button
                        className="create-group-btn"
                        onClick={() => setShowCreateGroupModal(true)}
                    >
                        + إنشاء قروب
                    </button>
                    <button className="refresh-btn" onClick={fetchConversations}>
                        تحديث 🔄
                    </button>
                </div>

                <div className="filters">
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                    >
                        <option value="all">جميع الأنواع</option>
                        <option value="private">محادثات خاصة</option>
                        <option value="group">قروبات</option>
                    </select>

                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                    >
                        <option value="all">جميع الحالات</option>
                        <option value="active">نشطة</option>
                        <option value="inactive">غير نشطة</option>
                    </select>
                </div>
            </div>

            {/* Conversations List */}
            {loading ? (
                <LoadingSpinner text="جاري تحميل المحادثات..." />
            ) : conversations.length === 0 ? (
                <div className="no-conversations">
                    <p>لا توجد محادثات 💬</p>
                </div>
            ) : (
                <div className="conversations-grid">
                    {conversations.map((conv) => (
                        <div key={conv._id} className={`conversation-card ${conv.type}`}>
                            <div className="card-header">
                                <div className="conv-title-section">
                                    <h3>{conv.title}</h3>
                                    <span className={`conv-type ${conv.type}`}>
                                        {conv.type === 'private' ? '👤 خاصة' : '👥 قروب'}
                                    </span>
                                </div>
                                <div className="conv-status-badges">
                                    {conv.isLocked && (
                                        <span className="badge locked">🔒 مقفل</span>
                                    )}
                                    <span className={`badge ${conv.isActive ? 'active' : 'inactive'}`}>
                                        {conv.isActive ? '● نشط' : '○ غير نشط'}
                                    </span>
                                </div>
                            </div>

                            <div className="card-body">
                                <div className="conv-meta">
                                    <div className="meta-item">
                                        <span className="icon">👥</span>
                                        <span>{conv.metadata?.totalParticipants || 0} مشارك</span>
                                    </div>
                                    <div className="meta-item">
                                        <span className="icon">📨</span>
                                        <span>{conv.metadata?.totalMessages || 0} رسالة</span>
                                    </div>
                                </div>

                                <div className="participants-list">
                                    {conv.participants?.slice(0, 3).map((p, i) => (
                                        <span key={i} className="participant-name">
                                            {p.name}
                                        </span>
                                    ))}
                                    {conv.participants?.length > 3 && (
                                        <span className="more-participants">
                                            +{conv.participants.length - 3}
                                        </span>
                                    )}
                                </div>

                                <div className="conv-date">
                                    آخر تحديث: {formatDate(conv.updatedAt)}
                                </div>
                            </div>

                            <div className="card-footer">
                                <button
                                    className="quick-action-btn"
                                    onClick={() => handleToggleActive(conv._id)}
                                    title={conv.isActive ? 'إلغاء التفعيل' : 'تفعيل'}
                                >
                                    {conv.isActive ? '⏸️' : '▶️'}
                                </button>
                                <button
                                    className="quick-action-btn"
                                    onClick={() => handleLock(conv._id)}
                                    title={conv.isLocked ? 'فتح القفل' : 'قفل'}
                                >
                                    {conv.isLocked ? '🔓' : '🔒'}
                                </button>
                                <button
                                    className="quick-action-btn messages-btn"
                                    onClick={() => handleViewDetails(conv._id)}
                                    title="عرض الرسائل"
                                >
                                    💬
                                </button>
                                <button
                                    className="actions-btn"
                                    onClick={() => openActionsModal(conv)}
                                >
                                    إجراءات ⚙️
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Actions Modal */}
            {showActionsModal && selectedConv && (
                <div className="modal-overlay" onClick={() => setShowActionsModal(false)}>
                    <div className="modal-content actions-modal" onClick={(e) => e.stopPropagation()}>
                        <h3>إجراءات المحادثة</h3>
                        <p className="modal-subtitle">{selectedConv.title}</p>

                        <div className="action-list">
                            <button
                                className="action-item view"
                                onClick={() => {
                                    handleViewDetails(selectedConv._id);
                                    setShowActionsModal(false);
                                }}
                            >
                                <span className="action-icon">👁️</span>
                                <span>عرض التفاصيل</span>
                            </button>

                            <button
                                className="action-item lock"
                                onClick={() => {
                                    handleLock(selectedConv._id);
                                    setShowActionsModal(false);
                                }}
                            >
                                <span className="action-icon">
                                    {selectedConv.isLocked ? '🔓' : '🔒'}
                                </span>
                                <span>{selectedConv.isLocked ? 'فتح القفل' : 'قفل المحادثة'}</span>
                            </button>

                            <button
                                className="action-item toggle"
                                onClick={() => {
                                    handleToggleActive(selectedConv._id);
                                    setShowActionsModal(false);
                                }}
                            >
                                <span className="action-icon">
                                    {selectedConv.isActive ? '⏸️' : '▶️'}
                                </span>
                                <span>
                                    {selectedConv.isActive ? 'إلغاء التفعيل' : 'تفعيل'}
                                </span>
                            </button>

                            <button
                                className="action-item delete-messages"
                                onClick={() => {
                                    handleDeleteMessages(selectedConv._id);
                                    setShowActionsModal(false);
                                }}
                            >
                                <span className="action-icon">🗑️</span>
                                <span>حذف جميع الرسائل</span>
                            </button>

                            <button
                                className="action-item reports"
                                onClick={() => {
                                    showToast('عرض البلاغات قريباً', 'info');
                                    setShowActionsModal(false);
                                }}
                            >
                                <span className="action-icon">⚠️</span>
                                <span>عرض البلاغات</span>
                            </button>

                            <button
                                className="action-item delete"
                                onClick={() => {
                                    handleDelete(selectedConv._id);
                                    setShowActionsModal(false);
                                }}
                            >
                                <span className="action-icon">❌</span>
                                <span>حذف المحادثة نهائياً</span>
                            </button>
                        </div>

                        <button
                            className="modal-close-btn"
                            onClick={() => setShowActionsModal(false)}
                        >
                            إغلاق
                        </button>
                    </div>
                </div>
            )}

            {/* Create Group Modal */}
            {showCreateGroupModal && (
                <div className="modal-overlay" onClick={() => setShowCreateGroupModal(false)}>
                    <div className="modal-content create-group-modal" onClick={(e) => e.stopPropagation()}>
                        <h3>إنشاء قروب جديد</h3>
                        <p className="modal-subtitle">املأ البيانات التالية لإنشاء قروب جديد</p>

                        <div className="form-group">
                            <label>اسم القروب *</label>
                            <input
                                type="text"
                                placeholder="مثال: قروب الدعم الفني"
                                value={groupData.title}
                                onChange={(e) => handleGroupDataChange('title', e.target.value)}
                                className="form-input"
                            />
                        </div>

                        <div className="form-group">
                            <label>الوصف</label>
                            <textarea
                                placeholder="وصف مختصر عن القروب"
                                value={groupData.description}
                                onChange={(e) => handleGroupDataChange('description', e.target.value)}
                                className="form-textarea"
                                rows="3"
                            />
                        </div>

                        <div className="form-group">
                            <label>صورة القروب (URL)</label>
                            <input
                                type="text"
                                placeholder="https://example.com/image.jpg"
                                value={groupData.groupImage}
                                onChange={(e) => handleGroupDataChange('groupImage', e.target.value)}
                                className="form-input"
                            />
                        </div>

                        <div className="form-group">
                            <label>معرفات المشاركين * (افصل بينها بفاصلة)</label>
                            <input
                                type="text"
                                placeholder="مثال: 507f1f77bcf86cd799439011, 507f1f77bcf86cd799439012"
                                onChange={(e) => {
                                    const ids = e.target.value.split(',').map(id => id.trim()).filter(id => id);
                                    handleGroupDataChange('participants', ids);
                                }}
                                className="form-input"
                            />
                            <small className="form-hint">
                                أدخل معرفات المستخدمين (IDs) مفصولة بفواصل. يجب إضافة عضوين على الأقل.
                            </small>
                        </div>

                        <div className="modal-actions">
                            <button
                                className="btn-cancel"
                                onClick={() => {
                                    setShowCreateGroupModal(false);
                                    setGroupData({
                                        title: '',
                                        description: '',
                                        participants: [],
                                        groupImage: ''
                                    });
                                }}
                            >
                                إلغاء
                            </button>
                            <button
                                className="btn-create-group"
                                onClick={handleCreateGroup}
                                disabled={creatingGroup}
                            >
                                {creatingGroup ? 'جاري الإنشاء...' : '✓ إنشاء القروب'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Conversations;
