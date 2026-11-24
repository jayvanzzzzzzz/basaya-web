// Shared by API authorization and the teacher onboarding endpoint.
export function teacherAccessReady(profile, user) {
  return profile.emailVerificationRequired !== true ||
    (user.emailVerified === true && profile.mustChangePassword !== true);
}

export function titleForGender(gender) {
  return gender === "female" ? "maam" : gender === "male" ? "sir" : "";
}

export function strongPassword(password) {
  return typeof password === "string" && password.length >= 8 && password.length <= 128 &&
    /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
}
