import { useNavigate } from "react-router-dom";
import { useState } from "react";
import "./LandingPage.css";

const AI_BUILDS = [
  { emoji: "📚", title: "Homework Hero", desc: "Explains tricky school topics in a simple way.", color: "var(--color-blue)" },
  { emoji: "🧠", title: "Study Buddy", desc: "Helps you revise and crush exam prep.", color: "var(--color-purple)" },
  { emoji: "📖", title: "Bible Explorer", desc: "Makes learning Bible stories fun & interactive.", color: "var(--color-green)" },
  { emoji: "✍️", title: "Story Studio", desc: "Turns your wildest ideas into exciting stories.", color: "var(--color-pink)" },
  { emoji: "🌍", title: "Language Coach", desc: "Practice vocabulary & convo like a pro.", color: "var(--color-orange)" },
  { emoji: "💡", title: "Dream Project", desc: "Your own original AI idea, built your way.", color: "var(--color-yellow)" },
];

const SKILLS = [
  { emoji: "🤖", title: "Understanding AI", desc: "How AI actually thinks (no boring theory)." },
  { emoji: "💬", title: "Prompt Engineering", desc: "Talk to AI like a true power user." },
  { emoji: "🧩", title: "Problem Solving", desc: "Break big problems into tiny wins." },
  { emoji: "🎨", title: "Designing Experiences", desc: "Make your AI feel alive & fun to use." },
  { emoji: "🌍", title: "Creative Thinking", desc: "Original ideas > copy-paste thinking." },
  { emoji: "🚀", title: "Bringing Ideas to Life", desc: "From sketch on paper to real working app." },
];

const JOURNEY = [
  { emoji: "💡", label: "Imagine an idea" },
  { emoji: "📝", label: "Plan it" },
  { emoji: "🤖", label: "Build your AI Assistant" },
  { emoji: "🎨", label: "Customize its personality" },
  { emoji: "🌐", label: "Launch it online" },
  { emoji: "🎤", label: "Present it on Demo Day" },
];

const WHY_CARDS = [
  { emoji: "✅", text: "Builds confidence" },
  { emoji: "✅", text: "Encourages creativity" },
  { emoji: "✅", text: "Teaches problem solving" },
  { emoji: "✅", text: "Inspires innovation" },
  { emoji: "✅", text: "Results in a real project" },
];

const FAQS = [
  { q: "Does my child need coding experience?", a: "Nope! Zero experience needed. We start from scratch and build up with hands-on guidance the whole way." },
  {
    q: "Does my child need a laptop to participate in this bootcamp?", a: "Yes. A laptop and a stable internet connection are required so your child can write code, build their AI projects, and participate fully in the hands-on activities throughout the bootcamp."
  },
  { q: "What age group is this for?", a: "Ages 9–16. The pace and projects adapt to where your child is at." },
  { q: "Is the project really theirs?", a: "100%. Every kid picks their own idea and personality for their AI — no two builds look the same." },
  { q: "How are classes delivered?", a: "Fully online, live, from anywhere with an internet connection." },
  { q: "Will there be a certificate?", a: "Yes! Every student gets a certificate after presenting on Demo Day." },
  { q: "What happens after the bootcamp?", a: "Your child keeps their project, plus access to resources to keep building and learning." },

];

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`faq-item ${open ? "open" : ""}`} onClick={() => setOpen(!open)}>
      <div className="faq-question">
        <span>{q}</span>
        <span className="faq-icon">{open ? "−" : "+"}</span>
      </div>
      {open && <p className="faq-answer">{a}</p>}
    </div>
  );
}

function PricingCalculator({ onRegister }) {
  const [kidCount, setKidCount] = useState(1);
  const PRICE_PER_GROUP = 130000;
  const groups = Math.ceil(kidCount / 3);
  const total = groups * PRICE_PER_GROUP;

  return (
    <div className="calc-inner">
      <div className="calc-counter">
        <button
          className="calc-btn"
          onClick={() => setKidCount((n) => Math.max(1, n - 1))}
          disabled={kidCount <= 1}
        >−</button>
        <span className="calc-count">{kidCount} {kidCount === 1 ? "kid" : "kids"}</span>
        <button
          className="calc-btn"
          onClick={() => setKidCount((n) => Math.min(9, n + 1))}
          disabled={kidCount >= 9}
        >+</button>
      </div>

      <div className="calc-breakdown">
        <div className="calc-row">
          <span>Groups needed</span>
          <span>{groups} × ₦130,000</span>
        </div>
        <div className="calc-row calc-total-row">
          <span>You pay</span>
          <span className="calc-total">₦{total.toLocaleString()}</span>
        </div>
        {kidCount > 3 && (
          <p className="calc-note">
            💡 {kidCount} kids = {groups} groups of 3 — each kid still gets the full experience!
          </p>
        )}
      </div>

      <button className="btn btn-primary btn-block" onClick={onRegister}>
        Register {kidCount} {kidCount === 1 ? "Kid" : "Kids"} →
      </button>
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="page-shell landing">
      {/* NAV */}
      <nav className="landing-nav">
        <div className="container nav-inner">
          <div className="nav-logo">🚀 Ravilletech</div>
          <div className="nav-links">
            <a href="#what-they-build">What They Build</a>
            <a href="#pricing">Pricing</a>
            <a href="#faqs">FAQs</a>
            <a href="#contact">Contact</a>
            <button className="btn-secondary btn nav-login" onClick={() => navigate("/login")}>
              Parent Login
            </button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <header className="hero">
        <div className="blob hero-blob-1" style={{ background: "var(--color-yellow)" }} />
        <div className="blob hero-blob-2" style={{ background: "var(--color-blue)" }} />
        <div className="blob hero-blob-3" style={{ background: "var(--color-pink)" }} />

        <div className="container hero-inner fade-up">
          <div className="pill-tag hero-pill">✨ Summer AI Creators Bootcamp</div>
          <h1 className="hero-headline">
            What If Your Child Built Their Own <span className="text-gradient">AI</span> This Summer?
          </h1>
          <p className="hero-subtitle">
            From curious learner to confident creator. Discover how modern AI works, build a personalized
            AI assistant, and launch a project that showcases creativity, problem-solving, and future-ready
            skills — all in one unforgettable summer experience.
          </p>
          <button className="btn btn-primary hero-cta" onClick={() => navigate("/register")}>
            🚀 Register Now
          </button>
        </div>
      </header>

      {/* THE BIG IDEA */}
      <section className="section big-idea">
        <div className="container">
          <h2 className="section-title">The Future Won't Be Built By People Who Only Use AI.</h2>
          <p className="section-subtitle">It will be built by those who understand it, shape it, and create with it.</p>
          <p className="big-idea-text">
            Every day, millions of people use AI tools like ChatGPT to learn, work, and solve problems.
            But behind every great AI is someone who imagined it, designed it, and brought it to life.
            This summer, your child will step behind the curtain — not just to use AI, but to understand it,
            personalize it, and build an AI assistant they can proudly call their own.
          </p>
        </div>
      </section>

      {/* IMAGINE THIS */}
      <section className="section imagine">
        <div className="container imagine-inner">
          <h2 className="section-title light">Imagine Hearing This at Home...</h2>
          <p className="imagine-quote">"Mom... Dad... I built this AI myself."</p>
          <p className="imagine-text">
            Not another summer spent endlessly scrolling. Not another holiday forgotten by September.
            This is a summer where ideas become intelligent creations.
          </p>
        </div>
      </section>

      {/* MEET THE AI THEY'LL CREATE */}
      <section className="section meet-ai" id="what-they-build">
        <div className="container">
          <h2 className="section-title">Meet the AI They'll Create</h2>
          <p className="section-subtitle">Every student builds an AI assistant based on something they love. No two projects are the same.</p>

          <div className="ai-grid">
            {AI_BUILDS.map((item) => (
              <div className="ai-card" key={item.title} style={{ "--accent": item.color }}>
                <div className="ai-card-emoji">{item.emoji}</div>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </div>
            ))}
          </div>
          <p className="meet-ai-footer">Creativity leads the way. ✨</p>
        </div>
      </section>

      {/* WHAT THEY'LL LEARN */}
      <section className="section skills">
        <div className="container">
          <h2 className="section-title">Future Skills They Can't Learn From Watching Videos</h2>
          <div className="skills-grid">
            {SKILLS.map((s) => (
              <div className="skill-card" key={s.title}>
                <div className="skill-emoji">{s.emoji}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* THE JOURNEY */}
      <section className="section journey">
        <div className="container">
          <h2 className="section-title">From Idea to Intelligent Creation</h2>
          <div className="journey-track">
            {JOURNEY.map((step, i) => (
              <div className="journey-step" key={step.label}>
                <div className="journey-emoji">{step.emoji}</div>
                <p>{step.label}</p>
                {i < JOURNEY.length - 1 && <div className="journey-arrow">↓</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHY THIS MATTERS */}
      <section className="section why-matters">
        <div className="container">
          <h2 className="section-title">Children Are Growing Up in an AI World.</h2>
          <p className="section-subtitle">
            The question isn't whether they'll use AI. It's whether they'll know how to create with it.
          </p>
          <p className="why-matters-text">
            Technology is changing every career. By introducing children to AI in a creative, age-appropriate
            way, we're helping them build confidence, curiosity, and the mindset to solve tomorrow's problems.
          </p>
        </div>
      </section>

      {/* WHY PARENTS CHOOSE US */}
      <section className="section why-us">
        <div className="container">
          <h2 className="section-title">More Than a Holiday Class.</h2>
          <div className="why-us-grid">
            {WHY_CARDS.map((c) => (
              <div className="why-us-card" key={c.text}>
                <span>{c.emoji}</span> {c.text}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHO CAN JOIN */}
      <section className="section who-can-join">
        <div className="container">
          <h2 className="section-title">Designed for Curious Young Minds</h2>
          <div className="join-grid">
            <div className="join-card">👦 Ages 9–16</div>
            <div className="join-card">💻 Beginner Friendly</div>
            <div className="join-card">🤖 No Coding Experience Required</div>
            <div className="join-card">🌍 Learn from Anywhere</div>
          </div>
        </div>
      </section>

      {/* COMPARISON TABLE */}
      <section className="section comparison">
        <div className="container">
          <h2 className="section-title">Why This Summer Will Be Different</h2>
          <div className="comparison-table">
            <div className="comparison-row comparison-header">
              <div>Most Holidays</div>
              <div>AI Creators Bootcamp</div>
            </div>
            {[
              ["Endless screen time", "Creative screen time"],
              ["Playing games", "Building AI"],
              ["Watching technology", "Creating technology"],
              ["Forgettable holidays", "A project they'll proudly remember"],
              ["Consuming AI", "Building AI"],
            ].map(([left, right]) => (
              <div className="comparison-row" key={left}>
                <div className="comparison-cell-left">✗ {left}</div>
                <div className="comparison-cell-right">✓ {right}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="section pricing" id="pricing">
        <div className="container">
          <h2 className="section-title">Simple, Transparent Pricing</h2>
          <p className="section-subtitle">
            No hidden fees. No confusing tiers. Just one straightforward plan.
          </p>

          <div className="pricing-layout">

            {/* Main pricing card */}
            <div className="pricing-card">
              <div className="pricing-badge">🔥 Summer 2026</div>
              <div className="pricing-amount">
                <span className="pricing-currency">₦</span>
                <span className="pricing-number">130,000</span>
              </div>
              <p className="pricing-per">per group of up to 3 kids</p>

              <div className="pricing-divider" />

              <ul className="pricing-includes">
                <li>✅ Full bootcamp access (all sessions)</li>
                <li>✅ Build a real, working AI project</li>
                <li>✅ Live online classes with an instructor</li>
                <li>✅ Demo Day presentation</li>
                <li>✅ Certificate of completion</li>
                <li>✅ Keep the project after bootcamp</li>
              </ul>

              <button className="btn btn-primary btn-block pricing-cta" onClick={() => navigate("/register")}>
                🚀 Register Now
              </button>
            </div>

            {/* Interactive calculator */}
            <div className="pricing-calc">
              <h3>🧮 How much will I pay?</h3>
              <p className="calc-sub">
                Kids are grouped in 3s for live sessions. One payment covers up to 3 kids — so
                a 4th kid just starts a new group.
              </p>

              <div className="calc-control">
                <span className="calc-label">How many kids are you registering?</span>
                <PricingCalculator onRegister={() => navigate("/register")} />
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* FAQS */}
      <section className="section faqs" id="faqs">
        <div className="container">
          <h2 className="section-title">Got Questions?</h2>
          <div className="faq-list">
            {FAQS.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}

      <section className="section contact" id="contact">
        <div className="container">
          <h2 className="section-title">Got More Questions? We Got You.</h2>
          <p className="section-subtitle">
            Reach out directly — we're real people, not bots (well, we build bots, but you get the idea 😄).
          </p>
          <div className="contact-grid">
            <a className="contact-card" href="tel:+2348052000447">
              <div className="contact-icon">📞</div>
              <h3>Call Us</h3>
              <p>+234 805 2000 447</p>
              <span className="contact-hint">Mon – Fri, 9am – 5pm WAT</span>
            </a>
            <a className="contact-card" href="mailto:support@ravilletech.com">
              <div className="contact-icon">✉️</div>
              <h3>Email Support</h3>
              <p>support@ravilletech.com</p>
              <span className="contact-hint">We reply within 24 hours</span>
            </a>
            <a className="contact-card" href="https://wa.me/2348052000447" target="_blank" rel="noreferrer">
              <div className="contact-icon">💬</div>
              <h3>WhatsApp</h3>
              <p>+234 805 2000 447</p>
              <span className="contact-hint">Quickest way to reach us</span>
            </a>
          </div>
        </div>
      </section>



      {/* FINAL CTA */}
      <section className="final-cta">
        <div className="blob hero-blob-1" style={{ background: "var(--color-yellow)", opacity: 0.3 }} />
        <div className="container final-cta-inner">
          <h2 className="section-title light">The Future Doesn't Wait. Neither Should They.</h2>
          <p className="final-cta-text">
            This summer, don't just give your child another activity. Give them the opportunity to build
            something remarkable, discover how AI works, and take their first step toward becoming a
            creator of tomorrow's technology.
          </p>
          <button className="btn btn-primary hero-cta" onClick={() => navigate("/register")}>
            🚀 Register Now
          </button>
        </div>
      </section>

      <footer className="landing-footer">
        <p>© {new Date().getFullYear()} Ravilletech AI Creators Bootcamp. Built with 💜 for future creators.</p>
      </footer>
    </div>
  );
}
