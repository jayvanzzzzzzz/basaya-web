export const termsTitle = "Mga Tuntunin at Kondisyon";
export const termsReminder = "Kailangan mong sumang-ayon sa Mga Tuntunin at Kondisyon bago gumawa ng account.";
export const termsText = `Ang BaSaya ay isang plataporma para sa pag-aaral ng pagbasa at wikang Filipino. Basahin ang mga tuntuning ito bago gumawa ng account.

1. Impormasyon ng account
Magbigay ng tama at kumpletong impormasyon. Panatilihing pribado ang iyong password at huwag ipagamit sa iba ang iyong account.

2. Wastong paggamit
Gamitin ang BaSaya para sa pag-aaral. Igalang ang iyong guro at kapwa mag-aaral. Iwasan ang panlilinlang, pang-aabuso, at paglalagay ng mapanakit o hindi angkop na nilalaman.

3. Mga aralin at gawain
Sundin ang panuto ng guro at sagutan nang tapat ang mga gawain. Huwag baguhin o sirain ang nilalaman, account, o resulta ng ibang gumagamit.

4. Impormasyon at pagkatuto
Ginagamit ang impormasyon ng account, pagsali sa klase, at mga resulta ng gawain upang maihatid ang mga aralin at masubaybayan ang pagkatuto. Maaaring makita ng awtorisadong guro at school admin ang impormasyong kailangan nila para sa klase. Para sa mga detalye, basahin ang Patakaran sa Privacy o magtanong sa school admin.

5. Tulong at mga alalahanin
Kung may problema sa account, nilalaman, o personal na impormasyon, humingi ng tulong sa iyong guro o school admin. Kung may bahaging hindi malinaw, magtanong muna sa iyong guro, magulang, o tagapag-alaga bago sumang-ayon.

Sa paglalagay ng tsek sa kahon, pinatutunayan mong nabasa at sumasang-ayon ka sa mga tuntuning ito.`;

const checkbox = document.getElementById("agree-terms");
let activeDialog;
function showDialog(title, message, returnTo) {
  if (activeDialog?.open) return;
  const dialog = document.createElement("dialog");
  activeDialog = dialog;
  dialog.className = "action-confirmation registration-terms-dialog";
  dialog.setAttribute("aria-labelledby", "registration-terms-title");
  const body = document.createElement("div");
  body.className = "action-confirmation__body";
  const heading = document.createElement("h2");
  heading.id = "registration-terms-title";
  heading.textContent = title;
  const text = document.createElement("p");
  text.className = "registration-terms-text";
  text.textContent = message;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button primary";
  button.textContent = "Nauunawaan ko";
  button.onclick = () => dialog.close();
  body.append(heading, text, button);
  dialog.append(body);
  dialog.addEventListener("close", () => {
    dialog.remove();
    activeDialog = null;
    returnTo.focus({ preventScroll: true });
  }, { once: true });
  document.body.append(dialog);
  dialog.showModal();
  heading.tabIndex = -1;
  heading.focus();
}

document.getElementById("view-terms").addEventListener("click", event => {
  showDialog(termsTitle, termsText, event.currentTarget);
});
checkbox.addEventListener("change", () => checkbox.removeAttribute("aria-invalid"));
export function requireTermsAgreement() {
  if (checkbox.checked) return true;
  checkbox.setAttribute("aria-invalid", "true");
  showDialog("Kailangan ang iyong pagsang-ayon", termsReminder, checkbox);
  return false;
}
