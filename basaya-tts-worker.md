# basaya-tts Worker: full code

The Cloudflare Worker behind **Generate audio** (Admin → Add lesson → Lecture and Pronunciation). The website calls it at `https://basaya-tts.jayvanzsingca5.workers.dev` (`js/tts.js`).

## Why it changed

`ALLOWED_ORIGIN` used to be compared as one exact address, so it could allow only one site. Now it can list several, separated by commas:

```
ALLOWED_ORIGIN = http://localhost,https://basaya.onrender.com
```

Only the address check near the bottom is new (`isAllowedOrigin`, `corsHeaders`, `preflightResponse`). Everything else is the same as before.

## How to deploy

1. Cloudflare dashboard → **Workers & Pages** → **basaya-tts** → **Edit code**.
2. Click in the code, press **Ctrl+A**, and delete everything.
3. Paste the code below.
4. Click **Deploy** (top right). If an error appears, fix it before leaving the page: an error means the old version keeps running.
5. Check **Deployments**: the newest version should be **Active at 100%**.

Settings the Worker needs (**Settings → Variables and Secrets**, and **Bindings**):

| Name | Kind | Value |
|---|---|---|
| `ALLOWED_ORIGIN` | Variable | `http://localhost,https://basaya.onrender.com` |
| `FIREBASE_PROJECT_ID` | Variable | `basaya` |
| `ELEVENLABS_API_KEY` | Secret | Your ElevenLabs key (never put it in this file) |
| `AUDIO_BUCKET` | R2 bucket binding | The bucket that stores lesson audio |

## Code

```js
const DEFAULT_VOICE_ID = "HBvmy37rj1IsebuFhjqA";
const MAX_TEXT_LENGTH = 1500;
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return preflightResponse(request, env);
    }

    try {
      if (url.pathname === "/") {
        return json(
          {
            status: "ok",
            message: "BaSaya TTS service is online.",
          },
          200,
          request,
          env,
        );
      }

      // Learner app uses this URL to play previously generated audio.
      if (request.method === "GET" && url.pathname.startsWith("/audio/")) {
        return getAudio(url, env);
      }

      // Teacher/admin sends lecture text here to generate preview audio.
      if (request.method === "POST" && url.pathname === "/generate") {
        await requireTeacherOrAdmin(request, env);

        const body = await request.json();
        const text = String(body.text || "").trim();
        const voiceId = String(body.voiceId || DEFAULT_VOICE_ID).trim();

        if (!text) {
          return json({ error: "Text is required." }, 400, request, env);
        }

        if (text.length > MAX_TEXT_LENGTH) {
          return json(
            { error: `Text must be ${MAX_TEXT_LENGTH} characters or fewer.` },
            400,
            request,
            env,
          );
        }

        if (!/^[A-Za-z0-9_-]{1,100}$/.test(voiceId)) {
          return json({ error: "Invalid voice ID." }, 400, request, env);
        }

        const elevenLabsResponse = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "audio/mpeg",
              "xi-api-key": env.ELEVENLABS_API_KEY,
            },
            body: JSON.stringify({
              text,
              model_id: "eleven_multilingual_v2",
            }),
          },
        );

        if (!elevenLabsResponse.ok) {
          console.error(
            "ElevenLabs error:",
            elevenLabsResponse.status,
            await elevenLabsResponse.text(),
          );
          return json(
            { error: "ElevenLabs could not generate the audio." },
            502,
            request,
            env,
          );
        }

        return new Response(elevenLabsResponse.body, {
          headers: {
            ...corsHeaders(request, env),
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
          },
        });
      }

      // Teacher/admin sends the already-previewed MP3 here when saving a lesson.
      if (request.method === "POST" && url.pathname === "/save-audio") {
        await requireTeacherOrAdmin(request, env);

        const form = await request.formData();
        const audio = form.get("audio");
        const lessonId = String(form.get("lessonId") || "");
        const section = String(form.get("section") || "");
        const pageNumber = String(form.get("pageNumber") || "0");
        const sentenceIndex = String(form.get("sentenceIndex") || "0");

        if (
          !audio ||
          typeof audio.arrayBuffer !== "function" ||
          audio.size > MAX_AUDIO_BYTES
        ) {
          return json(
            { error: "Upload one MP3 file smaller than 15 MB." },
            400,
            request,
            env,
          );
        }

        if (!/^[A-Za-z0-9_-]{1,128}$/.test(lessonId)) {
          return json({ error: "Invalid lesson ID." }, 400, request, env);
        }

        if (!["lectures", "pronunciation"].includes(section)) {
          return json({ error: "Invalid lesson section." }, 400, request, env);
        }

        if (!/^\d+$/.test(pageNumber) || !/^\d+$/.test(sentenceIndex)) {
          return json({ error: "Invalid page or sentence number." }, 400, request, env);
        }

        const key =
          `lessons/${lessonId}/${section}/page-${pageNumber}/` +
          `sentence-${sentenceIndex}-${crypto.randomUUID()}.mp3`;

        await env.AUDIO_BUCKET.put(key, await audio.arrayBuffer(), {
          httpMetadata: {
            contentType: "audio/mpeg",
            cacheControl: "public, max-age=31536000, immutable",
          },
        });

        return json(
          {
            storageKey: key,
            audioUrl: publicAudioUrl(request, key),
          },
          200,
          request,
          env,
        );
      }

      return json({ error: "Not found." }, 404, request, env);
    } catch (error) {
      console.error(error);
      return json(
        { error: error.message || "Unexpected server error." },
        error.status || 500,
        request,
        env,
      );
    }
  },
};

async function requireTeacherOrAdmin(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    throw httpError("Please sign in first.", 401);
  }

  const token = authorization.slice("Bearer ".length);
  const payload = readJwtPayload(token);
  const uid = payload.user_id || payload.sub;

  if (!uid) {
    throw httpError("Invalid sign-in token.", 401);
  }

  // Firestore validates the Firebase sign-in token and lets us read only
  // the caller's own profile. This prevents students from using TTS credits.
  const profileResponse = await fetch(
    `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!profileResponse.ok) {
    throw httpError("Your account could not be verified.", 403);
  }

  const profile = await profileResponse.json();
  const role = profile.fields?.role?.stringValue;

  if (role !== "teacher" && role !== "admin") {
    throw httpError("Only teachers and admins can generate audio.", 403);
  }

  return { uid, role };
}

function readJwtPayload(token) {
  try {
    const part = token.split(".")[1];
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    throw httpError("Invalid sign-in token.", 401);
  }
}

async function getAudio(url, env) {
  const key = decodeURIComponent(url.pathname.slice("/audio/".length));

  if (!key || key.includes("..")) {
    return new Response("Invalid audio path.", { status: 400 });
  }

  const audio = await env.AUDIO_BUCKET.get(key);

  if (!audio) {
    return new Response("Audio not found.", { status: 404 });
  }

  return new Response(audio.body, {
    headers: {
      "Content-Type": audio.httpMetadata?.contentType || "audio/mpeg",
      "Content-Length": String(audio.size),
      "Cache-Control":
        audio.httpMetadata?.cacheControl || "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function publicAudioUrl(request, key) {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return new URL(`/audio/${encodedKey}`, request.url).toString();
}

// ALLOWED_ORIGIN may list several sites, separated by commas.
function isAllowedOrigin(origin, env) {
  if (!origin) return false;
  return String(env.ALLOWED_ORIGIN || "")
    .split(",")
    .map((value) => value.trim().replace(/\/+$/, ""))
    .includes(origin);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");

  if (isAllowedOrigin(origin, env)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      Vary: "Origin",
    };
  }

  return {};
}

function preflightResponse(request, env) {
  const origin = request.headers.get("Origin");

  if (!isAllowedOrigin(origin, env)) {
    return new Response("Origin not allowed.", { status: 403 });
  }

  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request, env),
      "Access-Control-Max-Age": "86400",
    },
  });
}

function json(data, status, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(request, env),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}
```
