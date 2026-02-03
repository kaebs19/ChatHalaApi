# HalaChat Mobile API Documentation
## توثيق API للتطبيق (Flutter/iOS/Android)

**Base URL:** `https://api.halachat.khalafiati.io/api`

---

## 🔐 Authentication (المصادقة)

### 1. تسجيل مستخدم جديد
```http
POST /auth/register
Content-Type: application/json

{
  "name": "اسم المستخدم",
  "email": "user@example.com",
  "password": "123456",
  "gender": "male",        // male | female (اختياري)
  "country": "SA",         // كود الدولة (اختياري)
  "birthDate": "1990-01-15" // تاريخ الميلاد (اختياري)
}
```

**Response:**
```json
{
  "success": true,
  "message": "تم إنشاء الحساب بنجاح",
  "data": {
    "user": { "_id": "...", "name": "...", "email": "..." },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

---

### 2. تسجيل الدخول
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "123456"
}
```

---

### 3. تسجيل الدخول عبر Google
```http
POST /auth/google
Content-Type: application/json

{
  "idToken": "Google_ID_Token_من_Firebase_Auth"
}
```

---

### 4. تسجيل الدخول عبر Apple
```http
POST /auth/apple
Content-Type: application/json

{
  "identityToken": "Apple_Identity_Token",
  "authorizationCode": "Apple_Authorization_Code",
  "fullName": {
    "givenName": "الاسم الأول",
    "familyName": "اسم العائلة"
  }
}
```

---

### 5. نسيت كلمة المرور
```http
POST /auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**Response:** يرسل رمز مكون من 6 أرقام للبريد

---

### 6. إعادة تعيين كلمة المرور
```http
POST /auth/reset-password
Content-Type: application/json

{
  "email": "user@example.com",
  "resetCode": "123456",
  "newPassword": "newPassword123"
}
```

---

## 👤 Profile (الملف الشخصي)

### الحصول على ملفي الشخصي
```http
GET /auth/me
Authorization: Bearer {token}
```

### تحديث الملف الشخصي
```http
PUT /auth/profile
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "الاسم الجديد",
  "bio": "نبذة عني",
  "gender": "male",
  "country": "SA",
  "birthDate": "1990-01-15"
}
```

### رفع صورة الملف الشخصي
```http
POST /auth/profile/image
Authorization: Bearer {token}
Content-Type: multipart/form-data

profileImage: (file)
```

### تغيير كلمة المرور
```http
PUT /auth/change-password
Authorization: Bearer {token}
Content-Type: application/json

{
  "currentPassword": "oldPassword",
  "newPassword": "newPassword123"
}
```

---

## 📱 Device Token (FCM للإشعارات)

### تسجيل FCM Token
```http
POST /mobile/device/register-token
Authorization: Bearer {token}
Content-Type: application/json

{
  "fcmToken": "Firebase_FCM_Token",
  "platform": "ios",           // ios | android
  "osVersion": "17.0",
  "appVersion": "1.0.0"
}
```

### تحديث FCM Token
```http
PUT /mobile/device/update-token
Authorization: Bearer {token}
Content-Type: application/json

{
  "fcmToken": "New_FCM_Token"
}
```

### إلغاء تسجيل Token (عند تسجيل الخروج)
```http
DELETE /mobile/device/unregister-token
Authorization: Bearer {token}
```

---

## 🔍 Users Search (البحث عن مستخدمين)

### البحث عن مستخدمين
```http
GET /mobile/users/search?q=أحمد&gender=male&country=SA&minAge=18&maxAge=30&page=1&limit=20
Authorization: Bearer {token}
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| q | string | بحث بالاسم (اختياري) |
| gender | string | male / female |
| country | string | كود الدولة (SA, AE, EG...) |
| minAge | number | أقل عمر |
| maxAge | number | أكبر عمر |
| page | number | رقم الصفحة (default: 1) |
| limit | number | عدد النتائج (default: 20) |

---

## 🚫 Block Users (حظر المستخدمين)

### حظر مستخدم
```http
POST /mobile/users/block/{userId}
Authorization: Bearer {token}
```

### إلغاء حظر مستخدم
```http
POST /mobile/users/unblock/{userId}
Authorization: Bearer {token}
```

### قائمة المحظورين
```http
GET /mobile/users/blocked
Authorization: Bearer {token}
```

---

## 💬 Conversations (المحادثات)

### طلب بدء محادثة
```http
POST /mobile/conversations/request
Authorization: Bearer {token}
Content-Type: application/json

{
  "targetUserId": "user_id_here",
  "initialMessage": "مرحباً، كيف حالك؟"  // اختياري
}
```

### قبول طلب محادثة
```http
PUT /mobile/conversations/{conversationId}/accept
Authorization: Bearer {token}
```

### رفض طلب محادثة
```http
PUT /mobile/conversations/{conversationId}/reject
Authorization: Bearer {token}
```

### طلبات المحادثة المعلقة
```http
GET /mobile/conversations/pending
Authorization: Bearer {token}
```

### محادثاتي النشطة
```http
GET /mobile/conversations?page=1&limit=20
Authorization: Bearer {token}
```

---

## 📨 Messages (الرسائل)

### إرسال رسالة
```http
POST /mobile/messages/send
Authorization: Bearer {token}
Content-Type: application/json

{
  "conversationId": "conversation_id",
  "content": "نص الرسالة",
  "type": "text"  // text | image | audio | video | file
}
```

### جلب رسائل محادثة
```http
GET /mobile/messages/{conversationId}?page=1&limit=50
Authorization: Bearer {token}
```

---

## 🔔 Notifications (الإشعارات)

### جلب الإشعارات
```http
GET /mobile/notifications?page=1&limit=20
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "notifications": [...],
    "total": 45,
    "unreadCount": 5,
    "currentPage": 1,
    "totalPages": 3
  }
}
```

### تحديد إشعار كمقروء
```http
PUT /mobile/notifications/{notificationId}/read
Authorization: Bearer {token}
```

### تحديد الكل كمقروء
```http
PUT /mobile/notifications/read-all
Authorization: Bearer {token}
```

---

## ⚠️ Reports (البلاغات)

### إنشاء بلاغ
```http
POST /mobile/reports
Authorization: Bearer {token}
Content-Type: application/json

{
  "reportedUser": "user_id",
  "reason": "harassment",   // spam | inappropriate | harassment | fake_profile | other
  "description": "وصف إضافي"  // اختياري
}
```

### بلاغاتي
```http
GET /mobile/reports/my
Authorization: Bearer {token}
```

---

## 🔐 Privacy Settings (إعدادات الخصوصية)

### جلب إعدادات الخصوصية
```http
GET /privacy/settings
Authorization: Bearer {token}
```

### تحديث إعدادات الخصوصية
```http
PUT /privacy/settings
Authorization: Bearer {token}
Content-Type: application/json

{
  "profileVisibility": "public",  // public | contacts | private
  "showLastSeen": true,
  "notificationSound": true
}
```

---

## 🔌 Socket.IO (Real-time)

### الاتصال
```javascript
const socket = io('https://api.halachat.khalafiati.io', {
  auth: {
    token: 'JWT_TOKEN_HERE'
  }
});
```

### Events (الأحداث)

**Client → Server:**
```javascript
// الانضمام لمحادثة
socket.emit('join-conversation', conversationId);

// مغادرة محادثة
socket.emit('leave-conversation', conversationId);

// الكتابة
socket.emit('typing', { conversationId, userName });

// التوقف عن الكتابة
socket.emit('stop-typing', { conversationId });
```

**Server → Client:**
```javascript
// تم التحقق
socket.on('authenticated', (data) => { ... });

// رسالة جديدة
socket.on('new-message', (message) => { ... });

// مستخدم يكتب
socket.on('user-typing', ({ userName, isTyping }) => { ... });

// مستخدم متصل
socket.on('user:online', ({ userId }) => { ... });

// مستخدم قطع الاتصال
socket.on('user:offline', ({ userId }) => { ... });

// طلب محادثة جديد
socket.on('conversation:request', (data) => { ... });

// تم قبول المحادثة
socket.on('conversation-accepted', (data) => { ... });

// إشعار جديد
socket.on('notification', (notification) => { ... });
```

---

## 📱 Firebase Setup (Flutter)

### 1. تثبيت الحزم
```yaml
dependencies:
  firebase_core: ^latest
  firebase_messaging: ^latest
```

### 2. تسجيل Token عند بدء التطبيق
```dart
import 'package:firebase_messaging/firebase_messaging.dart';

Future<void> setupFCM() async {
  // طلب صلاحية الإشعارات (iOS)
  NotificationSettings settings = await FirebaseMessaging.instance.requestPermission();

  // الحصول على Token
  String? fcmToken = await FirebaseMessaging.instance.getToken();

  if (fcmToken != null) {
    // إرسال للـ Backend
    await api.post('/mobile/device/register-token', {
      'fcmToken': fcmToken,
      'platform': Platform.isIOS ? 'ios' : 'android',
      'appVersion': '1.0.0'
    });
  }

  // الاستماع لتحديث Token
  FirebaseMessaging.instance.onTokenRefresh.listen((newToken) {
    api.put('/mobile/device/update-token', {'fcmToken': newToken});
  });
}
```

### 3. استقبال الإشعارات
```dart
// Foreground
FirebaseMessaging.onMessage.listen((RemoteMessage message) {
  print('Got a message: ${message.notification?.title}');
  // عرض إشعار محلي
});

// Background/Terminated
FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
  // فتح صفحة معينة حسب البيانات
  final data = message.data;
  if (data['type'] == 'new_message') {
    Navigator.push(context, ChatScreen(conversationId: data['conversationId']));
  }
});
```

---

## ❌ Error Codes

| Code | Message |
|------|---------|
| 400 | بيانات غير صالحة |
| 401 | غير مصرح / Token منتهي |
| 403 | ليس لديك صلاحية |
| 404 | غير موجود |
| 429 | عدد كبير من المحاولات |
| 500 | خطأ في السيرفر |

---

## 📞 Support

- **API Issues:** تواصل مع مدير المشروع
- **Dashboard:** https://halachat.khalafiati.io/
