import React, { useState, useEffect } from 'react';
import Reports from './Reports';
import FlaggedMessages from './FlaggedMessages';
import BannedWords from './BannedWords';
import NameBlocking from './NameBlocking';
import PageTabs from '../components/PageTabs';

const TABS = [
    { id: 'reports', label: 'البلاغات', icon: '⚠️' },
    { id: 'flagged', label: 'الرسائل المُبلّغة', icon: '🚨' },
    { id: 'banned-words', label: 'كلمات محظورة', icon: '🚫' },
    { id: 'name-blocking', label: 'حظر الأسماء', icon: '🔒' }
];

function ReportsManagement({ initialTab = 'reports', onViewUserDetail, onViewConversation }) {
    const [activeTab, setActiveTab] = useState(initialTab);

    useEffect(() => {
        setActiveTab(initialTab);
    }, [initialTab]);

    return (
        <div>
            <PageTabs
                tabs={TABS}
                activeTab={activeTab}
                onTabChange={setActiveTab}
            />
            <div className="page-tab-content">
                {activeTab === 'reports' && <Reports onViewUserDetail={onViewUserDetail} onViewConversation={onViewConversation} />}
                {activeTab === 'flagged' && <FlaggedMessages onViewUserDetail={onViewUserDetail} />}
                {activeTab === 'banned-words' && <BannedWords />}
                {activeTab === 'name-blocking' && <NameBlocking onViewUserDetail={onViewUserDetail} />}
            </div>
        </div>
    );
}

export default ReportsManagement;
