# HalaChat Dashboard API

منصة محادثات عربية متقدمة مع لوحة تحكم شاملة - مبنية باستخدام Node.js, Express, MongoDB, Socket.IO

[![Version](https://img.shields.io/badge/version-2.1.0-blue.svg)](https://github.com/kaebs19/ChatHalaApi)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)](https://nodejs.org)

## 🌟 المميزات

### الأمان والحماية
- ✅ JWT Authentication محكم
- ✅ Socket.IO مؤمّن بالكامل مع Token verification
- ✅ Validation شامل باستخدام express-validator
- ✅ Rate Limiting لمنع الهجمات
- ✅ Helmet, CORS, mongo-sanitize, HPP
- ✅ نظام تسجيل نشاطات شامل (Activity Logs)

### نظام المحادثات
- 📱 محادثات خاصة (Private Conversations)
- 👥 مجموعات صغيرة (Group Chats)
- 🏠 غرف محادثة عامة (Public Chat Rooms)
- 🔒 غرف خاصة (Private Rooms)
- ⚡ Real-time messaging مع Socket.IO
- 📌 تثبيت الرسائل المهمة

### إدارة الغرف المتقدمة
- 🏷️ تصنيفات ووسوم للبحث
- 👮 نظام صلاحيات متعدد المستويات (Admins/Moderators)
- 📊 إحصائيات متقدمة ورصد النشاط
- ⚙️ إعدادات مخصصة لكل غرفة
- 🛡️ فلترة تلقائية للمحتوى
- 📏 قواعد قابلة للتخصيص

### لوحة التحكم
- 📊 Dashboard شامل مع إحصائيات
- 👥 إدارة المستخدمين الكاملة
- 🏠 إدارة الغرف والمحادثات
- 📝 نظام البلاغات (Reports)
- 🔔 نظام الإشعارات
- 📈 Activity Logs مفصّل
- ⚙️ إعدادات النظام

## 🚀 البدء السريع

### المتطلبات
- Node.js >= 14.0.0
- MongoDB >= 4.0
- npm أو yarn

### التثبيت

```bash
# استنساخ المشروع
git clone https://github.com/kaebs19/ChatHalaApi.git
cd ChatHalaApi

# تثبيت المكتبات للـ Backend
cd backend
npm install

# تثبيت المكتبات للـ Frontend
cd ../frontend
npm install
```

### الإعدادات

أنشئ ملف `.env` في مجلد `backend`:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/halachat

# JWT
JWT_SECRET=your_super_secret_key_here
JWT_EXPIRE=7d

# Server
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# APNS (اختياري)
APNS_KEY_ID=your_key_id
APNS_TEAM_ID=your_team_id
APNS_KEY_PATH=./config/AuthKey.p8
```

### التشغيل

```bash
# تشغيل Backend
cd backend
npm run dev

# في terminal آخر - تشغيل Frontend
cd frontend
npm start
```

الآن افتح المتصفح على: `http://localhost:3000`

## 📖 التوثيق

- [📋 دليل التحسينات الكامل](IMPROVEMENTS.md)
- [🚀 دليل البدء السريع](QUICK_START.md)
- [📡 Socket.IO Events](docs/SOCKET_EVENTS.md)
- [🔌 API Endpoints](docs/API_ENDPOINTS.md)

## 🏗️ البنية التقنية

### Backend Stack
- **Framework:** Express.js
- **Database:** MongoDB + Mongoose
- **Real-time:** Socket.IO
- **Authentication:** JWT
- **Validation:** express-validator
- **Security:** Helmet, CORS, Rate Limiting

### Frontend Stack
- **Framework:** React.js
- **Styling:** CSS3
- **HTTP Client:** Axios
- **Real-time:** Socket.IO Client
- **Notifications:** Browser Notifications API

## 📁 هيكل المشروع

```
HalaChat-Dashboard/
├── backend/
│   ├── config/              # إعدادات (Database, APNS)
│   ├── middleware/          # Authentication, Validation, Activity Logger
│   ├── models/              # Mongoose Models (7 models)
│   ├── routes/              # API Routes (10 routes)
│   ├── validators/          # Express Validator rules
│   ├── utils/               # دوال مساعدة
│   └── server.js            # نقطة البداية
│
├── frontend/
│   ├── public/              # Static files
│   └── src/
│       ├── components/      # React Components
│       ├── layouts/         # Page Layouts
│       ├── pages/           # Application Pages
│       ├── services/        # API, Socket, Notifications
│       └── App.js           # Main App
│
├── IMPROVEMENTS.md          # تقرير التحسينات الشامل
├── QUICK_START.md           # دليل البدء السريع
└── README.md                # هذا الملف
```

## 🔌 API Endpoints الرئيسية

### Authentication
```
POST   /api/auth/register           - تسجيل مستخدم جديد
POST   /api/auth/login              - تسجيل الدخول
GET    /api/auth/me                 - بيانات المستخدم الحالي
PUT    /api/auth/update-profile     - تحديث الملف الشخصي
PUT    /api/auth/change-password    - تغيير كلمة المرور
```

### Users
```
GET    /api/users                   - جميع المستخدمين (Admin)
GET    /api/users/:id               - مستخدم واحد
PUT    /api/users/:id               - تحديث مستخدم
DELETE /api/users/:id               - حذف مستخدم
PUT    /api/users/:id/toggle-active - تفعيل/إلغاء تفعيل
```

### Chat Rooms
```
GET    /api/chat-rooms              - جميع الغرف
GET    /api/chat-rooms/public       - الغرف العامة
GET    /api/chat-rooms/:id          - غرفة واحدة
POST   /api/chat-rooms              - إنشاء غرفة
PUT    /api/chat-rooms/:id          - تحديث غرفة
DELETE /api/chat-rooms/:id          - حذف غرفة
```

### Activity Logs
```
GET    /api/activity-logs           - جميع السجلات
GET    /api/activity-logs/user/:id  - سجلات مستخدم
GET    /api/activity-logs/stats/overview - إحصائيات
DELETE /api/activity-logs/bulk/delete - حذف سجلات قديمة
```

[للمزيد من التفاصيل راجع التوثيق الكامل](docs/API_ENDPOINTS.md)

## 📡 Socket.IO Events

### Client → Server
```javascript
join-conversation    // الانضمام لمحادثة
join-room           // الانضمام لغرفة
leave-conversation  // مغادرة محادثة
leave-room          // مغادرة غرفة
typing              // بدء الكتابة
stop-typing         // إيقاف الكتابة
```

### Server → Client
```javascript
authenticated       // تم التحقق من الهوية
new-message         // رسالة جديدة
users-online        // عدد المتصلين
user-typing         // مستخدم يكتب
user-disconnected   // مستخدم قطع الاتصال
error               // خطأ
```

## 🔐 الأمان

### Implemented Security Features
- ✅ **JWT Authentication** - تسجيل دخول آمن
- ✅ **Socket.IO Authentication** - تحقق من Token قبل الاتصال
- ✅ **Input Validation** - فحص شامل للمدخلات
- ✅ **Rate Limiting** - حماية من الطلبات المتكررة
- ✅ **CORS** - تحديد المصادر المسموحة
- ✅ **Helmet** - تأمين HTTP headers
- ✅ **NoSQL Injection Protection** - mongo-sanitize
- ✅ **Activity Logging** - تتبع جميع العمليات

## 📊 قاعدة البيانات

### Models (7 نماذج)
1. **User** - المستخدمون
2. **ChatRoom** - غرف المحادثة
3. **Conversation** - المحادثات
4. **Message** - الرسائل
5. **Report** - البلاغات
6. **Notification** - الإشعارات
7. **ActivityLog** - سجلات النشاطات

### Indexes (30+ index)
جميع الاستعلامات المهمة محسّنة بـ Indexes للأداء الأمثل.

## 🆕 آخر التحسينات (v2.1.0)

### ✨ تم إضافة
- نظام Activity Logs شامل
- Socket.IO Authentication كامل
- Validation middleware محكم
- 15+ حقل جديد للغرف
- 20+ دالة مساعدة جديدة
- 30+ Database Index

### 🔧 تم الإصلاح
- علاقة Message مع ChatRoom
- التحقق من الصلاحيات في Socket events
- Validation موحّد في جميع Routes

### 📚 تم التحسين
- توثيق شامل ومفصّل
- أداء أفضل مع Indexes
- كود أنظف وأسهل للصيانة

[للمزيد من التفاصيل راجع IMPROVEMENTS.md](IMPROVEMENTS.md)

## 🧪 الاختبار

```bash
# تشغيل الاختبارات (قريباً)
npm test

# تغطية الاختبارات (قريباً)
npm run coverage
```

## 🚀 النشر (Deployment)

### على Heroku
```bash
heroku create halachat-api
heroku addons:create mongolab
git push heroku main
```

### على VPS
```bash
# تثبيت PM2
npm install -g pm2

# تشغيل Backend
cd backend
pm2 start server.js --name halachat-api

# حفظ الإعدادات
pm2 save
pm2 startup
```

## 🤝 المساهمة

نرحب بالمساهمات! يرجى اتباع الخطوات التالية:

1. Fork المشروع
2. أنشئ فرع للميزة (`git checkout -b feature/AmazingFeature`)
3. Commit التغييرات (`git commit -m 'Add some AmazingFeature'`)
4. Push للفرع (`git push origin feature/AmazingFeature`)
5. افتح Pull Request

## 📝 الترخيص

هذا المشروع مرخص تحت MIT License - راجع ملف [LICENSE](LICENSE) للتفاصيل.

## 👨‍💻 المطور

**Developed by:** kaebs19
**Powered by:** Claude Sonnet 4.5

## 📞 الدعم

- 🐛 **Issues:** [GitHub Issues](https://github.com/kaebs19/ChatHalaApi/issues)
- 📧 **Email:** support@halachat.com
- 💬 **Discord:** [Join our community](https://discord.gg/halachat)

## 🗺️ خارطة الطريق

### Q1 2026
- [ ] إضافة Redis للـ Caching
- [ ] Unit Tests شاملة
- [ ] CI/CD Pipeline
- [ ] Docker Support

### Q2 2026
- [ ] نظام الأصدقاء
- [ ] نظام الشارات والإنجازات
- [ ] Analytics Dashboard متقدم
- [ ] Mobile App (React Native)

### Q3 2026
- [ ] المكالمات الصوتية/المرئية
- [ ] نظام البوتات
- [ ] Webhooks API
- [ ] GraphQL Support

---

⭐ إذا أعجبك المشروع، لا تنسَ تقييمه بنجمة على GitHub!

**Version:** 2.1.0
**Last Updated:** January 2026
