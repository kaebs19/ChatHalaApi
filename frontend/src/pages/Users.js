import React, { useState, useEffect, useCallback } from 'react';
import { getAllUsers, deleteUser, toggleUserActive, updateUser, suspendUser } from '../services/api';
import { useToast } from '../components/Toast';
import EditUserModal from '../components/EditUserModal';
import Pagination from '../components/Pagination';
import { TableRowSkeleton } from '../components/Skeleton';
import { getImageUrl, getDefaultAvatar } from '../config';
import { formatDate } from '../utils/formatters';
import ConfirmModal from '../components/ConfirmModal';
import './Users.css';

function Users({ onViewDetail }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterRole, setFilterRole] = useState('all');
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [userToDelete, setUserToDelete] = useState(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [userToEdit, setUserToEdit] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);
    const [totalUsers, setTotalUsers] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [sortField, setSortField] = useState('createdAt');
    const [sortOrder, setSortOrder] = useState('desc');
    const toast = useToast();

    const fetchUsers = useCallback(async () => {
        try {
            setLoading(true);
            const response = await getAllUsers({
                page: currentPage,
                limit: itemsPerPage,
                search: searchTerm || undefined,
                status: filterStatus,
                role: filterRole,
                sort: sortField,
                order: sortOrder
            });

            if (response.success) {
                setUsers(response.data.users);
                setTotalUsers(response.data.total || response.data.users.length);
                setTotalPages(response.data.totalPages || 1);
            }
        } catch (err) {
            console.error('Error:', err);
            setError(err.response?.data?.message || 'فشل تحميل المستخدمين');
        } finally {
            setLoading(false);
        }
    }, [currentPage, itemsPerPage, searchTerm, filterStatus, filterRole, sortField, sortOrder]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setSearchTerm(searchInput);
            setCurrentPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchInput]);

    const handleSort = (field) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
        setCurrentPage(1);
    };

    const getSortIcon = (field) => {
        if (sortField !== field) return '\u21C5';
        return sortOrder === 'asc' ? '\u2191' : '\u2193';
    };

    const handleToggleActive = async (userId) => {
        try {
            const user = users.find(u => u._id === userId);
            const response = await toggleUserActive(userId);
            if (response.success) {
                setUsers(users.map(u => u._id === userId ? { ...u, isActive: !u.isActive } : u));
                toast.success(user.isActive ? 'تم إلغاء تفعيل المستخدم' : 'تم تفعيل المستخدم');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'فشل تحديث المستخدم');
        }
    };

    const openEditModal = (user) => { setUserToEdit(user); setShowEditModal(true); };

    const handleEditUser = async (userData) => {
        try {
            const response = await updateUser(userToEdit._id, userData);
            if (response.success) {
                setUsers(users.map(u => u._id === userToEdit._id ? { ...u, ...userData } : u));
                setShowEditModal(false);
                setUserToEdit(null);
                toast.success('تم تحديث بيانات المستخدم');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'فشل تحديث المستخدم');
            throw err;
        }
    };

    const handleSuspend = async (user) => {
        const days = window.prompt(`تعليق "${user.name}" - كم يوم؟ (1-365)`, '7');
        if (!days) return;
        const numDays = parseInt(days);
        if (isNaN(numDays) || numDays < 1 || numDays > 365) {
            toast.error('أدخل عدد أيام صحيح (1-365)');
            return;
        }
        const reason = window.prompt(
            `سبب تعليق "${user.name}"؟\n(سيظهر للمستخدم في إشعار)`,
            'مخالفة سياسة الاستخدام'
        );
        if (reason === null) return;
        try {
            await suspendUser(user._id, numDays, reason.trim() || 'مخالفة سياسة الاستخدام');
            toast.success(`تم تعليق ${user.name} لمدة ${numDays} يوم`);
            fetchUsers();
        } catch (error) {
            toast.error('فشل في تعليق المستخدم');
        }
    };

    const confirmDelete = (user) => { setUserToDelete(user); setShowDeleteModal(true); };

    const handleDelete = async () => {
        if (!userToDelete) return;
        try {
            const response = await deleteUser(userToDelete._id);
            if (response.success) {
                toast.success(`تم حذف ${userToDelete.name}`);
                setShowDeleteModal(false);
                setUserToDelete(null);
                fetchUsers();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'فشل حذف المستخدم');
        }
    };

    const getStatusBadge = (user) => {
        // دعم استدعاء قديم يمرر isActive فقط
        const u = typeof user === 'object' ? user : { isActive: user };
        if (u.deviceBanned) {
            return <span className="badge" style={{ background: '#111827', color: '#fca5a5' }}>📵 جهاز محظور</span>;
        }
        if (u.suspendedUntil) {
            const daysLeft = (new Date(u.suspendedUntil) - new Date()) / (1000 * 60 * 60 * 24);
            if (daysLeft > 365) {
                return <span className="badge" style={{ background: '#dc2626', color: '#fff' }}>🚫 محظور نهائياً</span>;
            }
            if (daysLeft > 0) {
                return <span className="badge" style={{ background: '#f59e0b', color: '#fff' }}>⏸️ معلّق {Math.ceil(daysLeft)} يوم</span>;
            }
        }
        return u.isActive
            ? <span className="badge badge-success">نشط</span>
            : <span className="badge badge-inactive">غير نشط</span>;
    };

    const getRoleBadge = (role) => role === 'admin'
        ? <span className="badge badge-admin">مدير</span>
        : <span className="badge badge-user">مستخدم</span>;

    const getAuthProviderBadge = (provider) => {
        switch (provider) {
            case 'google': return <span className="badge badge-google"><img src="/google.png" alt="" className="provider-icon" /> Google</span>;
            case 'apple': return <span className="badge badge-apple"><img src="/apple-logo.png" alt="" className="provider-icon" /> Apple</span>;
            default: return <span className="badge badge-app">التطبيق</span>;
        }
    };

    return (
        <div className="users-page">
            <div className="users-header">
                <div>
                    <h1>إدارة المستخدمين</h1>
                    <p>إجمالي: {totalUsers} مستخدم</p>
                </div>
                <button className="refresh-btn" onClick={fetchUsers}>تحديث</button>
            </div>

            {error && <div className="error-banner">{error}</div>}

            <div className="filters-section">
                <div className="search-box">
                    <input
                        type="text"
                        placeholder="ابحث بالاسم أو البريد..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                    />
                    <span className="search-icon">🔍</span>
                </div>
                <div className="filter-group">
                    <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}>
                        <option value="all">جميع الحالات</option>
                        <option value="active">نشط</option>
                        <option value="suspended">معلّق مؤقتاً</option>
                        <option value="banned">محظور نهائياً</option>
                        <option value="violators">لديه مخالفات</option>
                        <option value="inactive">غير نشط</option>
                    </select>
                    <select value={filterRole} onChange={(e) => { setFilterRole(e.target.value); setCurrentPage(1); }}>
                        <option value="all">جميع الأدوار</option>
                        <option value="admin">مدير</option>
                        <option value="user">مستخدم</option>
                    </select>
                </div>
            </div>

            <div className="table-controls">
                <div className="results-info">عرض {users.length} من {totalUsers}</div>
                <div className="items-per-page">
                    <label>عدد العناصر:</label>
                    <select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                    </select>
                </div>
            </div>

            <div className="table-container">
                <table className="users-table">
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('name')} className="sortable">الاسم {getSortIcon('name')}</th>
                            <th onClick={() => handleSort('email')} className="sortable">البريد {getSortIcon('email')}</th>
                            <th>الدور</th>
                            <th>نوع التسجيل</th>
                            <th>الحالة</th>
                            <th onClick={() => handleSort('violationCount')} className="sortable">المخالفات {getSortIcon('violationCount')}</th>
                            <th onClick={() => handleSort('createdAt')} className="sortable">التسجيل {getSortIcon('createdAt')}</th>
                            <th onClick={() => handleSort('lastLogin')} className="sortable">آخر دخول {getSortIcon('lastLogin')}</th>
                            <th>الإجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} columns={9} />)
                        ) : users.length === 0 ? (
                            <tr><td colSpan="9" style={{ textAlign: 'center', padding: '40px' }}>لا توجد نتائج</td></tr>
                        ) : (
                            users.map((user) => (
                                <tr key={user._id}>
                                    <td>
                                        <div className="user-cell" onClick={() => onViewDetail && onViewDetail(user._id)} style={{ cursor: 'pointer' }}>
                                            <img
                                                src={user.profileImage ? getImageUrl(user.profileImage) : getDefaultAvatar(user.name)}
                                                alt={user.name}
                                                className="user-avatar-small"
                                                onError={(e) => { e.target.onerror = null; e.target.src = getDefaultAvatar(user.name); }}
                                            />
                                            <span className="user-name-link">{user.name}</span>
                                        </div>
                                    </td>
                                    <td dir="ltr" className="email-cell">{user.email}</td>
                                    <td>{getRoleBadge(user.role)}</td>
                                    <td>{getAuthProviderBadge(user.authProvider)}</td>
                                    <td>{getStatusBadge(user)}</td>
                                    <td style={{ textAlign: 'center' }}>
                                        {user.violationCount > 0 ? (
                                            <span style={{
                                                display: 'inline-block',
                                                padding: '4px 10px',
                                                borderRadius: '12px',
                                                background: user.violationCount >= 5 ? '#fecaca' : user.violationCount >= 3 ? '#fde68a' : '#e0e7ff',
                                                color: user.violationCount >= 5 ? '#991b1b' : user.violationCount >= 3 ? '#92400e' : '#3730a3',
                                                fontWeight: '700',
                                                fontSize: '13px'
                                            }}>
                                                ⚠️ {user.violationCount}
                                            </span>
                                        ) : <span style={{ color: '#9ca3af' }}>—</span>}
                                    </td>
                                    <td>{formatDate(user.createdAt)}</td>
                                    <td>{user.lastLogin ? formatDate(user.lastLogin) : <span className="no-login">-</span>}</td>
                                    <td>
                                        <div className="actions-cell">
                                            <button className="action-btn btn-primary" onClick={() => onViewDetail && onViewDetail(user._id)} title="تفاصيل">👁️</button>
                                            <button className="action-btn btn-info" onClick={() => openEditModal(user)} title="تعديل">✏️</button>
                                            <button className={`action-btn ${user.isActive ? 'btn-warning' : 'btn-success'}`} onClick={() => handleToggleActive(user._id)} title={user.isActive ? 'إلغاء' : 'تفعيل'}>{user.isActive ? '🔒' : '✅'}</button>
                                            <button className="action-btn btn-warning" onClick={() => handleSuspend(user)} title="تعليق">⏸️</button>
                                            <button className="action-btn btn-danger" onClick={() => confirmDelete(user)} title="حذف">🗑️</button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                itemsPerPage={itemsPerPage}
                totalItems={totalUsers}
            />

            {showEditModal && (
                <EditUserModal
                    user={userToEdit}
                    onClose={() => { setShowEditModal(false); setUserToEdit(null); }}
                    onSave={handleEditUser}
                />
            )}

            <ConfirmModal
                isOpen={showDeleteModal}
                onClose={() => { setShowDeleteModal(false); setUserToDelete(null); }}
                onConfirm={handleDelete}
                title="تأكيد الحذف"
                message="هل أنت متأكد من حذف المستخدم؟"
                confirmText="حذف"
                cancelText="إلغاء"
                variant="danger"
            >
                <div className="user-to-delete">
                    <strong>{userToDelete?.name}</strong>
                    <span>{userToDelete?.email}</span>
                </div>
            </ConfirmModal>
        </div>
    );
}

export default Users;
