// The Contact tab of the About / Privacy / Contact pop-up (js/site-info.js):
// name, email, topic, message and an optional photo, sent to the team's Gmail
// through notify-api/api/contact.js. Photos are shrunk in the browser first
// (the API accepts up to 3 MB; Vercel caps a request at 4.5 MB).

export const CONTACT_EMAIL = "adminbasaya@gmail.com";

const TOPICS = ["Question", "Report a problem", "Feedback", "Account help"];
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PICK_BYTES = 10 * 1024 * 1024;
const MAX_MESSAGE = 2000;

const ICON_PHOTO =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="9" cy="10" r="1.8" /><path d="m21 16-5-5-8 8" /></svg>';
const ICON_SEND =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z" /></svg>';

export const contactPanel = `
  <div class="contact" data-contact>
    <div class="contact__intro">
      <h2>Contact us</h2>
      <p>Questions, feedback, or found a problem? Send us a message and we'll reply by email.</p>
    </div>
    <form class="contact__form" novalidate data-contact-form>
      <div class="contact__row">
        <label class="contact__field">Name
          <input name="name" maxlength="80" autocomplete="name" required placeholder="Juan Dela Cruz" />
        </label>
        <label class="contact__field">Email
          <input name="email" type="email" maxlength="254" autocomplete="email" required placeholder="you@email.com" />
        </label>
      </div>
      <label class="contact__field">Topic
        <select name="topic" required>
          ${TOPICS.map((topic) => `<option>${topic}</option>`).join("")}
        </select>
      </label>
      <label class="contact__field">Message
        <textarea name="message" rows="5" maxlength="${MAX_MESSAGE}" required placeholder="Tell us what happened or what you need…"></textarea>
        <span class="contact__counter" aria-live="polite"><span data-count>0</span> / ${MAX_MESSAGE}</span>
      </label>

      <div class="contact__drop" data-drop>
        <input type="file" accept="${PHOTO_TYPES.join(",")}" data-photo-input hidden />
        <div class="contact__drop-empty" data-drop-empty>
          <span class="contact__drop-icon">${ICON_PHOTO}</span>
          <span>
            <strong>Add a photo <em>(optional)</em></strong>
            <small>Drag it here or <button type="button" data-photo-browse>browse</button> · JPG, PNG or WebP</small>
          </span>
        </div>
        <div class="contact__drop-file" data-drop-file hidden>
          <img alt="" data-photo-thumb />
          <span>
            <strong data-photo-name></strong>
            <small data-photo-size></small>
          </span>
          <button type="button" class="contact__remove" data-photo-remove aria-label="Remove photo">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
      </div>

      <!-- Honeypot: hidden from people, bots fill it in -->
      <input class="contact__trap" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" />

      <p class="form-error contact__error" role="alert" data-contact-error></p>
      <div class="contact__actions">
        <p class="contact__alt">Or email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
        <button type="submit" class="button primary contact__send">${ICON_SEND}<span>Send message</span></button>
      </div>
    </form>

    <div class="contact__done" data-contact-done hidden>
      <span class="contact__done-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
      <h2>Message sent!</h2>
      <p data-done-text></p>
      <button type="button" class="button secondary" data-contact-again>Send another message</button>
    </div>
    <p class="site-info__meta contact__note">Forgot your password? Use “Forgot password?” on the sign-in page, or ask your school admin.</p>
  </div>
`;

const formatSize = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Draws the photo at most 1600px wide/tall as a JPEG, shrinking until it's under ~1.5 MB. */
async function shrinkPhoto(file) {
  const bitmap = await createImageBitmap(file);
  const attempts = [
    [1600, 0.85],
    [1600, 0.72],
    [1280, 0.7],
    [1024, 0.65],
  ];
  let blob = null;
  for (const [maxSide, quality] of attempts) {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff"; // transparent PNGs become white, not black
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= 1.5 * 1024 * 1024) break;
  }
  bitmap.close();
  return blob;
}

const toBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

function pageName() {
  if (location.pathname.includes("/admin/")) return "Admin portal";
  if (location.pathname.includes("/teacher/")) return "Teacher portal";
  return "Sign-in page";
}

/** Fills in name and email for someone who is signed in. */
async function prefill(fields) {
  try {
    const { state } = await import("./state.js");
    if (!state.user) return;
    if (!fields.name.value) fields.name.value = state.profile?.displayName || "";
    if (!fields.email.value) fields.email.value = state.user.email || "";
  } catch {
    // Not signed in or Firebase not loaded: they type it themselves.
  }
}

export function wireContactForm(root) {
  const form = root.querySelector("[data-contact-form]");
  const fields = form.elements;
  const done = root.querySelector("[data-contact-done]");
  const error = root.querySelector("[data-contact-error]");
  const send = form.querySelector(".contact__send");
  const sendLabel = send.querySelector("span");
  const drop = root.querySelector("[data-drop]");
  const input = root.querySelector("[data-photo-input]");
  let photo = null; // { blob, name, url }

  prefill(fields);

  const count = root.querySelector("[data-count]");
  fields.message.addEventListener("input", () => {
    count.textContent = fields.message.value.length;
  });

  // ---- Photo: pick, drag & drop, preview, remove ----
  const showPhoto = () => {
    root.querySelector("[data-drop-empty]").hidden = Boolean(photo);
    root.querySelector("[data-drop-file]").hidden = !photo;
    drop.classList.toggle("has-file", Boolean(photo));
    if (!photo) return;
    root.querySelector("[data-photo-thumb]").src = photo.url;
    root.querySelector("[data-photo-name]").textContent = photo.name;
    root.querySelector("[data-photo-size]").textContent = `Will be sent as ${formatSize(photo.blob.size)}`;
  };

  const clearPhoto = () => {
    if (photo) URL.revokeObjectURL(photo.url);
    photo = null;
    input.value = "";
    showPhoto();
  };

  async function choose(file) {
    error.textContent = "";
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) {
      error.textContent = "Please choose a JPG, PNG or WebP image.";
      return;
    }
    if (file.size > MAX_PICK_BYTES) {
      error.textContent = "That photo is over 10 MB. Please choose a smaller one.";
      return;
    }
    drop.classList.add("is-loading");
    try {
      const blob = await shrinkPhoto(file);
      clearPhoto();
      photo = { blob, name: file.name, url: URL.createObjectURL(blob) };
      showPhoto();
    } catch {
      error.textContent = "We couldn't read that image. Try another one.";
    } finally {
      drop.classList.remove("is-loading");
    }
  }

  root.querySelector("[data-photo-browse]").addEventListener("click", () => input.click());
  root.querySelector("[data-drop-empty]").addEventListener("click", (event) => {
    if (!event.target.closest("button")) input.click();
  });
  root.querySelector("[data-photo-remove]").addEventListener("click", clearPhoto);
  input.addEventListener("change", () => choose(input.files[0]));
  ["dragenter", "dragover"].forEach((type) =>
    drop.addEventListener(type, (event) => {
      event.preventDefault();
      drop.classList.add("is-over");
    }),
  );
  ["dragleave", "drop"].forEach((type) =>
    drop.addEventListener(type, () => drop.classList.remove("is-over")),
  );
  drop.addEventListener("drop", (event) => {
    event.preventDefault();
    choose(event.dataTransfer.files[0]);
  });

  // ---- Send ----
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    const name = fields.name.value.trim();
    const email = fields.email.value.trim();
    const message = fields.message.value.trim();
    const problem = !name
      ? [fields.name, "Please enter your name."]
      : !email || !fields.email.checkValidity()
        ? [fields.email, "Please enter a valid email address."]
        : message.length < 10
          ? [fields.message, "Please write a little more (at least 10 characters)."]
          : null;
    if (problem) {
      error.textContent = problem[1];
      problem[0].focus();
      return;
    }

    send.disabled = true;
    form.classList.add("is-sending");
    sendLabel.textContent = "Sending…";
    try {
      const { sendContact } = await import("./api.js");
      await sendContact({
        name,
        email,
        topic: fields.topic.value,
        message,
        page: pageName(),
        website: fields.website.value,
        photo: photo && {
          name: photo.name,
          type: photo.blob.type,
          data: await toBase64(photo.blob),
        },
      });
      root.querySelector("[data-done-text]").textContent =
        `Thanks, ${name.split(" ")[0]}. We'll reply to ${email} as soon as we can.`;
      form.hidden = true;
      done.hidden = false;
      done.querySelector("button").focus();
    } catch (failure) {
      error.textContent =
        failure instanceof TypeError
          ? "Couldn't reach the server. Check your internet connection and try again."
          : failure.message;
    } finally {
      send.disabled = false;
      form.classList.remove("is-sending");
      sendLabel.textContent = "Send message";
    }
  });

  root.querySelector("[data-contact-again]").addEventListener("click", () => {
    fields.message.value = "";
    count.textContent = "0";
    clearPhoto();
    done.hidden = true;
    form.hidden = false;
    fields.message.focus();
  });
}
