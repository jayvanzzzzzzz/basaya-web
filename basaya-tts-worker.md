# basaya-tts Worker: full code

The Cloudflare Worker behind **Generate audio** (Admin → Add lesson → Lecture and Pronunciation). The website calls it at `https://basaya-tts.jayvanzsingca5.workers.dev` (`js/tts.js`).

## Why it changed

**Dictionary audio (latest change):** the speaker button in the Diksiyonaryo (admin, teacher, student website and the app) reads the word aloud. A new address, `/dictionary-audio`, takes a word's search key (`{ "key": "bahay" }`) from **anyone signed in, students too**. It checks that the word really is in the dictionary (a teacher's word in Firestore, else the Wiktionary file the website serves) and reads the spelling from there, never text sent by the caller. Then it makes the MP3 with ElevenLabs **once** and saves it in R2 as `dictionary/<key>/<16-letter fingerprint of the spelling>.mp3`. Every later tap, from anyone, plays that saved file through `/audio/` and never reaches ElevenLabs. So the most this can ever cost is about $0.45 for all 1,600 Wiktionary words, plus a little for each word teachers add. A changed accented spelling (aklat → aklát) gets a new fingerprint, so its audio is made again. Only `/dictionary-audio`, `requireSignedIn` (split out of `requireTeacherOrAdmin`, which still allows only teachers and admins) and the dictionary helpers at the bottom are new. The Wiktionary file is read from the website's GitHub repository, because the first tries against the Render site failed with "The dictionary file could not be loaded" (the free Render site sleeps, and GitHub is always awake). The file reaches GitHub when you push, so push `data/dictionary/tl-seed.json` changes before expecting new seed words to speak.

**Word timings:** the Lecture now highlights each word as it is spoken. When the website sends `"timings": true` to `/generate`, the Worker asks ElevenLabs for the audio *with timestamps* and returns JSON (`audioBase64` + `alignment`: when each letter is spoken) instead of the bare MP3. Without `"timings": true` it answers exactly as before. Only `/generate` changed (the `wantTimings` part). The website works with both the old and the new Worker: until this code is deployed, new audio simply has no exact timings and the Lecture estimates them.

**Voice model:** `MODEL_ID` (top of the code) is now `eleven_v4_turbo` instead of `eleven_multilingual_v2`. Opening the Worker address in a browser now also shows which model it uses (`"model"`). It costs half as much ($0.04 instead of $0.08 per 1,000 characters) and supports Filipino. Audio that was already saved is not touched; only newly generated audio uses v4 Turbo.

**Earlier change:** `ALLOWED_ORIGIN` used to be compared as one exact address, so it could allow only one site. Now it can list several, separated by commas:

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
| `DICTIONARY_SEED_URL` | Variable (optional) | Leave it out to use GitHub's copy (`raw.githubusercontent.com/jayvanzzzzzzz/basaya-web/main/data/dictionary/tl-seed.json`). Set it only to read the file from somewhere else. |
| `ELEVENLABS_API_KEY` | Secret | Your ElevenLabs key (never put it in this file) |
| `AUDIO_BUCKET` | R2 bucket binding | The bucket that stores lesson audio |

## Code

```js
const DEFAULT_VOICE_ID = "HBvmy37rj1IsebuFhjqA";
const MODEL_ID = "eleven_v4_turbo";
const MAX_TEXT_LENGTH = 1500;
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const MAX_DICTIONARY_KEY = 60;
// The website's Wiktionary file, from GitHub (always awake, unlike a sleeping Render site).
const DEFAULT_DICTIONARY_SEED_URL =
  "https://raw.githubusercontent.com/jayvanzzzzzzz/basaya-web/main/data/dictionary/tl-seed.json";
// Wiktionary words (search key → spelling to say), kept while this copy of the Worker is warm.
let dictionarySeed = null;

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
            model: MODEL_ID,
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
        // Lecture sentences ask for word timings so the student's screen can follow the voice.
        const wantTimings = body.timings === true;

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
          `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}` +
            `${wantTimings ? "/with-timestamps" : ""}?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: wantTimings ? "application/json" : "audio/mpeg",
              "xi-api-key": env.ELEVENLABS_API_KEY,
            },
            body: JSON.stringify({
              text,
              model_id: MODEL_ID,
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

        if (wantTimings) {
          // { audio_base64, alignment: { characters, character_start_times_seconds, ... } }
          const result = await elevenLabsResponse.json();
          return new Response(
            JSON.stringify({
              audioBase64: result.audio_base64,
              alignment: result.alignment || null,
            }),
            {
              headers: {
                ...corsHeaders(request, env),
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store",
              },
            },
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

      // Anyone signed in (students too) asks for a dictionary word's audio by its search key.
      // The spelling comes from the dictionary, not the caller, and is made only once.
      if (request.method === "POST" && url.pathname === "/dictionary-audio") {
        const { token } = await requireSignedIn(request, env);

        const body = await request.json();
        const key = String(body.key || "");

        if (!key || key.length > MAX_DICTIONARY_KEY || key.includes("/") || key.includes("..")) {
          return json({ error: "Invalid word." }, 400, request, env);
        }

        const text = await dictionaryText(key, token, env);
        if (!text) {
          return json({ error: "This word isn't in the dictionary." }, 404, request, env);
        }

        const storageKey = await dictionaryAudioKey(key, text);

        if (!(await env.AUDIO_BUCKET.head(storageKey))) {
          const elevenLabsResponse = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${DEFAULT_VOICE_ID}?output_format=mp3_44100_128`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "audio/mpeg",
                "xi-api-key": env.ELEVENLABS_API_KEY,
              },
              body: JSON.stringify({ text, model_id: MODEL_ID }),
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

          await env.AUDIO_BUCKET.put(storageKey, await elevenLabsResponse.arrayBuffer(), {
            httpMetadata: {
              contentType: "audio/mpeg",
              cacheControl: "public, max-age=31536000, immutable",
            },
          });
        }

        return json(
          { audioUrl: publicAudioUrl(request, storageKey) },
          200,
          request,
          env,
        );
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
  const caller = await requireSignedIn(request, env);

  // This prevents students from using TTS credits on lesson audio.
  if (caller.role !== "teacher" && caller.role !== "admin") {
    throw httpError("Only teachers and admins can generate audio.", 403);
  }

  return caller;
}

async function requireSignedIn(request, env) {
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
  // the caller's own profile.
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

  if (!["student", "teacher", "admin"].includes(role)) {
    throw httpError("Your account could not be verified.", 403);
  }

  return { uid, role, token };
}

/**
 * The spelling to say for a dictionary word, the same one the pages show: a teacher's
 * word (accented spelling first) from Firestore, else the Wiktionary file. "" when the
 * word isn't in the dictionary or a teacher hid it.
 */
async function dictionaryText(key, token, env) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/dictionary/${encodeURIComponent(key)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (response.ok) {
    const fields = (await response.json()).fields || {};
    if (fields.hidden?.booleanValue) return "";
    return fields.accent?.stringValue || fields.word?.stringValue || "";
  }

  if (response.status !== 404) {
    throw httpError("The dictionary could not be checked.", 502);
  }

  return (await loadDictionarySeed(env)).get(key) || "";
}

function loadDictionarySeed(env) {
  const seedUrl = String(env.DICTIONARY_SEED_URL || DEFAULT_DICTIONARY_SEED_URL).trim();
  dictionarySeed ??= fetch(seedUrl, {
    cf: { cacheTtl: 86400, cacheEverything: true },
  })
    .then((response) => {
      if (!response.ok) {
        console.error("Dictionary file:", response.status, seedUrl);
        throw httpError(`The dictionary file could not be loaded (${response.status}).`, 502);
      }
      return response.json();
    })
    .then((list) => new Map(list.map((entry) => [entry.k, entry.a || entry.w])))
    .catch((error) => {
      dictionarySeed = null; // try again next time
      throw error;
    });
  return dictionarySeed;
}

/**
 * dictionary/<key>/<first 16 hex letters of SHA-256 of the spelling>.mp3. The website
 * (js/tts.js) and the app (DictionaryAudio.kt) build the same name to play saved audio
 * straight from /audio/ without asking here first.
 */
async function dictionaryAudioKey(key, text) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text.normalize("NFC")),
  );
  const hex = [...new Uint8Array(digest).slice(0, 8)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `dictionary/${key}/${hex}.mp3`;
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
  return new Response(JSON.stringify(data, null, 2), {
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
