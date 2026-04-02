import React, { useState, useEffect } from 'react';
import { getAllUsers, banUserName, warnUser, checkBannedWords, getBannedWords, addBannedWord, deleteBannedWord, toggleBannedWordActive } from '../services/api';
import { useToast } from '../components/Toast';
import { getImageUrl, getDefaultAvatar } from '../config';
import './NameBlocking.css';

function NameBlocking({ onViewUserDetail }) {
    const [activeSection, setActiveSection] = useState('check'); // check, users, words
    const [loading, setLoading] = useState(false);

    // Check name
    const [checkText, setCheckText] = useState('');
    const [checkResult, setCheckResult] = useState(null);
    const [checking, setChecking] = useState(false);

    // Banned name users
    const [users, setUsers] = useState([]);
    const [usersPage, setUsersPage] = useState(1);
    const [usersTotalPages, setUsersTotalPages] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');

    // Name-type banned words
    const [nameWords, setNameWords] = useState([]);
    const [wordsPage, setWordsPage] = useState(1);
    const [wordsTotalPages, setWordsTotalPages] = useState(1);

    // Add word modal
    const [showAddModal, setShowAddModal] = useState(false);
    const [newWord, setNewWord] = useState('');
    const [newSeverity, setNewSeverity] = useState('medium');
    const [saving, setSaving] = useState(false);

    const toast = useToast();

    useEffect(() => {
        if (activeSection === 'users') fetchUsers();
        if (activeSection === 'words') fetchNameWords();
    }, [activeSection, usersPage, wordsPage]);

    // ============ فحص الاسم ============
    const handleCheckName = async () => {
        if (!checkText.trim()) return;
        setChecking(true);
        setCheckResult(null);
        try {
            const response = await checkBannedWords(checkText.trim());
            if (response.success) {
                setCheckResult(response.data);
            }
        } catch (error) {
            toast.error('فشل فحص الاسم');
        }
        setChecking(false);
    };

    // ============ المستخدمين المحظورة أسماؤهم ============
    const fetchUsers = async () => {
        setLoading(true);
        try {
            const response = await getAllUsers({
                page: usersPage,
                limit: 20,
                search: searchQuery || undefined
            });
            if (response.success) {
                // Filter users with nameBanned or whose name contains ***
                const allUsers = response.data?.users || [];
                const bannedUsers = allUsers.filter(u =>
                    u.nameBanned === true || (u.name && u.name.includes('***'))
                );
                setUsers(bannedUsers);
                setUsersTotalPages(response.data?.pagination?.pages || 1);
            }
        } catch (error) {
            toast.error('فشل جلب المستخدمين');
        }
        setLoading(false);
    };

    const handleBanName = async (userId) => {
        if (!window.confirm('هل تريد حظر اسم هذا المستخدم؟')) return;
        try {
            await banUserName(userId);
            toast.success('تم حظر الاسم بنجاح');
            fetchUsers();
        } catch (error) {
            toast.error('فشل حظر الاسم');
        }
    };

    // ============ كلمات الأسماء المحظورة ============
    const fetchNameWords = async () => {
        setLoading(true);
        try {
            const response = await getBannedWords({
                page: wordsPage,
                limit: 30,
                type: 'name'
            });
            if (response.success) {
                // Get words with type 'name' or 'both'
                const allWords = response.data?.words || response.data?.bannedWords || [];
                setNameWords(allWords);
                setWordsTotalPages(response.data?.pagination?.pages || 1);
            }
        } catch (error) {
            toast.error('فشل جلب الكلمات المحظورة');
        }
        setLoading(false);
    };

    const handleAddWord = async () => {
        if (!newWord.trim()) return;
        setSaving(true);
        try {
            await addBannedWord({
                word: newWord.trim(),
                type: 'name',
                severity: newSeverity,
                action: 'block'
            });
            toast.success('تمت إضافة الكلمة');
            setShowAddModal(false);
            setNewWord('');
            setNewSeverity('medium');
            fetchNameWords();
        } catch (error) {
            toast.error(error.response?.data?.message || 'فشل إضافة الكلمة');
        }
        setSaving(false);
    };

    const handleDeleteWord = async (wordId) => {
        if (!window.confirm('هل تريد حذف هذه الكلمة؟')) return;
        try {
            await deleteBannedWord(wordId);
            toast.success('تم حذف الكلمة');
            fetchNameWords();
        } catch (error) {
            toast.error('فشل حذف الكلمة');
        }
    };

    const handleToggleWord = async (wordId) => {
        try {
            await toggleBannedWordActive(wordId);
            fetchNameWords();
        } catch (error) {
            toast.error('فشل تغيير حالة الكلمة');
        }
    };

    const severityColor = (severity) => {
        switch (severity) {
            case 'low': return '#28a745';
            case 'medium': return '#ffc107';
            case 'high': return '#fd7e14';
            case 'critical': return '#dc3545';
            default: return '#6c757d';
        }
    };

    return (
        <div className="name-blocking-page">
            {/* Section tabs */}
            <div className="nb-section-tabs">
                <button
                    className={`nb-tab ${activeSection === 'check' ? 'active' : ''}`}
                    onClick={() => setActiveSection('check')}
                >
                    🔍 فحص اسم
                </button>
                <button
                    className={`nb-tab ${activeSection === 'users' ? 'active' : ''}`}
                    onClick={() => setActiveSection('users')}
                >
                    👤 المستخدمين المحظورين
                </button>
                <button
                    className={`nb-tab ${activeSection === 'words' ? 'active' : ''}`}
                    onClick={() => setActiveSection('words')}
                >
                    🚫 كلمات الأسماء المحظورة
                </button>
            </div>

            {/* ============ فحص اسم ============ */}
            {activeSection === 'check' && (
                <div className="nb-section">
                    <div className="nb-check-card">
                        <h3>🔍 فحص اسم مستخدم</h3>
                        <p className="nb-hint">تحقق إذا كان الاسم يحتوي على كلمات محظورة</p>

                        <div className="nb-check-input">
                            <input
                                type="text"
                                value={checkText}
                                onChange={(e) => setCheckText(e.target.value)}
                                placeholder="اكتب الاسم للفحص..."
                                onKeyDown={(e) => e.key === 'Enter' && handleCheckName()}
                            />
                            <button onClick={handleCheckName} disabled={checking || !checkText.trim()}>
                                {checking ? 'جاري الفحص...' : 'فحص'}
                            </button>
                        </div>

                        {checkResult && (
                            <div className={`nb-check-result ${checkResult.isClean ? 'clean' : 'dirty'}`}>
                                <div className="nb-result-header">
                                    <span className="nb-result-icon">
                                        {checkResult.isClean ? '✅' : '❌'}
                                    </span>
                                    <span className="nb-result-text">
                                        {checkResult.isClean
                                            ? 'الاسم نظيف - لا يحتوي على كلمات محظورة'
                                            : 'الاسم يحتوي على كلمات محظورة!'
                                        }
                                    </span>
                                </div>

                                {!checkResult.isClean && checkResult.foundWords && (
                                    <div className="nb-found-words">
                                        <h4>الكلمات المكتشفة:</h4>
                                        {checkResult.foundWords.map((fw, i) => (
                                            <span key={i} className="nb-found-word" style={{ borderColor: severityColor(fw.severity) }}>
                                                {fw.word}
                                                <span className="nb-severity" style={{ color: severityColor(fw.severity) }}>
                                                    ({fw.severity})
                                                </span>
                                            </span>
                                        ))}
                                        <p className="nb-suggestion">
                                            الإجراء المقترح: <strong>{checkResult.suggestedAction}</strong>
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* معلومات */}
                    <div className="nb-info-cards">
                        <div className="nb-info-card">
                            <span className="nb-info-icon">📋</span>
                            <h4>كيف يعمل حظر الأسماء؟</h4>
                            <ul>
                                <li>يتم فحص الاسم تلقائياً عند التسجيل وتعديل الملف الشخصي</li>
                                <li>إذا احتوى الاسم على كلمات محظورة يُرفض تلقائياً</li>
                                <li>يمكن للأدمن حظر اسم مستخدم يدوياً</li>
                                <li>عند الحظر يتغير الاسم لـ "***مستخدم محظور***"</li>
                            </ul>
                        </div>
                        <div className="nb-info-card">
                            <span className="nb-info-icon">⚠️</span>
                            <h4>نظام المخالفات</h4>
                            <ul>
                                <li>كل تحذير يضيف مخالفة واحدة</li>
                                <li>عند 5 مخالفات يتم تعليق الحساب تلقائياً لمدة 24 ساعة</li>
                                <li>يتم إرسال إشعار للمستخدم عند التحذير والتعليق وحظر الاسم</li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {/* ============ المستخدمين المحظورين ============ */}
            {activeSection === 'users' && (
                <div className="nb-section">
                    <div className="nb-toolbar">
                        <input
                            type="text"
                            className="nb-search"
                            placeholder="بحث بالاسم أو الإيميل..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && fetchUsers()}
                        />
                        <button className="nb-search-btn" onClick={fetchUsers}>بحث</button>
                    </div>

                    {loading ? (
                        <div className="nb-loading">جاري التحميل...</div>
                    ) : users.length === 0 ? (
                        <div className="nb-empty">لا يوجد مستخدمين بأسماء محظورة</div>
                    ) : (
                        <div className="nb-users-list">
                            {users.map(user => (
                                <div key={user._id} className="nb-user-card">
                                    <img
                                        src={user.profileImage ? getImageUrl(user.profileImage) : getDefaultAvatar(user.name)}
                                        alt={user.name}
                                        className="nb-user-avatar"
                                        onError={(e) => { e.target.onerror = null; e.target.src = getDefaultAvatar(user.name); }}
                                    />
                                    <div className="nb-user-info">
                                        <span className="nb-user-name">{user.name}</span>
                                        <span className="nb-user-email">{user.email}</span>
                                        {user.nameBanned && (
                                            <span className="nb-badge banned">اسم محظور</span>
                                        )}
                                    </div>
                                    <div className="nb-user-stats">
                                        <span className="nb-violations">
                                            مخالفات: {user.violationCount || 0}/5
                                        </span>
                                    </div>
                                    <div className="nb-user-actions">
                                        {onViewUserDetail && (
                                            <button
                                                className="nb-btn-view"
                                                onClick={() => onViewUserDetail(user._id)}
                                                title="عرض التفاصيل"
                                            >
                                                👁️
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {usersTotalPages > 1 && (
                        <div className="nb-pagination">
                            <button disabled={usersPage <= 1} onClick={() => setUsersPage(p => p - 1)}>السابق</button>
                            <span>{usersPage} / {usersTotalPages}</span>
                            <button disabled={usersPage >= usersTotalPages} onClick={() => setUsersPage(p => p + 1)}>التالي</button>
                        </div>
                    )}
                </div>
            )}

            {/* ============ كلمات الأسماء المحظورة ============ */}
            {activeSection === 'words' && (
                <div className="nb-section">
                    <div className="nb-toolbar">
                        <button className="nb-add-btn" onClick={() => setShowAddModal(true)}>
                            ➕ إضافة كلمة محظورة للأسماء
                        </button>
                    </div>

                    {loading ? (
                        <div className="nb-loading">جاري التحميل...</div>
                    ) : nameWords.length === 0 ? (
                        <div className="nb-empty">لا توجد كلمات محظورة من نوع "أسماء"</div>
                    ) : (
                        <table className="nb-words-table">
                            <thead>
                                <tr>
                                    <th>الكلمة</th>
                                    <th>النوع</th>
                                    <th>الشدة</th>
                                    <th>الإجراء</th>
                                    <th>الاستخدام</th>
                                    <th>الحالة</th>
                                    <th>إجراءات</th>
                                </tr>
                            </thead>
                            <tbody>
                                {nameWords.map(word => (
                                    <tr key={word._id}>
                                        <td className="nb-word-cell">{word.word}</td>
                                        <td>
                                            <span className="nb-type-badge">
                                                {word.type === 'name' ? 'أسماء' : word.type === 'both' ? 'الكل' : 'رسائل'}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="nb-severity-dot" style={{ background: severityColor(word.severity) }}></span>
                                            {word.severity}
                                        </td>
                                        <td>{word.action}</td>
                                        <td>{word.usageCount || 0}</td>
                                        <td>
                                            <button
                                                className={`nb-status-toggle ${word.isActive ? 'active' : 'inactive'}`}
                                                onClick={() => handleToggleWord(word._id)}
                                            >
                                                {word.isActive ? 'مفعّل' : 'معطّل'}
                                            </button>
                                        </td>
                                        <td>
                                            <button
                                                className="nb-delete-btn"
                                                onClick={() => handleDeleteWord(word._id)}
                                                title="حذف"
                                            >
                                                🗑️
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {wordsTotalPages > 1 && (
                        <div className="nb-pagination">
                            <button disabled={wordsPage <= 1} onClick={() => setWordsPage(p => p - 1)}>السابق</button>
                            <span>{wordsPage} / {wordsTotalPages}</span>
                            <button disabled={wordsPage >= wordsTotalPages} onClick={() => setWordsPage(p => p + 1)}>التالي</button>
                        </div>
                    )}
                </div>
            )}

            {/* ============ Modal إضافة كلمة ============ */}
            {showAddModal && (
                <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
                    <div className="nb-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="nb-modal-header">
                            <h3>➕ إضافة كلمة محظورة للأسماء</h3>
                            <button onClick={() => setShowAddModal(false)}>✕</button>
                        </div>
                        <div className="nb-modal-body">
                            <div className="form-group">
                                <label>الكلمة</label>
                                <input
                                    type="text"
                                    value={newWord}
                                    onChange={(e) => setNewWord(e.target.value)}
                                    placeholder="اكتب الكلمة المحظورة..."
                                />
                            </div>
                            <div className="form-group">
                                <label>الشدة</label>
                                <select value={newSeverity} onChange={(e) => setNewSeverity(e.target.value)}>
                                    <option value="low">منخفض</option>
                                    <option value="medium">متوسط</option>
                                    <option value="high">عالي</option>
                                    <option value="critical">حرج</option>
                                </select>
                            </div>
                        </div>
                        <div className="nb-modal-footer">
                            <button className="cancel-btn" onClick={() => setShowAddModal(false)}>إلغاء</button>
                            <button className="submit-btn" onClick={handleAddWord} disabled={saving || !newWord.trim()}>
                                {saving ? 'جاري الحفظ...' : 'إضافة'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default NameBlocking;
