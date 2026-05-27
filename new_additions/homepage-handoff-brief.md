# Homepage Update Brief — lessons.musicalbasics.com

Direct instructions for the AI agent updating the Next.js homepage. Apply each change exactly as specified.

---

## 1. Hero Section — Replace Copy

**Current headline:** "Master Piano with Excellence"
**Current subhead:** "Transform your musical journey with personalized instruction, flexible scheduling, and a proven system designed for serious students."

**Replace with:**

**Headline:**
> Structured quarters. Personalized instruction. A proven system for serious students.

**Subhead:**
> Transform your musical journey with quarterly piano instruction designed around your goals — backed by 30+ years of experience and training from Juilliard, Peabody, and NYU.

---

## 2. Enrollment Banner — Add or Update

If a banner / notification element exists at the top of the page (currently shows "Studio is full for remainder of February 2026" or similar), replace it with:

> **Now Enrolling — Summer 2026**

If no such element exists, add one as a prominent strip directly under the hero.

---

## 3. "Studio System" Section — Replace All 3 Cards

**Remove these existing cards:**
- Credit-Based Packages
- Fair Cancellation Policy
- Professional Standards

**Replace with these 3 cards (same layout, same visual treatment):**

### Card 1 — Quarterly Enrollment
> 12 lesson credits per quarter. Use them across 3 months of structured instruction with a built-in buffer month for makeups. Give 24+ hours notice when you reschedule and the credit rolls forward automatically.

### Card 2 — What's Included
> Every quarter comes with lesson recordings, custom sheet music tailored to your goals, personalized practice exercises, participation in twice-yearly online recitals, and full access to my premium masterclass library (100+ lessons) while you're enrolled.

### Card 3 — Performance & Community
> Twice-yearly online recitals give you real performance experience and a deadline to play toward. Open to anyone who has taken lessons in the past year. You'll be part of a community of students from teen beginners to working professionals.

---

## 4. Pricing Section — New, Add to Page

This section does not currently exist on the homepage. Add it after the Studio System cards, before the testimonials.

**Section heading:** Quarterly Tuition

**Subheading:** 12 credits per quarter. Credits valid for 4 months.

**Render as a 3-card pricing grid** (or equivalent component matching the existing visual style):

| Tier | Price | Detail |
|------|-------|--------|
| 30 minutes | **$635** | per quarter |
| 45 minutes | **$935** | per quarter |
| 60 minutes | **$1,135** | per quarter |

**Below the pricing grid, add this line:**

> Every quarter includes lesson recordings, custom sheet music & exercises, online recital participation, and masterclass library access while enrolled.

---

## 5. FAQ Section — Add to Page

Add a new FAQ section near the bottom of the page (above the footer). Render as an accordion (questions collapsed by default, click to expand).

**Section heading:** Frequently Asked Questions

**Source content:** Use `quarterly-enrollment-faq.md` in this folder. Each `###` heading is a question; the paragraph(s) below it are the answer. Group by the `##` headings (How the Studio Works / What's Included in Tuition / Scheduling, Cancellations, and Makeups / Payment and Refunds / Masterclass Library / Recitals and Performance / The Trial Lesson / Lessons Themselves / Equipment).

---

## 6. Trial CTA — Replace Existing "Inquire for Lessons"

Replace the existing CTA section with:

**Heading:**
> Free 15-Minute Trial Lesson

**Body:**
> Before enrolling, let's meet. We'll talk through your goals, assess where you are, and make sure we're the right fit. Send a quick note using the form below and I'll personally reply within 48 hours to schedule.

**Button label:** Request a Free Trial

**Form fields (build form to capture all of these):**
1. Name — text, required
2. Email — email, required
3. Age confirmation — checkbox, required, label: "I confirm I am 12 or older"
4. Time zone — dropdown, required (US timezones + "Other")
5. General availability — checkboxes, multiple allowed: "Weekday mornings", "Weekday afternoons", "Weekday evenings", "Weekend mornings", "Weekend afternoons", "Weekend evenings"
6. Experience level — radio, required: "Beginner", "Intermediate", "Advanced", "Returning after a break"
7. What you want from lessons — textarea, required, placeholder: "Briefly — what are your goals?"

**Form submission must:**
- Email all field values to Lionel's monitored inbox
- Trigger an auto-response email to the submitter (template: `trial-inquiry-autoresponse-email.md` in this folder)

---

## 7. What to Leave Alone

Do not modify:
- The top navigation (logo, "Student Login", "Student Portal" links)
- The "About Your Teacher" section
- The stats display ("1.27M YouTube Subscribers", "50+ Students Taught", "100% Satisfaction Rate")
- Existing testimonials (already migrated separately)
- Footer
- Site-wide styling, fonts, color palette

---

## 8. Order of Sections (Top to Bottom)

After your changes, the page should flow:

1. Top nav
2. Hero (updated copy)
3. Enrollment banner ("Now Enrolling — Summer 2026")
4. About Your Teacher (unchanged)
5. Studio System cards (3 new cards)
6. Pricing (new section)
7. Stats (unchanged)
8. Testimonials (unchanged)
9. FAQ accordion (new section)
10. Trial CTA + form (replaces "Inquire for Lessons")
11. Footer

---

## 9. Reference Files

- `quarterly-enrollment-faq.md` — full FAQ content for section 5
- `trial-inquiry-autoresponse-email.md` — auto-response email template for the form
- `trial-lesson-confirmation-email.md` — for Lionel's reference, not used on the homepage
- `lessons-subdomain-copy-update.md` — strategic context, not needed for the page update itself
