import React, { useState, useEffect } from 'react';
import {
    getAllChatRooms,
    createChatRoom,
    updateChatRoom,
    deleteChatRoom,
    deleteRoomMessages,
    toggleChatRoomActive,
    toggleChatRoomLock
} from '../services/api';
import { useToast } from '../components/Toast';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import './ChatRooms.css';

function ChatRooms() {
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('create'); // create or edit
    const [selectedRoom, setSelectedRoom] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        image: '',
        description: '',
        accessType: 'public'
    });
    const [searchTerm, setSearchTerm] = useState('');
    const [filterActive, setFilterActive] = useState('all'); // all, active, inactive
    const { showToast } = useToast();

    useEffect(() => {
        fetchRooms();
    }, []);

    const fetchRooms = async () => {
        try {
            setLoading(true);
            const response = await getAllChatRooms(1, 100);
            if (response.success) {
                setRooms(response.data.rooms);
            }
        } catch (error) {
            console.error('خطأ في جلب الغرف:', error);
            showToast('فشل تحميل الغرف', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = () => {
        setModalMode('create');
        setFormData({
            name: '',
            image: '',
            description: '',
            accessType: 'public'
        });
        setShowModal(true);
    };

    const handleEdit = (room) => {
        setModalMode('edit');
        setSelectedRoom(room);
        setFormData({
            name: room.name,
            image: room.image,
            description: room.description || '',
            accessType: room.accessType
        });
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.name) {
            showToast('اسم الغرفة مطلوب', 'error');
            return;
        }

        try {
            if (modalMode === 'create') {
                const response = await createChatRoom(formData);
                if (response.success) {
                    showToast('تم إنشاء الغرفة بنجاح ✅', 'success');
                    fetchRooms();
                    setShowModal(false);
                }
            } else {
                const response = await updateChatRoom(selectedRoom._id, formData);
                if (response.success) {
                    showToast('تم تحديث الغرفة بنجاح ✅', 'success');
                    fetchRooms();
                    setShowModal(false);
                }
            }
        } catch (error) {
            console.error('خطأ في حفظ الغرفة:', error);
            showToast(error.response?.data?.message || 'فشل حفظ الغرفة', 'error');
        }
    };

    const handleDelete = async (roomId, roomName) => {
        if (!window.confirm(`هل أنت متأكد من حذف غرفة "${roomName}"؟\nسيتم حذف الغرفة نهائياً.`)) {
            return;
        }

        try {
            const response = await deleteChatRoom(roomId);
            if (response.success) {
                showToast('تم حذف الغرفة بنجاح ✅', 'success');
                fetchRooms();
            }
        } catch (error) {
            console.error('خطأ في حذف الغرفة:', error);
            showToast('فشل حذف الغرفة', 'error');
        }
    };

    const handleDeleteMessages = async (roomId, roomName) => {
        if (!window.confirm(`هل أنت متأكد من حذف جميع رسائل غرفة "${roomName}"؟\nلا يمكن التراجع عن هذا الإجراء!`)) {
            return;
        }

        try {
            const response = await deleteRoomMessages(roomId);
            if (response.success) {
                showToast(`تم حذف ${response.deletedCount} رسالة ✅`, 'success');
                fetchRooms();
            }
        } catch (error) {
            console.error('خطأ في حذف الرسائل:', error);
            showToast('فشل حذف الرسائل', 'error');
        }
    };

    const handleToggleActive = async (roomId) => {
        try {
            const response = await toggleChatRoomActive(roomId);
            if (response.success) {
                showToast(response.message, 'success');
                fetchRooms();
            }
        } catch (error) {
            console.error('خطأ في تغيير حالة الغرفة:', error);
            showToast('فشل تغيير حالة الغرفة', 'error');
        }
    };

    const handleToggleLock = async (roomId) => {
        try {
            const response = await toggleChatRoomLock(roomId);
            if (response.success) {
                showToast(response.message, 'success');
                fetchRooms();
            }
        } catch (error) {
            console.error('خطأ في تغيير قفل الغرفة:', error);
            showToast('فشل تغيير قفل الغرفة', 'error');
        }
    };

    // Filter and search
    const filteredRooms = rooms.filter(room => {
        const matchesSearch = room.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesFilter =
            filterActive === 'all' ||
            (filterActive === 'active' && room.isActive) ||
            (filterActive === 'inactive' && !room.isActive);
        return matchesSearch && matchesFilter;
    });

    if (loading) {
        return <LoadingSpinner text="جاري تحميل غرف المحادثة..." />;
    }

    return (
        <div className="chat-rooms-page">
            {/* Header */}
            <div className="rooms-header">
                <div className="header-left">
                    <h1>🏠 غرف المحادثة</h1>
                    <p>إدارة غرف المحادثة العامة</p>
                </div>
                <button className="btn-create" onClick={handleCreate}>
                    ➕ إنشاء غرفة جديدة
                </button>
            </div>

            {/* Filters */}
            <div className="rooms-filters">
                <div className="search-box">
                    <input
                        type="text"
                        placeholder="ابحث عن غرفة..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <span className="search-icon">🔍</span>
                </div>

                <div className="filter-buttons">
                    <button
                        className={`filter-btn ${filterActive === 'all' ? 'active' : ''}`}
                        onClick={() => setFilterActive('all')}
                    >
                        الكل ({rooms.length})
                    </button>
                    <button
                        className={`filter-btn ${filterActive === 'active' ? 'active' : ''}`}
                        onClick={() => setFilterActive('active')}
                    >
                        نشطة ({rooms.filter(r => r.isActive).length})
                    </button>
                    <button
                        className={`filter-btn ${filterActive === 'inactive' ? 'active' : ''}`}
                        onClick={() => setFilterActive('inactive')}
                    >
                        معطلة ({rooms.filter(r => !r.isActive).length})
                    </button>
                </div>
            </div>

            {/* Rooms Grid */}
            {filteredRooms.length === 0 ? (
                <EmptyState
                    icon="🏠"
                    title="لا توجد غرف محادثة"
                    description="ابدأ بإنشاء غرفة محادثة جديدة"
                />
            ) : (
                <div className="rooms-grid">
                    {filteredRooms.map(room => (
                        <div key={room._id} className={`room-card ${!room.isActive ? 'inactive' : ''}`}>
                            <div className="room-image">
                                <img src={room.image} alt={room.name} />
                                {room.isLocked && <span className="lock-badge">🔒</span>}
                                {!room.isActive && <span className="inactive-badge">معطلة</span>}
                            </div>

                            <div className="room-info">
                                <h3>{room.name}</h3>
                                {room.description && <p className="room-description">{room.description}</p>}

                                <div className="room-stats">
                                    <span className="stat">
                                        <span className="stat-icon">👥</span>
                                        {room.memberCount || 0} عضو
                                    </span>
                                    <span className="stat">
                                        <span className="stat-icon">💬</span>
                                        {room.messageCount || 0} رسالة
                                    </span>
                                    <span className={`stat access-${room.accessType}`}>
                                        <span className="stat-icon">{room.accessType === 'public' ? '🌐' : '🔐'}</span>
                                        {room.accessType === 'public' ? 'عامة' : 'خاصة'}
                                    </span>
                                </div>
                            </div>

                            <div className="room-actions">
                                <button
                                    className="action-btn edit"
                                    onClick={() => handleEdit(room)}
                                    title="تعديل"
                                >
                                    ✏️
                                </button>
                                <button
                                    className={`action-btn toggle ${room.isActive ? 'active' : 'inactive'}`}
                                    onClick={() => handleToggleActive(room._id)}
                                    title={room.isActive ? 'تعطيل' : 'تفعيل'}
                                >
                                    {room.isActive ? '🟢' : '🔴'}
                                </button>
                                <button
                                    className={`action-btn lock ${room.isLocked ? 'locked' : ''}`}
                                    onClick={() => handleToggleLock(room._id)}
                                    title={room.isLocked ? 'فتح' : 'قفل'}
                                >
                                    {room.isLocked ? '🔒' : '🔓'}
                                </button>
                                <button
                                    className="action-btn delete-messages"
                                    onClick={() => handleDeleteMessages(room._id, room.name)}
                                    title="حذف الرسائل"
                                >
                                    🗑️💬
                                </button>
                                <button
                                    className="action-btn delete"
                                    onClick={() => handleDelete(room._id, room.name)}
                                    title="حذف الغرفة"
                                >
                                    ❌
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="room-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{modalMode === 'create' ? '➕ إنشاء غرفة جديدة' : '✏️ تعديل الغرفة'}</h3>
                            <button className="close-btn" onClick={() => setShowModal(false)}>✕</button>
                        </div>

                        <form onSubmit={handleSubmit} className="room-form">
                            <div className="form-group">
                                <label>اسم الغرفة *</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="مثال: غرفة الدردشة العامة"
                                    maxLength={100}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>رابط الصورة</label>
                                <input
                                    type="url"
                                    value={formData.image}
                                    onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                                    placeholder="https://example.com/image.jpg"
                                />
                                {formData.image && (
                                    <div className="image-preview">
                                        <img src={formData.image} alt="معاينة" />
                                    </div>
                                )}
                            </div>

                            <div className="form-group">
                                <label>الوصف</label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="وصف مختصر للغرفة..."
                                    maxLength={500}
                                    rows={3}
                                />
                            </div>

                            <div className="form-group">
                                <label>نوع الوصول</label>
                                <select
                                    value={formData.accessType}
                                    onChange={(e) => setFormData({ ...formData, accessType: e.target.value })}
                                >
                                    <option value="public">🌐 عامة (يمكن لأي مستخدم الدخول)</option>
                                    <option value="private">🔐 خاصة (بدعوة فقط)</option>
                                </select>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>
                                    إلغاء
                                </button>
                                <button type="submit" className="btn-submit">
                                    {modalMode === 'create' ? '✅ إنشاء' : '💾 حفظ'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ChatRooms;
