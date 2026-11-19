import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { handbookHelp, HANDBOOK_VERSION, handbookReference, selectHandbookEntries, matchesHandbookSearch } from "../js/handbookHelp.js";

const cases = {
  teacher: [
    ["How do I remove a student?", "remove-student"],
    ["Paano tanggalin ang estudyante sa klase?", "remove-student"],
    ["Paano i-remove yung student sa class?", "remove-student"],
    ["Can I kick a learner?", "remove-student"],
    ["How do I get rid of a student from class?", "remove-student"],
    ["Paano aprubahan ang sumali?", "requests"],
    ["Approve selected join requests", "requests"],
    ["How do I decline a leave request?", "leave-requests"],
    ["Restore previous progress for a returning student", "returning-students"],
    ["Transfer student to a different class", "returning-students"],
    ["Palitan section ng klase", "edit-class"],
    ["Where do I copy the class code?", "class-code"],
    ["How to assign Practice instead of Assessment?", "lessons"],
    ["Can I choose a past opening date?", "schedule"],
    ["Same day deadline 11:59 PM", "schedule"],
    ["Palawigin deadline", "extend-deadline"],
    ["Lesson added but students were not notified", "notify-students"],
    ["How do I remove a lesson from my class?", "remove-lesson"],
    ["Saan ang progreso ng estudyante?", "progress"],
    ["How do I listen to submitted reading recordings?", "readings"],
    ["Why divided by 12?", "grading"],
    ["Paano kuwentahin ang puntos sa Bigkas?", "grading"],
    ["What does Needs help mean?", "score-guide"],
    ["How do I export Excel?", "reports"],
    ["Print PDF school header", "reports"],
    ["How do I send a private message?", "messages"],
    ["How do I close class chat?", "chat-controls"],
    ["Burahin mensahe", "delete-messages"],
    ["Cancel class deletion request", "deletion"],
    ["How do I delete a word?", "dictionary-permissions"],
    ["Change my teacher title", "account"],
    ["Nakalimutan password", "password"],
    ["Where do I change the theme?", "appearance"],
    ["What does the notification dot mean?", "dashboard"],
    ["Can I delete a student's account?", "permissions"],
    ["Why did I run out of AI questions?", "support"],
  ],
  admin: [
    ["How do I create a teacher account?", "teachers"],
    ["Baguhin pangalan ng guro", "edit-teacher"],
    ["Reset teacher password", "reset-teacher-password"],
    ["Paano alisin ang teacher?", "remove-teacher"],
    ["Find students without a class", "students"],
    ["Set temporary password for a student", "student-password"],
    ["Palitan guro ng klase", "classes"],
    ["Rename an existing class", "edit-class"],
    ["Approve a class deletion request", "deletion"],
    ["How do I directly delete a classroom?", "delete-class"],
    ["Create and publish a lesson", "lessons"],
    ["Add lecture sentences", "lecture-content"],
    ["Add quiz questions and choices", "quiz-content"],
    ["Skip Gawain for a lesson", "activity-content"],
    ["Use sentence pages for pronunciation", "pronunciation-content"],
    ["Add crossword levels", "game-content"],
    ["Generate lesson audio", "lesson-audio"],
    ["Why can't I publish a lesson with missing fields?", "missing-content"],
    ["Undo deleting a library lesson", "delete-lesson"],
    ["What does the admin dashboard show?", "dashboard"],
    ["Add dictionary meanings and synonyms", "dictionary"],
    ["Rename a dictionary word's spelling", "dictionary-permissions"],
    ["Approve my admin password change by email", "account"],
    ["How do I log out?", "appearance"],
    ["Paano alisin ang estudyante sa klase?", "permissions"],
    ["Can admin grade student reading?", "permissions"],
  ],
};

let checks = 0;
for (const [role, guides] of Object.entries(handbookHelp)) {
  assert.equal(new Set(guides.map(g => g.id)).size, guides.length);
  for (const guide of guides) {
    assert.ok(guide.route.startsWith("/"));
    assert.ok(selectHandbookEntries(role, guide.question).some(g => g.id === guide.id), `${role}/${guide.id} must answer its own question`);
    checks++;
  }
  for (const [question, id] of cases[role]) {
    const selected = selectHandbookEntries(role, question);
    assert.ok(selected.some(g => g.id === id), `${role}: ${question} needs ${id}; got ${selected.map(g => g.id)}`);
    assert.ok(selected.every(g => guides.includes(g)), "References must stay inside the authenticated role");
    assert.ok(Buffer.byteLength(handbookReference(selected)) <= 2400);
    checks++;
  }
}
const removal = selectHandbookEntries("teacher", "How do I remove a student?");
assert.equal(removal[0].id, "remove-student");
assert.ok(!removal.some(g => g.id === "delete-messages"), "Unrelated deletion steps should not dilute removal instructions");
assert.match(removal[0].text, /account stays/);
assert.match(removal[0].text, /archived/);
assert.ok(matchesHandbookSearch(removal[0], "alisin student"));
assert.ok(matchesHandbookSearch(removal[0], "remo stu"), "Keep partial search usable as people type");
assert.ok(matchesHandbookSearch(removal[0], "tanggalin mag-aaral"));
assert.ok(matchesHandbookSearch(removal[0], "Paano i-remove yung student sa class?"));
assert.ok(!matchesHandbookSearch(removal[0], "quantum physics"));
assert.ok(!handbookHelp.teacher.some(g => g.id === "student-password"));
assert.ok(!handbookHelp.admin.some(g => g.id === "remove-student"));
for (const role of ["teacher", "admin"]) {
  for (const question of ["界".repeat(500), "How do I use the website?", "quantum physics", "remove student and export a report"]) {
    assert.ok(Buffer.byteLength(handbookReference(selectHandbookEntries(role, question))) <= 2400);
  }
}
const bundled = await readFile(new URL("../notify-api/lib/handbookHelp.js", import.meta.url), "utf8");
assert.equal(bundled.slice(bundled.indexOf("\n") + 1), await readFile(new URL("../js/handbookHelp.js", import.meta.url), "utf8"));
assert.notEqual(HANDBOOK_VERSION, "2026-11-18", "Version must invalidate old unsupported-answer caches");
console.log(`PASS: ${checks} role/workflow retrieval checks, bilingual search, complete references within budget, permission separation and backend bundle/version.`);
