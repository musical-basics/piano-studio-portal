# Trial Inquiry Auto-Response Email

Triggered automatically when someone submits the trial lesson form. Sets expectations and prevents the "did this even go through?" anxiety that kills warm leads.

**Goals of this email:**
1. Confirm the form submission landed.
2. Set a clear response window so they don't ghost waiting.
3. Tell them exactly what happens next.
4. Reinforce the offering briefly, without selling.

---

## Subject Line Options

- Got it — I'll be in touch within 48 hours
- Your trial lesson request — Lionel
- Thanks for reaching out — here's what's next

(First one is the strongest — it confirms receipt and sets the timing expectation in the subject line itself, before the email is even opened.)

---

## Email Body

Hi [First Name],

Thanks for your interest in lessons. Your trial request just came through.

**Here's what happens next:**

I personally read every inquiry, and I'll reply within **48 hours** with a few proposed times for your free 15-minute trial. The trial happens on Zoom and we'll use it to talk through your goals, hear you play (if you already do), and figure out together whether quarterly enrollment is the right fit.

If you don't hear from me within 48 hours, please reply to this email — sometimes things get lost in spam, and I'd rather you nudge me than assume I forgot.

**A bit about what you're considering:**

Quarterly enrollment includes 12 private lessons over 3 months (with a buffer month for makeups), full access to my premium masterclass library while you're enrolled, lesson recordings, custom sheet music tailored to your goals, and twice-yearly online recitals. Full details and pricing are at lessons.musicalbasics.com.

But none of that matters until we meet. Looking forward to it.

Lionel
Lionel Yu Piano Studio
lessons.musicalbasics.com

---

## Sender / Setup Notes

- **From name:** Lionel Yu (not "Lionel Yu Piano Studio") — personal name converts better and matches the "I personally read every inquiry" line.
- **Reply-to:** A real address you actually monitor. The "reply to nudge me" line in the email is your insurance against form-delivery failures.
- **Send timing:** Immediately on form submission. Auto-responders that take more than ~5 minutes feel broken.
- **Wire-up note:** Whatever form provider you're using (Shopify form, Formspree, Netlify Forms, custom Next.js handler) needs to support transactional email triggers. If it doesn't, route form submissions through a tool like Zapier or Make to send this email on submission.
- **Spam folder risk:** Auto-responses sometimes hit spam on first contact. Set up SPF/DKIM/DMARC records on the sending domain (`musicalbasics.com`) if not already done — your developer can handle this.
