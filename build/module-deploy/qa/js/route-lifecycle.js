// A render owns one navigation, including when the user leaves and returns to the same URL.
let revision = 0;
const route = () => location.hash.slice(1) || "/dashboard";

export function beginRoute() {
  revision += 1;
  return captureRoute();
}

export function captureRoute(expected) {
  const started = revision;
  const path = route();
  return () => revision === started && route() === path &&
    (!expected || (expected instanceof RegExp ? expected.test(path) : path === expected));
}
