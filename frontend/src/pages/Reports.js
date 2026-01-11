import React, { useState, useEffect } from 'react';
import { getAllReports, getReportsStats, updateReportStatus, takeReportAction, updateReportPriority, deleteReport } from '../services/api';
import { useToast } from '../components/Toast';
import Pagination from '../components/Pagination';
import LoadingSpinner from '../components/LoadingSpinner';
import './Reports.css';

function Reports() {
    const [reports, setReports] = useState([]);
    const [stats, setStats] = useState({
        totalReports: 0,
        pendingReports: 0,
        reviewingReports: 0,
        resolvedReports: 0,
        urgentReports: 0
    });
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterPriority, setFilterPriority] = useState('all');
    const [filterType, setFilterType] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [selectedReport, setSelectedReport] = useState(null);
    const [showActionModal, setShowActionModal] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        fetchReports();
        fetchStats();
    }, [currentPage, filterStatus, filterPriority, filterType]);

    const fetchReports = async () => {
        try {
            setLoading(true);
            const filters = {};
            if (filterStatus !== 'all') filters.status = filterStatus;
            if (filterPriority !== 'all') filters.priority = filterPriority;
            if (filterType !== 'all') filters.type = filterType;

            const response = await getAllReports(currentPage, 20, filters);
            if (response.success) {
                setReports(response.data.reports);
                setTotalPages(response.data.totalPages);
            }
        } catch (error) {
            showToast('فشل في تحميل البلاغات', 'error');
            console.error('Error fetching reports:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const response = await getReportsStats();
            if (response.success) {
                setStats(response.data);
            }
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    };

    const handleStatusChange = async (reportId, newStatus) => {
        try {
            const response = await updateReportStatus(reportId, newStatus);
            if (response.success) {
                showToast('تم تحديث حالة البلاغ', 'success');
                fetchReports();
                fetchStats();
            }
        } catch (error) {
            showToast('فشل في تحديث الحالة', 'error');
        }
    };

    const handlePriorityChange = async (reportId, newPriority) => {
        try {
            const response = await updateReportPriority(reportId, newPriority);
            if (response.success) {
                showToast('تم تحديث الأولوية', 'success');
                fetchReports();
            }
        } catch (error) {
            showToast('فشل في تحديث الأولوية', 'error');
        }
    };

    const handleTakeAction = async (action) => {
        if (!selectedReport) return;

        try {
            const response = await takeReportAction(selectedReport._id, action);
            if (response.success) {
                showToast('تم تنفيذ الإجراء بنجاح', 'success');
                setShowActionModal(false);
                setSelectedReport(null);
                fetchReports();
                fetchStats();
            }
        } catch (error) {
            showToast('فشل في تنفيذ الإجراء', 'error');
        }
    };

    const handleDelete = async (reportId) => {
        if (!window.confirm('هل أنت متأكد من حذف هذا البلاغ؟')) return;

        try {
            const response = await deleteReport(reportId);
            if (response.success) {
                showToast('تم حذف البلاغ', 'success');
                fetchReports();
                fetchStats();
            }
        } catch (error) {
            showToast('فشل في حذف البلاغ', 'error');
        }
    };

    const getCategoryLabel = (category) => {
        const categories = {
            spam: 'رسائل مزعجة',
            harassment: 'تحرش',
            inappropriate_content: 'محتوى غير لائق',
            hate_speech: 'خطاب كراهية',
            violence: 'عنف',
            fraud: 'احتيال',
            impersonation: 'انتحال شخصية',
            other: 'أخرى'
        };
        return categories[category] || category;
    };

    const getTypeLabel = (type) => {
        const types = {
            user: 'مستخدم',
            message: 'رسالة',
            conversation: 'محادثة'
        };
        return types[type] || type;
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('ar-SA', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="reports-page">
            {/* Statistics */}
            <div className="reports-stats">
                <div className="stat-box total">
                    <div className="stat-icon">📊</div>
                    <div className="stat-info">
                        <h3>{stats.totalReports}</h3>
                        <p>إجمالي البلاغات</p>
                    </div>
                </div>
                <div className="stat-box pending">
                    <div className="stat-icon">⏳</div>
                    <div className="stat-info">
                        <h3>{stats.pendingReports}</h3>
                        <p>قيد الانتظار</p>
                    </div>
                </div>
                <div className="stat-box reviewing">
                    <div className="stat-icon">👀</div>
                    <div className="stat-info">
                        <h3>{stats.reviewingReports}</h3>
                        <p>قيد المراجعة</p>
                    </div>
                </div>
                <div className="stat-box resolved">
                    <div className="stat-icon">✅</div>
                    <div className="stat-info">
                        <h3>{stats.resolvedReports}</h3>
                        <p>تم الحل</p>
                    </div>
                </div>
                <div className="stat-box urgent">
                    <div className="stat-icon">🚨</div>
                    <div className="stat-info">
                        <h3>{stats.urgentReports}</h3>
                        <p>عاجلة</p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="reports-filters">
                <select
                    value={filterStatus}
                    onChange={(e) => {
                        setFilterStatus(e.target.value);
                        setCurrentPage(1);
                    }}
                >
                    <option value="all">جميع الحالات</option>
                    <option value="pending">قيد الانتظار</option>
                    <option value="reviewing">قيد المراجعة</option>
                    <option value="resolved">تم الحل</option>
                    <option value="rejected">مرفوض</option>
                </select>

                <select
                    value={filterPriority}
                    onChange={(e) => {
                        setFilterPriority(e.target.value);
                        setCurrentPage(1);
                    }}
                >
                    <option value="all">جميع الأولويات</option>
                    <option value="urgent">عاجل</option>
                    <option value="high">عالي</option>
                    <option value="medium">متوسط</option>
                    <option value="low">منخفض</option>
                </select>

                <select
                    value={filterType}
                    onChange={(e) => {
                        setFilterType(e.target.value);
                        setCurrentPage(1);
                    }}
                >
                    <option value="all">جميع الأنواع</option>
                    <option value="user">مستخدم</option>
                    <option value="message">رسالة</option>
                    <option value="conversation">محادثة</option>
                </select>

                <button onClick={fetchReports} className="refresh-btn">
                    تحديث 🔄
                </button>
            </div>

            {/* Reports List */}
            {loading ? (
                <LoadingSpinner text="جاري تحميل البلاغات..." />
            ) : reports.length === 0 ? (
                <div className="no-reports">
                    <p>لا توجد بلاغات 📭</p>
                </div>
            ) : (
                <>
                    <div className="reports-list">
                        {reports.map((report) => (
                            <div key={report._id} className={`report-card priority-${report.priority}`}>
                                <div className="report-header">
                                    <div className="report-meta">
                                        <span className={`report-type ${report.type}`}>
                                            {getTypeLabel(report.type)}
                                        </span>
                                        <span className={`report-category`}>
                                            {getCategoryLabel(report.category)}
                                        </span>
                                        <span className={`report-priority ${report.priority}`}>
                                            {report.priority === 'urgent' && '🚨'}
                                            {report.priority === 'high' && '🔴'}
                                            {report.priority === 'medium' && '🟡'}
                                            {report.priority === 'low' && '🟢'}
                                            {report.priority}
                                        </span>
                                    </div>
                                    <span className="report-date">{formatDate(report.createdAt)}</span>
                                </div>

                                <div className="report-body">
                                    <p className="report-description">{report.description}</p>

                                    <div className="report-users">
                                        <div className="report-user">
                                            <span className="label">المبلّغ:</span>
                                            <span className="value">{report.reportedBy?.name || 'غير معروف'}</span>
                                        </div>
                                        {report.reportedUser && (
                                            <div className="report-user">
                                                <span className="label">المبلّغ عليه:</span>
                                                <span className="value">{report.reportedUser?.name}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="report-footer">
                                    <div className="report-status">
                                        <select
                                            value={report.status}
                                            onChange={(e) => handleStatusChange(report._id, e.target.value)}
                                            className={`status-select ${report.status}`}
                                        >
                                            <option value="pending">قيد الانتظار</option>
                                            <option value="reviewing">قيد المراجعة</option>
                                            <option value="resolved">تم الحل</option>
                                            <option value="rejected">مرفوض</option>
                                        </select>

                                        <select
                                            value={report.priority}
                                            onChange={(e) => handlePriorityChange(report._id, e.target.value)}
                                            className={`priority-select ${report.priority}`}
                                        >
                                            <option value="urgent">عاجل</option>
                                            <option value="high">عالي</option>
                                            <option value="medium">متوسط</option>
                                            <option value="low">منخفض</option>
                                        </select>
                                    </div>

                                    <div className="report-actions">
                                        <button
                                            onClick={() => {
                                                setSelectedReport(report);
                                                setShowActionModal(true);
                                            }}
                                            className="action-btn"
                                        >
                                            اتخاذ إجراء
                                        </button>
                                        <button
                                            onClick={() => handleDelete(report._id)}
                                            className="delete-btn"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                        itemsPerPage={20}
                        totalItems={stats.totalReports}
                    />
                </>
            )}

            {/* Action Modal */}
            {showActionModal && selectedReport && (
                <div className="modal-overlay" onClick={() => setShowActionModal(false)}>
                    <div className="modal-content action-modal" onClick={(e) => e.stopPropagation()}>
                        <h3>اتخاذ إجراء على البلاغ</h3>
                        <p className="modal-description">
                            البلاغ: {getCategoryLabel(selectedReport.category)}
                        </p>

                        <div className="action-buttons">
                            <button
                                onClick={() => handleTakeAction('warning')}
                                className="action-option warning"
                            >
                                ⚠️ إرسال تحذير
                            </button>
                            <button
                                onClick={() => handleTakeAction('message_deleted')}
                                className="action-option delete"
                            >
                                🗑️ حذف الرسالة
                            </button>
                            <button
                                onClick={() => handleTakeAction('user_suspended')}
                                className="action-option suspend"
                            >
                                🔒 تعليق المستخدم
                            </button>
                            <button
                                onClick={() => handleTakeAction('user_banned')}
                                className="action-option ban"
                            >
                                🚫 حظر المستخدم
                            </button>
                            <button
                                onClick={() => handleTakeAction('conversation_locked')}
                                className="action-option lock"
                            >
                                🔐 قفل المحادثة
                            </button>
                            <button
                                onClick={() => handleTakeAction('none')}
                                className="action-option none"
                            >
                                ❌ لا إجراء
                            </button>
                        </div>

                        <button
                            onClick={() => setShowActionModal(false)}
                            className="modal-close-btn"
                        >
                            إغلاق
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Reports;
