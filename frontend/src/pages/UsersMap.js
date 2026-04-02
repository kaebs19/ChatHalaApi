import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { getUsersLocations } from '../services/api';
import { getImageUrl, getDefaultAvatar } from '../config';
import { formatDate } from '../utils/formatters';
import 'leaflet/dist/leaflet.css';
import './UsersMap.css';

// Fix Leaflet default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

function UsersMap({ onViewDetail }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterGender, setFilterGender] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');

    useEffect(() => {
        fetchLocations();
    }, []);

    const fetchLocations = async () => {
        try {
            setLoading(true);
            const response = await getUsersLocations();
            if (response.success) {
                setUsers(response.data.users || []);
            }
        } catch (error) {
            console.error('Error fetching locations:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredUsers = users.filter(user => {
        if (filterGender !== 'all' && user.gender !== filterGender) return false;
        if (filterStatus === 'active' && !user.isActive) return false;
        if (filterStatus === 'inactive' && user.isActive) return false;
        if (filterStatus === 'online' && !user.isOnline) return false;
        return true;
    });

    const getMarkerIcon = (user) => {
        const color = user.isOnline ? '#22c55e' : user.isActive ? '#3b82f6' : '#ef4444';
        return L.divIcon({
            className: 'custom-marker',
            html: `<div style="
                width: 32px; height: 32px; border-radius: 50%;
                background: ${color}; border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                display: flex; align-items: center; justify-content: center;
                color: white; font-size: 14px; font-weight: bold;
            ">${user.name.charAt(0)}</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
        });
    };

    return (
        <div className="users-map-page">
            <div className="page-header">
                <h2>خريطة المستخدمين</h2>
                <div className="map-stats">
                    <span className="stat-badge">{filteredUsers.length} مستخدم على الخريطة</span>
                </div>
            </div>

            <div className="map-filters">
                <select value={filterGender} onChange={e => setFilterGender(e.target.value)}>
                    <option value="all">الكل</option>
                    <option value="male">ذكور</option>
                    <option value="female">إناث</option>
                </select>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="all">جميع الحالات</option>
                    <option value="online">متصل الآن</option>
                    <option value="active">نشط</option>
                    <option value="inactive">غير نشط</option>
                </select>
                <button className="refresh-btn" onClick={fetchLocations} disabled={loading}>
                    {loading ? 'جاري التحميل...' : 'تحديث'}
                </button>
            </div>

            <div className="map-legend">
                <span className="legend-item"><span className="legend-dot online"></span> متصل</span>
                <span className="legend-item"><span className="legend-dot active"></span> نشط</span>
                <span className="legend-item"><span className="legend-dot inactive"></span> غير نشط</span>
            </div>

            <div className="map-container">
                {loading ? (
                    <div className="map-loading">جاري تحميل الخريطة...</div>
                ) : (
                    <MapContainer
                        center={[24.7136, 46.6753]}
                        zoom={5}
                        style={{ height: '100%', width: '100%', borderRadius: '12px' }}
                    >
                        <TileLayer
                            attribution='&copy; OpenStreetMap'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        {filteredUsers.map(user => {
                            const lat = user.location.coordinates[1];
                            const lng = user.location.coordinates[0];
                            return (
                                <Marker
                                    key={user._id}
                                    position={[lat, lng]}
                                    icon={getMarkerIcon(user)}
                                >
                                    <Popup>
                                        <div className="marker-popup">
                                            <img
                                                src={user.profileImage ? getImageUrl(user.profileImage) : getDefaultAvatar(user.name)}
                                                alt={user.name}
                                                className="popup-avatar"
                                                onError={(e) => {
                                                    e.target.onerror = null;
                                                    e.target.src = getDefaultAvatar(user.name);
                                                }}
                                            />
                                            <div className="popup-info">
                                                <strong>{user.name}</strong>
                                                <p>{user.gender === 'male' ? 'ذكر' : 'أنثى'}</p>
                                                <p>{user.isOnline ? 'متصل الآن' : `آخر دخول: ${formatDate(user.lastLogin)}`}</p>
                                                <p className="popup-coords">{lat.toFixed(3)}, {lng.toFixed(3)}</p>
                                                {onViewDetail && (
                                                    <button
                                                        className="popup-detail-btn"
                                                        onClick={() => onViewDetail(user._id)}
                                                    >
                                                        عرض التفاصيل
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </Popup>
                                </Marker>
                            );
                        })}
                    </MapContainer>
                )}
            </div>
        </div>
    );
}

export default UsersMap;
