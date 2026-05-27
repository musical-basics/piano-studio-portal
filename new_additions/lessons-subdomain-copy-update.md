# Lionel Yu Piano Studio — Subdomain Copy Update

Copy updates for **lessons.musicalbasics.com** to support the merge from `musicalbasics.com/pages/lessons` and the shift to a quarterly tuition model.

---

## Strategic Context

- Killing `musicalbasics.com/pages/lessons` and consolidating onto `lessons.musicalbasics.com`.
- Switching from credit-based 4-lesson packages to **quarterly enrollment**.
- 4 quarters per year:
  - **Spring** — March–May
  - **Summer** — June–August
  - **Fall** — September–November
  - **Winter** — December–February
- 12 credits per quarter, valid for **4 months** (3-month quarter + 1-month buffer for makeups, rescheduling, and rollover).
- Unlimited rollover into the buffer month.
- Free 15-minute trial lesson as the entry CTA.
- Open enrollment year-round (one of four quarters always upcoming).
- Student age policy: **12 and over only**.
- Bundling premium masterclass access + recitals + custom materials into tuition.

---

## Hero (revise current copy)

> Structured quarters. Personalized instruction. A proven system for serious students.
>
> Transform your musical journey with quarterly piano instruction designed around your goals — backed by 30+ years of experience and training from Juilliard, Peabody, and NYU.

**Note:** Drop "flexible scheduling" from the current hero — the credit system already communicates flexibility within a structured quarter.

---

## Replace the 3 "Studio System" Cards

**Current cards to remove:**
- Credit-Based Packages
- Fair Cancellation Policy
- Professional Standards

**New cards:**

### Card 1 — Quarterly Enrollment
> 12 lesson credits per quarter. Use them across 3 months of structured instruction with a built-in buffer month for makeups. Give 24+ hours notice when you reschedule and the credit rolls forward automatically.

### Card 2 — What's Included
> Every quarter comes with lesson recordings, custom sheet music tailored to your goals, personalized practice exercises, participation in twice-yearly online recitals, and full access to my premium masterclass library (100+ lessons) while you're enrolled.

### Card 3 — Performance & Community
> Twice-yearly online recitals give you real performance experience and a deadline to play toward. Open to anyone who has taken lessons in the past year. You'll be part of a community of students from teen beginners to working professionals.

---

## Pricing Block (new — currently no public pricing on the subdomain)

> ### Quarterly Tuition — 12 Credits per Quarter
>
> - 30 minutes — **$635**
> - 45 minutes — **$935**
> - 60 minutes — **$1,135**
>
> Credits are valid for 4 months (your 3-month quarter plus a 1-month buffer). Every quarter includes: lesson recordings, custom sheet music & exercises, online recital participation, and masterclass library access while enrolled.

---

## Trial Lesson CTA (replace current "Inquire for Lessons")

> ### Free 15-Minute Trial Lesson
>
> Before enrolling, let's meet. We'll talk through your goals, assess where you are, and make sure we're the right fit. Send a quick note using the form below and I'll personally reply within 48 hours to schedule.
>
> **Button:** Request a Free Trial

**Form fields to capture** (so you can schedule + qualify in one step):

- Name
- Email
- Age (or "12+ confirmed" checkbox — saves you a follow-up email)
- Time zone
- General availability (weekday evenings / weekend mornings / etc. — radio buttons or checkboxes, not free-text)
- Experience level (Beginner / Intermediate / Advanced / Returning after a break)
- What you want from lessons (free-text, short)

**Recommended response time commitment:** "I'll personally reply within 48 hours." Without this, inquiries that don't hear back same-day will assume you ghosted.

---

## Enrollment Status (replace "Studio is full for remainder of February 2026")

> **Now Enrolling — [Spring 2026 Quarter]** *(or whichever quarter is upcoming)*

This banner can rotate automatically through Spring / Summer / Fall / Winter as each enrollment window opens.

---

## Page-Level Recommendations

- **Show the masterclass library visually.** Of the bundle items, premium masterclass access is the heaviest hitter — students recognize "100+ lessons of premium content" as a real, separate product. Show screenshots/logos, don't just list it.
- **Show the prices.** With a bundle this strong, hide-the-price is the wrong move — the prices prove the value.
- **Frame masterclass access as "included while enrolled"** rather than "quarter only." Same outcome, better copy.
- **Add an age note somewhere visible** — "Currently teaching students age 12 and over." Better up-front than a rejection email after a parent inquires for an 8-year-old.

---

## Items to Confirm Before Publishing

- [ ] **Custom exercises** — does this exist as a current workflow, or is it new? If new, add "starting [quarter name]" to the bundle line item.
- [ ] **Online recitals** — already running, or new for the quarterly rollout? If new, same caveat.
- [ ] **Trial lesson booking flow** — what's the booking mechanism (form, Calendly, direct email)?
- [ ] **Quarter start dates** — finalize the calendar and any holiday breaks you want explicitly noted.

---

## Migration Checklist (Killing /pages/lessons)

- [x] ~~Set up 301 redirect in Shopify: `/pages/lessons` → `https://lessons.musicalbasics.com/`~~ **(LIVE — verified 4/28/2026)**
- [ ] Migrate the 4 testimonials from the Shopify page (Bai V., Xu Y., Padhma B., Jay W.) to the subdomain
- [ ] Update internal links from the rest of musicalbasics.com to point to the subdomain
- [ ] Verify the subdomain contact / trial-lesson form actually delivers (test submission)
- [ ] Update any newsletter signups / email captures lost from the Shopify footer
- [ ] Take down the "studio full" waitlist messaging once new enrollment copy is live

---

## Still to Draft (optional next steps)

- Trial-lesson confirmation email *(drafted — see trial-lesson-confirmation-email.md)*
- Quarterly enrollment FAQ *(drafted — see quarterly-enrollment-faq.md)*
- Welcome-to-the-studio onboarding email for newly enrolled students
- Pre-recital instructions email (recording specs, deadline, what to submit)
