# 🔴 عاجل: إبطال مفتاح APNs المكشوف

## ما حدث
`backend/config/AuthKey_43J3HP6K23.p8` (المفتاح الخاص لإشعارات Apple) مُثبَّت في git
منذ أول commit (`719d2ff`)، والمستودع `kaebs19/ChatHalaApi` **عام على GitHub**.
الـ `.gitignore` أُضيف بعد ذلك فلم يُخفِ الملف المتتبَّع.

**الأثر:** أي شخص قرأ المستودع يستطيع إرسال إشعارات push باسم تطبيقك
لأي جهاز يعرف توكنه، ما دام المفتاح صالحاً.

## ما تم تنفيذه هنا
- إزالة الملف من تتبّع git (`git rm --cached`) — الملف باقٍ على قرصك محلياً.

## ما يجب أن تنفّذه أنت (بالترتيب)

### 1. أبطل المفتاح — الآن، قبل أي شيء آخر
1. https://developer.apple.com/account/resources/authkeys/list
2. اختر المفتاح `43J3HP6K23` → **Revoke**
3. أنشئ مفتاحاً جديداً بصلاحية *Apple Push Notifications service (APNs)*
4. نزّل ملف `.p8` الجديد **مرة واحدة** — لا يمكن تنزيله ثانية
5. ضعه على السيرفر خارج مجلد المستودع، مثلاً `/etc/halachat/AuthKey_XXXX.p8`
   (صلاحيات `chmod 600` ومالكه مستخدم التطبيق)
6. حدّث في `.env` على السيرفر:
   ```
   APNS_KEY_ID=<معرّف المفتاح الجديد>
   APNS_KEY_PATH=/etc/halachat/AuthKey_XXXX.p8
   ```
7. `pm2 restart halachat-api` ثم تحقق من الإشعارات عبر `node scripts/testPush.js`

### 2. نظّف تاريخ git (بعد الإبطال، وليس بدلاً منه)
> ⚠️ يعيد كتابة التاريخ ويتطلب `--force`. نسّق مع أي شخص آخر يعمل على المستودع.

```bash
# نسخة احتياطية أولاً
git clone --mirror https://github.com/kaebs19/ChatHalaApi.git ChatHalaApi-backup.git

# التنظيف (يحتاج pip install git-filter-repo)
git filter-repo --path backend/config/AuthKey_43J3HP6K23.p8 --invert-paths --force
git remote add origin https://github.com/kaebs19/ChatHalaApi.git
git push origin --force --all
git push origin --force --tags
```

**ملاحظة مهمة:** حتى بعد التنظيف، النسخ المخبّأة (forks، clones،
كاش GitHub، أرشيفات الطرف الثالث) قد تحتفظ بالمفتاح.
**الإبطال هو الإجراء الفعّال الوحيد** — تنظيف التاريخ إجراء مكمّل.

### 3. راجع خصوصية المستودع
هل يحتاج `ChatHalaApi` أن يكون عاماً؟ إن لم يكن، اجعله private من
Settings → General → Danger Zone → Change visibility.

### 4. تحقّق من أن لا شيء آخر مكشوف
```bash
git log --all --diff-filter=A --name-only --pretty=format: | sort -u | grep -iE '\.env$|serviceAccount|\.p8|\.pem|\.key'
```
(اليوم يرجع الملف المحذوف فقط — يجب أن يعود فارغاً بعد تنظيف التاريخ.)
