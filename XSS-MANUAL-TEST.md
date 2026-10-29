# Manual XSS checks — BaSaya sign-in page

This checklist is for manually checking the sign-in page in this repository
(`index.html`). Run it only on a local copy or a staging site you are authorized
to test. It does not execute scripts or send automated requests.

## Before you start

1. Use a local web server or staging deployment; do not open `index.html` from
   the filesystem.
2. Use a private browser profile with no real account credentials saved.
3. Open Developer Tools → **Elements** and **Console**. Keep the console visible
   while testing.
4. Do not paste active JavaScript, use real user data, or submit test values to
   production. The inert markers below are intended to check whether input is
   treated as markup without executing code.

## Inert markers

Use these exact strings as test values:

```text
<xss-probe data-marker="BASAYA-XSS-01">marker</xss-probe>
"><xss-probe data-marker="BASAYA-XSS-02">marker</xss-probe>
```

They contain markup-like text but no script or event handler.

## Test cases

| ID | Page/input | Manual steps | Expected result |
|---|---|---|---|
| XSS-01 | Sign-in email | Enter the first marker in **Email**, then leave the field or submit. | The email field rejects the value as an invalid email. The value is not rendered as a new element; no marker element appears in **Elements**. |
| XSS-02 | Sign-in password | Enter the first marker in **Password**. Use **Show password**, then hide it again. Do not submit it. | The value stays inside the password input, is masked when hidden, and does not create an element in the page. |
| XSS-03 | Sign-in validation | Leave Email or Password empty and submit. Then enter malformed email text and blur the field. | Validation text appears as ordinary text. No input value is interpreted as markup and no marker element appears in the DOM. |
| XSS-04 | Sign-in authentication error | On a local/staging environment only, use a dedicated test account and an incorrect password. | The error appears as ordinary text. The page does not create elements from the account input or error message. Avoid real credentials. |
| XSS-05 | Forgot-password validation | Open **Forgot password?**, enter a marker or malformed email, and submit. | The form shows its email validation message and does not show the sent state. No marker element appears in the DOM. |
| XSS-06 | Forgot-password sent state | Only if you have an authorized staging test account and control its mailbox: request a reset using that account’s normal email address. | The displayed address is ordinary text, not markup. A reset email may be sent; do not run this against a real user or an uncontrolled mailbox. The marker strings are invalid email addresses and cannot test this success state. |
| XSS-07 | URL handling | Add a harmless marker such as `?xss=%3Cxss-probe%3Emarker%3C%2Fxss-probe%3E` or `#<xss-probe>marker</xss-probe>` to the local/staging page URL and reload. | The page does not display the marker as an element. It may remain in the address bar; that alone is not an XSS finding. |

For each case, search the **Elements** panel for `xss-probe`. A passing result
means the value is absent from the DOM as an element (it may remain as a string
inside an input or a text node). The browser console should show no unexpected
script execution or page errors.

## Record results

| Test ID | Pass / fail / not run | Browser and version | Notes / screenshot reference |
|---|---|---|---|
| XSS-01 | | | |
| XSS-02 | | | |
| XSS-03 | | | |
| XSS-04 | | | |
| XSS-05 | | | |
| XSS-06 | | | |
| XSS-07 | | | |

If a marker becomes a DOM element, stop testing that input, note the exact
screen and steps, and report it to the application owner. Do not replace the
marker with executable code to confirm impact.
