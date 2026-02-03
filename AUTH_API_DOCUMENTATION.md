# 🔐 توثيق API المصادقة (Authentication)

## Base URL
```
http://localhost:5001/api
```

---

## 📋 جدول المحتويات
1. [تسجيل مستخدم جديد](#1-تسجيل-مستخدم-جديد)
2. [تسجيل الدخول](#2-تسجيل-الدخول)
3. [الحصول على بيانات المستخدم الحالي](#3-الحصول-على-بيانات-المستخدم-الحالي)
4. [تحديث الملف الشخصي](#4-تحديث-الملف-الشخصي)
5. [تغيير كلمة المرور](#5-تغيير-كلمة-المرور)
6. [نسيت كلمة المرور](#6-نسيت-كلمة-المرور)
7. [إعادة تعيين كلمة المرور](#7-إعادة-تعيين-كلمة-المرور)
8. [رفع صورة الملف الشخصي](#8-رفع-صورة-الملف-الشخصي)
9. [حذف الحساب](#9-حذف-الحساب)

---

## 1. تسجيل مستخدم جديد

### Endpoint
```
POST /api/auth/register
```

### Access
`Public` - لا يحتاج token

### Request Body
```json
{
  "name": "محمد أحمد",
  "email": "mohammed@example.com",
  "password": "123456"
}
```

### Validation Rules
- **name**: مطلوب، نص، 2-50 حرف
- **email**: مطلوب، بريد إلكتروني صالح، فريد
- **password**: مطلوب، 6 أحرف على الأقل

### Success Response (201)
```json
{
  "success": true,
  "message": "تم التسجيل بنجاح",
  "data": {
    "user": {
      "id": "6972694cc8c70046823d546f",
      "name": "محمد أحمد",
      "email": "mohammed@example.com",
      "role": "user"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Error Responses

**400 - جميع الحقول مطلوبة**
```json
{
  "success": false,
  "message": "جميع الحقول مطلوبة"
}
```

**400 - البريد مستخدم بالفعل**
```json
{
  "success": false,
  "message": "البريد الإلكتروني مستخدم بالفعل"
}
```

### cURL Example
```bash
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "محمد أحمد",
    "email": "mohammed@example.com",
    "password": "123456"
  }'
```

### JavaScript Example
```javascript
const response = await fetch('http://localhost:5001/api/auth/register', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'محمد أحمد',
    email: 'mohammed@example.com',
    password: '123456'
  })
});

const data = await response.json();
console.log(data);
```

---

## 2. تسجيل الدخول

### Endpoint
```
POST /api/auth/login
```

### Access
`Public` - لا يحتاج token

### Request Body
```json
{
  "email": "admin@halachat.com",
  "password": "admin123"
}
```

### Validation Rules
- **email**: مطلوب، بريد إلكتروني صالح
- **password**: مطلوب

### Success Response (200)
```json
{
  "success": true,
  "message": "تم تسجيل الدخول بنجاح",
  "data": {
    "user": {
      "id": "6972694cc8c70046823d546f",
      "name": "Admin HalaChat",
      "email": "admin@halachat.com",
      "role": "admin",
      "lastLogin": "2026-01-22T18:16:14.333Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Error Responses

**400 - بيانات ناقصة**
```json
{
  "success": false,
  "message": "البريد الإلكتروني وكلمة المرور مطلوبة"
}
```

**401 - بيانات خاطئة**
```json
{
  "success": false,
  "message": "البريد الإلكتروني أو كلمة المرور خاطئة"
}
```

**401 - حساب غير مفعل**
```json
{
  "success": false,
  "message": "الحساب غير مفعل، تواصل مع الإدارة"
}
```

### cURL Example
```bash
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@halachat.com",
    "password": "admin123"
  }'
```

### JavaScript Example
```javascript
const response = await fetch('http://localhost:5001/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'admin@halachat.com',
    password: 'admin123'
  })
});

const data = await response.json();

// حفظ الـ token
if (data.success) {
  localStorage.setItem('token', data.data.token);
  localStorage.setItem('user', JSON.stringify(data.data.user));
}
```

---

## 3. الحصول على بيانات المستخدم الحالي

### Endpoint
```
GET /api/auth/me
```

### Access
`Private` - يحتاج token

### Headers
```
Authorization: Bearer YOUR_JWT_TOKEN
```

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "6972694cc8c70046823d546f",
      "name": "Admin HalaChat",
      "email": "admin@halachat.com",
      "role": "admin",
      "isActive": true,
      "lastLogin": "2026-01-22T18:16:14.333Z",
      "createdAt": "2026-01-22T10:00:00.000Z"
    }
  }
}
```

### Error Responses

**401 - لا يوجد token**
```json
{
  "success": false,
  "message": "غير مصرح، لا يوجد token"
}
```

**401 - token غير صالح**
```json
{
  "success": false,
  "message": "Token غير صالح"
}
```

### cURL Example
```bash
curl -X GET http://localhost:5001/api/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### JavaScript Example
```javascript
const token = localStorage.getItem('token');

const response = await fetch('http://localhost:5001/api/auth/me', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
console.log(data);
```

---

## 4. تحديث الملف الشخصي

### Endpoint
```
PUT /api/auth/update-profile
```

### Access
`Private` - يحتاج token

### Headers
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

### Request Body
```json
{
  "name": "محمد أحمد السعيد",
  "email": "mohammed.new@example.com",
  "profileImage": "/uploads/profile-images/profile-123456.jpg",
  "birthDate": "1990-01-15",
  "gender": "male",
  "country": "Saudi Arabia",
  "bio": "مطور برمجيات متخصص في تطوير تطبيقات الويب"
}
```

### Validation Rules
- **name**: اختياري، 2-50 حرف
- **email**: اختياري، بريد إلكتروني صالح
- **profileImage**: اختياري، مسار الصورة
- **birthDate**: اختياري، تاريخ بصيغة ISO8601
- **gender**: اختياري، male أو female
- **country**: اختياري، 2-50 حرف
- **bio**: اختياري، حتى 500 حرف

### Success Response (200)
```json
{
  "success": true,
  "message": "تم تحديث البيانات بنجاح",
  "data": {
    "user": {
      "id": "6972694cc8c70046823d546f",
      "name": "محمد أحمد السعيد",
      "email": "mohammed.new@example.com",
      "role": "user",
      "isActive": true
    }
  }
}
```

### cURL Example
```bash
curl -X PUT http://localhost:5001/api/auth/update-profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "محمد أحمد السعيد",
    "email": "mohammed.new@example.com"
  }'
```

### JavaScript Example
```javascript
const token = localStorage.getItem('token');

const response = await fetch('http://localhost:5001/api/auth/update-profile', {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'محمد أحمد السعيد',
    email: 'mohammed.new@example.com'
  })
});

const data = await response.json();
console.log(data);
```

---

## 5. تغيير كلمة المرور

### Endpoint
```
PUT /api/auth/change-password
```

### Access
`Private` - يحتاج token

### Headers
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

### Request Body
```json
{
  "currentPassword": "123456",
  "newPassword": "newpass123"
}
```

### Validation Rules
- **currentPassword**: مطلوب
- **newPassword**: مطلوب، 6 أحرف على الأقل

### Success Response (200)
```json
{
  "success": true,
  "message": "تم تغيير كلمة المرور بنجاح"
}
```

### Error Responses

**400 - بيانات ناقصة**
```json
{
  "success": false,
  "message": "كلمة المرور الحالية والجديدة مطلوبة"
}
```

**400 - كلمة مرور قصيرة**
```json
{
  "success": false,
  "message": "كلمة المرور يجب أن تكون 6 أحرف على الأقل"
}
```

**400 - كلمة مرور حالية خاطئة**
```json
{
  "success": false,
  "message": "كلمة المرور الحالية غير صحيحة"
}
```

### cURL Example
```bash
curl -X PUT http://localhost:5001/api/auth/change-password \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "123456",
    "newPassword": "newpass123"
  }'
```

### JavaScript Example
```javascript
const token = localStorage.getItem('token');

const response = await fetch('http://localhost:5001/api/auth/change-password', {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    currentPassword: '123456',
    newPassword: 'newpass123'
  })
});

const data = await response.json();
console.log(data);
```

---

## 🔑 استخدام JWT Token

بعد تسجيل الدخول أو التسجيل بنجاح، ستحصل على `token`. استخدمه في جميع الطلبات المحمية:

### في Headers
```
Authorization: Bearer YOUR_JWT_TOKEN
```

### مثال في Axios
```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5001/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

// إضافة Token تلقائياً
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

---

## 6. نسيت كلمة المرور

### Endpoint
```
POST /api/auth/forgot-password
```

### Access
`Public` - لا يحتاج token

### Request Body
```json
{
  "email": "mohammed@example.com"
}
```

### Validation Rules
- **email**: مطلوب، بريد إلكتروني صالح

### Success Response (200)
```json
{
  "success": true,
  "message": "تم إرسال رمز إعادة تعيين كلمة المرور إلى بريدك الإلكتروني"
}
```

### Error Responses

**400 - البريد مطلوب**
```json
{
  "success": false,
  "message": "البريد الإلكتروني مطلوب"
}
```

**404 - المستخدم غير موجود**
```json
{
  "success": false,
  "message": "لا يوجد مستخدم بهذا البريد الإلكتروني"
}
```

### cURL Example
```bash
curl -X POST http://localhost:5001/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "mohammed@example.com"
  }'
```

### JavaScript Example
```javascript
const response = await fetch('http://localhost:5001/api/auth/forgot-password', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'mohammed@example.com'
  })
});

const data = await response.json();
console.log(data);
```

### ملاحظات
- يتم إرسال رمز مكون من 6 أرقام إلى البريد الإلكتروني
- الرمز صالح لمدة 10 دقائق فقط
- يتم تشفير الرمز في قاعدة البيانات باستخدام SHA-256

---

## 7. إعادة تعيين كلمة المرور

### Endpoint
```
POST /api/auth/reset-password
```

### Access
`Public` - لا يحتاج token

### Request Body
```json
{
  "email": "mohammed@example.com",
  "resetToken": "123456",
  "newPassword": "newPass123"
}
```

### Validation Rules
- **email**: مطلوب، بريد إلكتروني صالح
- **resetToken**: مطلوب، رمز التحقق المكون من 6 أرقام
- **newPassword**: مطلوب، 6 أحرف على الأقل

### Success Response (200)
```json
{
  "success": true,
  "message": "تم إعادة تعيين كلمة المرور بنجاح"
}
```

### Error Responses

**400 - بيانات ناقصة**
```json
{
  "success": false,
  "message": "جميع الحقول مطلوبة"
}
```

**400 - رمز غير صحيح أو منتهي**
```json
{
  "success": false,
  "message": "رمز التحقق غير صحيح أو منتهي الصلاحية"
}
```

### cURL Example
```bash
curl -X POST http://localhost:5001/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "mohammed@example.com",
    "resetToken": "123456",
    "newPassword": "newPass123"
  }'
```

### JavaScript Example
```javascript
const response = await fetch('http://localhost:5001/api/auth/reset-password', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'mohammed@example.com',
    resetToken: '123456',
    newPassword: 'newPass123'
  })
});

const data = await response.json();
console.log(data);
```

---

## 8. رفع صورة الملف الشخصي

### Endpoint
```
POST /api/auth/upload-profile-image
```

### Access
`Private` - يحتاج token

### Headers
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: multipart/form-data
```

### Request Body (FormData)
```javascript
const formData = new FormData();
formData.append('profileImage', fileInput.files[0]);
```

### Validation Rules
- **profileImage**: مطلوب، ملف صورة (JPEG, PNG, GIF, WEBP)
- **حجم الملف**: أقصى حد 5MB

### Success Response (200)
```json
{
  "success": true,
  "message": "تم رفع الصورة بنجاح",
  "data": {
    "profileImage": "/uploads/profile-images/profile-1234567890-123456789.jpg",
    "user": {
      "id": "6972694cc8c70046823d546f",
      "name": "محمد أحمد",
      "email": "mohammed@example.com",
      "profileImage": "/uploads/profile-images/profile-1234567890-123456789.jpg"
    }
  }
}
```

### Error Responses

**400 - لم يتم رفع صورة**
```json
{
  "success": false,
  "message": "لم يتم رفع أي صورة"
}
```

**400 - نوع ملف غير مدعوم**
```json
{
  "success": false,
  "message": "نوع الملف غير مدعوم. يرجى رفع صورة فقط (JPEG, PNG, GIF, WEBP)"
}
```

### cURL Example
```bash
curl -X POST http://localhost:5001/api/auth/upload-profile-image \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "profileImage=@/path/to/image.jpg"
```

### JavaScript Example
```javascript
const token = localStorage.getItem('token');
const fileInput = document.getElementById('fileInput');
const formData = new FormData();
formData.append('profileImage', fileInput.files[0]);

const response = await fetch('http://localhost:5001/api/auth/upload-profile-image', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const data = await response.json();
console.log(data);
```

### ملاحظات
- يتم حذف الصورة القديمة تلقائياً عند رفع صورة جديدة
- يتم حفظ الصورة في مجلد `/uploads/profile-images/`
- يمكن الوصول للصورة عبر: `http://localhost:5001/uploads/profile-images/filename.jpg`

---

## 9. حذف الحساب

### Endpoint
```
DELETE /api/auth/delete-account
```

### Access
`Private` - يحتاج token

### Headers
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

### Request Body
```json
{
  "password": "123456"
}
```

### Validation Rules
- **password**: مطلوب للتأكيد

### Success Response (200)
```json
{
  "success": true,
  "message": "تم حذف الحساب بنجاح"
}
```

### Error Responses

**400 - كلمة المرور مطلوبة**
```json
{
  "success": false,
  "message": "كلمة المرور مطلوبة لتأكيد حذف الحساب"
}
```

**401 - كلمة مرور خاطئة**
```json
{
  "success": false,
  "message": "كلمة المرور غير صحيحة"
}
```

### cURL Example
```bash
curl -X DELETE http://localhost:5001/api/auth/delete-account \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "password": "123456"
  }'
```

### JavaScript Example
```javascript
const token = localStorage.getItem('token');

const response = await fetch('http://localhost:5001/api/auth/delete-account', {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    password: '123456'
  })
});

const data = await response.json();
console.log(data);
```

### تحذيرات
- ⚠️ حذف الحساب عملية **نهائية ولا يمكن التراجع عنها**
- يتم حذف جميع بيانات المستخدم بما في ذلك:
  - صورة الملف الشخصي
  - جميع المحادثات والرسائل
  - جميع الإعدادات
- يُنصح بتنزيل نسخة من بياناتك قبل الحذف

---

## 📊 حسابات تجريبية متاحة

### حساب المدير
```
البريد: admin@halachat.com
كلمة المرور: admin123
الصلاحية: admin
```

### حساب مستخدم 1
```
البريد: mohammed@halachat.com
كلمة المرور: 123456
الصلاحية: user
```

### حساب مستخدم 2
```
البريد: fatima@halachat.com
كلمة المرور: 123456
الصلاحية: user
```

### حساب مستخدم 3
```
البريد: khaled@halachat.com
كلمة المرور: 123456
الصلاحية: user
```

---

## 🧪 اختبار API باستخدام Postman

### Collection Structure
```
HalaChat API/
├── Auth/
│   ├── Register
│   ├── Login
│   ├── Get Me
│   ├── Update Profile
│   └── Change Password
```

### Environment Variables
```json
{
  "baseUrl": "http://localhost:5001/api",
  "token": "{{YOUR_TOKEN_WILL_BE_HERE}}"
}
```

---

## 🔒 الأمان

1. **تشفير كلمات المرور**: يتم تشفير كلمات المرور باستخدام `bcryptjs`
2. **JWT Tokens**: صالحة لمدة 7 أيام (يمكن تغييرها في `.env`)
3. **Validation**: جميع المدخلات يتم التحقق منها
4. **Rate Limiting**: حماية ضد الهجمات
5. **Activity Logging**: تسجيل جميع عمليات التسجيل

---

## 📝 ملخص التغييرات في النسخة 2.2.0

### ميزات جديدة
1. ✅ نظام استعادة كلمة المرور عبر البريد الإلكتروني
   - إرسال رمز التحقق المكون من 6 أرقام
   - صلاحية الرمز 10 دقائق
   - تشفير الرمز في قاعدة البيانات

2. ✅ حقول الملف الشخصي الموسعة
   - صورة الملف الشخصي (profileImage)
   - تاريخ الميلاد (birthDate)
   - الجنس (gender)
   - الدولة (country)
   - النبذة الشخصية (bio - حتى 500 حرف)

3. ✅ نظام رفع الصور
   - دعم أنواع: JPEG, PNG, GIF, WEBP
   - حد أقصى: 5MB
   - حذف تلقائي للصور القديمة

4. ✅ حذف الحساب
   - تأكيد بكلمة المرور
   - حذف جميع البيانات المرتبطة
   - تسجيل النشاط

### تحسينات الأمان
- تشفير رموز إعادة تعيين كلمة المرور
- فلترة أنواع الملفات المرفوعة
- تسجيل جميع العمليات الحساسة
- التحقق من كلمة المرور قبل الحذف

---

**تم التوثيق بواسطة:** HalaChat Team
**آخر تحديث:** 23 يناير 2026
**النسخة:** 2.2.0
