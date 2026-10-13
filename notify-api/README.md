# BaSaya notify-api

Sends the "new lesson" push notification to every student in a class. Runs free on Vercel (Hobby plan, no card).

`POST /api/notify-lesson` with `Authorization: Bearer <teacher ID token>` and `{ classId, lessonIds }`.
It checks that the caller teaches the class, then sends one FCM message to the topic `class_<classId>`. The Android app subscribes to that topic when the student opens the Home screen.

## Deploy (one time)

1. **Service account key:** Firebase Console → Project settings → Service accounts → *Generate new private key*. Keep the file private and never commit it.
2. **Vercel project:** on vercel.com, choose *Add New → Project* and import this repository. Set **Root Directory** to `notify-api`, then deploy.
3. **Environment variables** (Vercel → Project → Settings → Environment Variables), then redeploy:
   | Name | Value |
   |---|---|
   | `FIREBASE_SERVICE_ACCOUNT` | the whole content of the JSON key file |
   | `ALLOWED_ORIGINS` | where the teacher site runs, comma-separated, e.g. `http://localhost,https://basaya.web.app` |
   | `NOTIFY_TIME_ZONE` | optional, default `Asia/Manila` |
4. Put the deployment URL in `../firebase-config.js` as `notifyApiUrl`, e.g. `"https://basaya-notify-api.vercel.app"`.

If the notification fails (for example because the teacher's internet dropped), the class page shows a **Notify students** button on that lesson.
