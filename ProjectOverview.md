# 🧱 DATABASE MODEL (CLEAN VERSION)

## 👤 Parent (User)

```python
Parent:
- id
- full_name
- email
- phone
- password
- created_at
```

---

## 🏠 Family / Enrollment Group

```python
Family:
- id
- parent_id (FK)
- plan_type (1_kid / 2_kids / 3_kids)
- status (pending / active / expired)
- created_at
```

💡 This is the “payment container”

---

## 👶 Student (Child)

```python
Student:
- id
- family_id (FK)
- full_name
- age
- email (optional)
- ai_project_name (nullable)
- project_url (nullable)
- attendance_score
- engagement_score
- created_at
```

---

## 💳 Payment

```python
Payment:
- id
- family_id (FK)
- paystack_ref
- amount
- status (success / failed / pending)
- plan_type
- created_at
```

---

## 📅 Attendance

```python
Attendance:
- id
- student_id (FK)
- week
- status (present / absent)
- marked_by (system / code)
```

---

# 🧠 SIGNUP FLOW (THIS IS THE MAGIC)

## STEP 1 — Landing Page

Parent clicks:

> 🚀 Register Now

---

## STEP 2 — PLAN SELECTION PAGE

```text id="plan_ui"
Choose Plan:

( ) 1 Child – ₦50,000
( ) 2 Children – ₦90,000
( ) 3 Children – ₦130,000
```

Button:

> Continue

---

## STEP 3 — PARENT DETAILS

```text id="parent_form"
Full Name:
Email:
Phone Number:
Password (or magic link)
```

---

## STEP 4 — CHILD ENTRY FORM (DYNAMIC 😭🔥)

THIS is where your UI gets spicy.

If user selects **3 kids**, render:

```text id="kids_form"
Child 1:
- Full Name
- Age

Child 2:
- Full Name
- Age

Child 3:
- Full Name
- Age
```

💡 This is NOT separate pages. It’s dynamic form generation.

---

## STEP 5 — REVIEW PAGE

```text id="review"
Plan: 3 Kids – ₦130,000

Parent: Great

Children:
- John (12)
- Sarah (10)
- Michael (14)
```

Button:

> Proceed to Payment

---

## STEP 6 — PAYSTACK PAYMENT

Redirect:

* Paystack checkout
* reference = family_id

---

## STEP 7 — WEBHOOK (IMPORTANT)

When payment succeeds:

Backend does:

1. mark Payment = success
2. activate Family
3. activate Students
4. create dashboard access

---

## STEP 8 — SUCCESS PAGE

```text id="success"
🎉 Welcome to AI Summer Bootcamp

Your children are now enrolled:
- John
- Sarah
- Michael

Login to dashboard →
```

---

# 🎨 UI DESIGN (IMPORTANT UX NOTES)

## 🧠 Key rule:

> Parents should NEVER feel like they are filling “forms”

It should feel like:

* “Add your kids”
* not “submit enrollment dataset”

---

## 👇 UI FLOW STYLE

### Stepper UI:

```text id="stepper"
1. Plan
2. Parent Info
3. Kids
4. Review
5. Payment
```

Progress bar = 🔥 trust builder

---

## 🧩 Kid Entry UX improvement

Instead of boring forms:

Make it:

```text id="kid_card"
👶 Child 1

Name: [__________]
Age:  [__]
```

With:
➕ “Add another child” auto-generated based on plan

---

# 💣 CRITICAL EDGE CASES

## ❌ What if parent selects 3 kids but enters 2?

Block payment.

---

## ❌ What if payment succeeds but webhook fails?

Queue retry system.

---

## ❌ What if parent closes page mid-payment?

Family stays “pending”

No activation until webhook confirms.

---

# 🧠 LOGIN SYSTEM (POST-SIGNUP)

Simple:

### Parent login:

* email + password OR magic link

### Dashboard loads:

* family overview
* children list

---

# 👶 KID LOGIN (NO PASSWORD SYSTEM)

Now the fun part.

## OPTION 1 — FAMILY CODE LOGIN

When parent registers:

Generate:

```text id="family_code"
RVL-92KX-7D
```

Then each child gets:

```text id="student_code"
JOHN-4F2
SARAH-9Q1
```

---
## HOW IT WORKS

### Step 1 (Parent Dashboard)

They see:

```text id="codes"
Student Login Codes:

John → JOHN-4F2
Sarah → SARAH-9Q1
Michael → MIC-77P
```

They can copy/send it.

---

## 🏠 1. Home (Simple Control Panel)

```text id="home_v2"
👋 Welcome, Sarah

Bootcamp Status: ACTIVE 🚀
Current Week: Week 2

📢 Latest Update:
Class starts at 10:00 AM tomorrow
```

### Cards:

* 📊 Attendance streak
* 📚 Current week module
* 🏆 Achievement progress
* 📢 Latest announcement

No noise. Just signals.

---

## 📚 2. Weekly Learning Hub (IMPORTANT FIX)

You nailed this.

> Students ONLY see current week content

```text id="weekhub_v2"
Week 2: Prompt Engineering 🔥

What you're learning:
- How AI understands instructions
- How prompts change output
- Real examples of AI behavior
```

Locked:

* Week 3 🔒
* Week 4 🔒

💡 Parents see ALL weeks
💡 Students see ONLY current week

That’s perfect pedagogy control.

---

## 🤖 3. AI Playground (UNCHANGED CORE)

Still the heart:

* Chat with AI
* Change personality prompt
* See behavior shift instantly

BUT IMPORTANT:

Students are NOT “building AI systems”

They are:

> “controlling AI behavior using prompts”

That keeps scope realistic.

---

## 🚀 4. Project Tracker (REFINED)

This is now CLEANER and SUPER IMPORTANT.

### What it actually does:

NOT building AI here.

Just tracking their final output.

```text id="proj_v2"
Project Status: Not Started / In Progress / Completed

Project Name:
Science Buddy AI

Live URL:
(entered at end only)
```

### At final week:

Student submits:

* 🌐 Live Vercel link
* 🧠 AI name
* 📝 Short description

Then:

💥 Used for certificate generation

---

## 🏅 5. Achievements (REALISTIC VERSION)

We remove fake “AI Builder” vibes tied to backend systems.

Instead:

### Achievements are based on REAL actions:

* 🟢 First Login
* 🟢 Attendance Streak (3, 5, 7 classes)
* 🟢 First AI Conversation
* 🟢 First Prompt Edited
* 🟢 Project Completed
* 🟢 Demo Day Submission

💡 These are TRACKED EVENTS, not guessed intelligence.

---

## 📢 6. Announcements

Same idea:

* Class updates
* Assignment links
* Demo day info

Keep it simple feed.

---

## 📅 7. Attendance (FIXED — IMPORTANT)

You said:

> “button on dashboard but kids can lie”

YES 💀 so we fix it properly.

### Hybrid system:

#### Option 1: Teacher Code (BEST)

During class:

```text id="att_code"
TODAY CODE: AI2026-77
```

Student enters:

✔ verified attendance

---

#### Option 2: Time Window Lock

Button only works:

* 10:00–10:30 AM

After that:

❌ disabled

---

#### Option 3: Backend cross-check

If:

* student never logs in during class week
* no code used

→ flagged as absent

---

💡 BEST COMBO:
Teacher code + time window

---

# 👨‍👩‍👧 PARENT DASHBOARD (FINAL V2)

## Core philosophy:

> “Parents don’t see learning. They see PROOF of learning.”

---

## 🏠 1. Overview

```text id="parent_home"
Child: David (Age 12)

Status: Active 🚀
Attendance: 92%
Engagement: High 🔥
Current Week: Week 2
```

---

## 👨‍👩‍👧 2. Multi-child support (IMPORTANT)

Parents can switch:

* David
* Sarah
* Michael

Each child = separate progress

---

## 📊 3. Smart Metrics (THIS IS KEY)

You asked:

> AI understanding, engagement, project dev — how do we track?

We don’t “guess intelligence”.

We TRACK ACTIONS.

---

### 🧠 AI Understanding Score

Based on:

* quiz completions
* prompt edits
* AI interactions count

Formula:

> more interaction + learning tasks = higher score

Not subjective. Pure activity-based.

---

### 💬 Engagement Score

Based on:

* login frequency
* attendance
* time spent on platform

---

### 🚀 Project Development Score

Based on:

* project created (yes/no)
* project updates
* live URL submitted
* completion status

---

## 📚 4. Learning Overview (Parent View)

```text id="parent_learning"
This week:

- Understanding how AI works
- Learning prompt engineering
- Building AI personality systems
```

(Full curriculum visible here ONLY)

---

## 🚀 5. Project Status (SMART VISIBILITY)

Rule you gave is GOOD:

> only show when they start building

So:

If no project:

```text id="no_project"
Project: Not Started Yet
```

If started:

```text id="project_live"
Project: Science Buddy
Status: In Progress ⚙️
```

If complete:

```text id="project_done"
🌐 Live: sciencebuddy.vercel.app
```

---

## 📅 6. Attendance Log

Simple but powerful:

* Week 1: Present
* Week 2: Present
* Week 3: Absent

Parents LOVE receipts more than grades 💀

---

## 🎓 7. Certificate Preview

```text id="cert_preview"
Certificate Progress: 70%

Requirements:
✔ Attendance
✔ Project Submission
⏳ Demo Day

Locked 🔒
```

---

## 💳 8. Payments / Invoice History

* Plan selected
* Payment confirmation
* Receipt download

Trust layer.

---

# 🧠 SYSTEM WIDE DESIGN LOGIC

This whole system now works like:

## Students:

> “I am playing, building, exploring”

## Parents:

> “I can see measurable proof of learning”

## Admin (you):

> “I can track everything without stress”

---
