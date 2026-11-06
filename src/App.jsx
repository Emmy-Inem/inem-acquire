import { AuthPage, SetupPage, LiveDemoForm } from "./live/AuthPages";
import { RequireAuth } from "./live/AuthContext";
import { LiveWorkspace } from "./live/Workspace";
import { AnimatedPreview } from "./PlatformMotion";
import WorkflowPreview from "./WorkflowPreview";
import HeroVideo from "./HeroVideo";
import React, { useMemo, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  Command,
  ContactRound,
  CreditCard,
  Database,
  FileBarChart2,
  FileText,
  Filter,
  Globe2,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  RefreshCcw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Target,
  TrendingUp,
  UserPlus,
  Users,
  WalletCards,
  X,
  Zap,
} from "lucide-react";

const stockFounder =
  "https://images.unsplash.com/photo-1573164713712-03790a178651?auto=format&fit=crop&q=85&w=1600";
const stockFocus =
  "https://images.pexels.com/photos/5668845/pexels-photo-5668845.jpeg?auto=compress&cs=tinysrgb&w=1400";

const green = "#2557d6";
const money = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  notation: "compact",
  maximumFractionDigits: 1,
});
const routes = {
  public: [
    "/",
    "/how-it-works",
    "/features",
    "/pricing",
    "/solutions",
    "/solutions/b2b-saas",
    "/solutions/agencies",
    "/solutions/service-businesses",
    "/book-demo",
    "/contact",
    "/about",
    "/blog",
    "/security",
    "/privacy",
    "/terms",
    "/acceptable-use",
    "/data-processing",
  ],
  auth: [
    "/signup",
    "/login",
    "/verify-email",
    "/forgot-password",
    "/reset-password",
    "/invite/team",
  ],
  onboarding: [
    "/onboarding/welcome",
    "/onboarding/company",
    "/onboarding/offer",
    "/onboarding/customers",
    "/onboarding/sales",
    "/onboarding/goals",
    "/onboarding/data",
    "/onboarding/review",
    "/onboarding/complete",
  ],
};
function Brand({ compact = false }) {
  return (
    <Link
      className={"brand " + (compact ? "compactBrand" : "")}
      to="/"
      aria-label="Inem Acquire home"
    >
      {compact ? (
        <img
          className="brandSymbol"
          src="/brand/symbol.svg"
          alt="Inem Acquire"
        />
      ) : (
        <>
          <img
            className="brandLogo colorLogo"
            src="/brand/color.svg"
            alt="Inem Acquire"
          />
          <img
            className="brandLogo whiteLogo"
            src="/brand/white.svg"
            alt=""
            aria-hidden="true"
          />
        </>
      )}
    </Link>
  );
}
function Pill({ children, tone = "neutral" }) {
  return <span className={"pill " + tone}>{children}</span>;
}
function Button({
  children,
  kind = "primary",
  icon: Icon,
  as: As = "button",
  ...p
}) {
  return (
    <As className={"btn " + kind} {...p}>
      {Icon && <Icon size={16} />}
      <span>{children}</span>
    </As>
  );
}
function PublicNav({ dark = false, onePage = false }) {
  const [open, setOpen] = useState(false);
  const items = [
    ["How it works", "how-it-works"],
    ["Features", "features"],
    ["Solutions", "solutions"],
    ["Pricing", "pricing"],
  ];
  return (
    <header className={"publicNav " + (dark ? "darkNav" : "")}>
      <Brand />
      <nav className={open ? "open" : ""}>
        {items.map(([label, id]) =>
          onePage ? (
            <a href={"#" + id} key={id} onClick={() => setOpen(false)}>
              {label}
            </a>
          ) : (
            <NavLink to={"/" + id} key={id}>
              {label}
            </NavLink>
          ),
        )}
      </nav>
      <div className="navActions">
        <Link to="/login" className="textLink">
          Log in
        </Link>
        <Button as={Link} to="/signup">
          Get started <ArrowRight size={15} />
        </Button>
        <button
          aria-label="Toggle navigation"
          className="mobileMenu"
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
    </header>
  );
}
function PublicFooter() {
  return (
    <footer>
      <div>
        <Brand />
        <p>Turn evidence into a more predictable sales process.</p>
      </div>
      <div>
        <b>Platform</b>
        <Link to="/features">Features</Link>
        <Link to="/pricing">Pricing</Link>
        <Link to="/security">Security</Link>
      </div>
      <div>
        <b>Company</b>
        <Link to="/about">About</Link>
        <Link to="/blog">Resources</Link>
        <Link to="/contact">Contact</Link>
      </div>
      <div>
        <b>Legal</b>
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
        <Link to="/acceptable-use">Acceptable use</Link>
      </div>
    </footer>
  );
}
function MiniProduct() {
  return (
    <div className="productPreview">
      <div className="previewTop">
        <span>
          <i />
          Acquisition overview
        </span>
        <Pill tone="green">Live workspace</Pill>
      </div>
      <div className="previewGrid">
        <div className="previewSide">
          <span className="active" />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="previewMain">
          <div className="previewGreeting">
            <div>
              <small>GOOD MORNING, ADA</small>
              <strong>Focus on the deals closest to a decision.</strong>
            </div>
            <Link to="/app/pipeline" className="previewPipelineLink">
              View pipeline
            </Link>
          </div>
          <div className="miniStats">
            <div>
              <small>Qualified pipeline</small>
              <b>₦42.8M</b>
              <em>↑ 18%</em>
            </div>
            <div>
              <small>Meetings booked</small>
              <b>24</b>
              <em>↑ 6</em>
            </div>
            <div>
              <small>Reply rate</small>
              <b>12.4%</b>
              <em>↑ 2.1%</em>
            </div>
          </div>
          <div className="miniChart">
            <div>
              <small>Pipeline created</small>
              <b>₦31.4M</b>
            </div>
            <svg viewBox="0 0 500 100" preserveAspectRatio="none">
              <path
                d="M0 90 C70 75,80 88,145 54 S250 70,305 38 S420 48,500 10"
                fill="none"
                stroke={green}
                strokeWidth="3"
              />
              <path
                d="M0 90 C70 75,80 88,145 54 S250 70,305 38 S420 48,500 10 L500 100 L0 100Z"
                fill="url(#g)"
              />
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                  <stop stopColor={green} stopOpacity=".22" />
                  <stop offset="1" stopColor={green} stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
function Home() {
  return (
    <div className="marketingSite">
      <PublicNav dark onePage />
      <div
        className="heroFrame"
      >
        <HeroVideo />
        <section className="humanHero">
          <div className="heroCopy">
            <span className="heroKicker">
              A clearer way to acquire customers
            </span>
            <h1>
              Your next customer.
              <br />
              Your next big move.
            </h1>
            <p>
              Find the right companies, start better conversations, and turn
              promising opportunities into customers. All in one connected
              workspace.
            </p>
            <a className="heroExplore" href="#features">
              Meet your new sales workspace <ArrowRight size={18} />
            </a>
          </div>
          <HeroSignup />
        </section>
        <div className="heroBottom">
          <span>
            <CheckCircle2 />
            Research with evidence
          </span>
          <span>
            <CheckCircle2 />
            Outreach you control
          </span>
          <span>
            <CheckCircle2 />
            Every opportunity connected
          </span>
        </div>
      </div>
      <main className="homeMain">
        <section className="acquireIntro">
          <span className="blueKicker">Less guesswork. More momentum.</span>
          <h2>
            Good sales starts
            <br />
            with a clear next step.
          </h2>
          <p>
            From your first prospect to your next closed deal, give your team a
            shared view of what matters.
          </p>
        </section>
        <WorkspaceShowcase />
        <DecisionJourney />
        <OnePageSolutions />
        <CapabilitySection />
        <OnePagePricing />
        <FaqSection />
        <DemoSection />
        <section className="closing">
          <span className="blueKicker">Make your next move</span>
          <h2>
            Great customers are out there.
            <br />
            Go find yours.
          </h2>
          <p>Bring your research, outreach and pipeline together.</p>
          <Button as={Link} to="/signup">
            Get started free <ArrowRight size={16} />
          </Button>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
function HeroSignup() {
  const [email, setEmail] = useState("");
  const navigate = useNavigate();
  return (
    <form
      className="heroSignup"
      onSubmit={(e) => {
        e.preventDefault();
        navigate("/signup?email=" + encodeURIComponent(email));
      }}
    >
      <span className="signupEyebrow">YOUR NEXT CHAPTER STARTS HERE</span>
      <h2>Make room for growth.</h2>
      <p>
        Build a sales process that moves
        <br />
        with your ambition.
      </p>
      <label htmlFor="hero-email">Work email</label>
      <input
        id="hero-email"
        type="email"
        autoComplete="email"
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <Button>
        Get started free <ArrowRight size={17} />
      </Button>
      <div className="signupPerks">
        <span>
          <Check size={14} />
          14-day trial
        </span>
        <span>
          <Check size={14} />
          No card required
        </span>
      </div>
      <small>
        By continuing, you agree to our <Link to="/terms">Terms</Link> and{" "}
        <Link to="/privacy">Privacy Policy</Link>.
      </small>
      <div className="signupLogin">
        Already have a workspace?{" "}
        <Link to="/login">
          Log in <ArrowRight size={13} />
        </Link>
      </div>
    </form>
  );
}
function WorkspaceShowcase() {
  const [active, setActive] = useState(0);
  const options = [
    [
      "Understand",
      Lightbulb,
      "See what is holding growth back.",
      "Bring your company, offer and customer context into a diagnosis your team can act on.",
      "/app/diagnosis",
    ],
    [
      "Discover",
      Search,
      "Find the accounts worth your time.",
      "Focus your research on companies that match your ideal customer, with evidence behind every score.",
      "/app/prospects",
    ],
    [
      "Engage",
      Send,
      "Start a conversation with context.",
      "Keep your messages relevant, your follow-ups timely and your team in control of every send.",
      "/app/campaigns",
    ],
    [
      "Convert",
      BriefcaseBusiness,
      "Give every opportunity a next step.",
      "Keep conversations, tasks and deal evidence connected as customers move through your pipeline.",
      "/app/pipeline",
    ],
  ];
  const selected = options[active];
  return (
    <section className="workspaceShowcase" id="features">
      <div className="showcaseHeading">
        <span className="blueKicker">One workspace. Every next move.</span>
        <h2>Meet your acquisition advantage.</h2>
      </div>
      <div
        className="showcaseTabs"
        role="tablist"
        aria-label="Explore the workflow"
      >
        {options.map(([label, Icon], i) => (
          <button
            id={"workflow-tab-" + i}
            role="tab"
            aria-selected={active === i}
            aria-controls="workflow-panel"
            tabIndex={active === i ? 0 : -1}
            key={label}
            onClick={() => setActive(i)}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                const next =
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? 3
                      : (active + (e.key === "ArrowRight" ? 1 : 3)) % 4;
                setActive(next);
                document.getElementById("workflow-tab-" + next)?.focus();
              }
            }}
          >
            <Icon size={19} />
            {label}
          </button>
        ))}
      </div>
      <div
        className="showcaseStage"
        id="workflow-panel"
        role="tabpanel"
        aria-labelledby={"workflow-tab-" + active}
      >
        <div className="showcaseText">
          <span>0{active + 1} / THE CONNECTED WORKFLOW</span>
          <h3>{selected[2]}</h3>
          <p>{selected[3]}</p>
          <Link to={selected[4]}>
            Explore {selected[0].toLowerCase()} <ArrowRight size={17} />
          </Link>
        </div>
        <div className="showcaseProduct">
          <span className="previewCaption">
            Illustrative workspace · sample data
          </span>
          <AnimatedPreview previewKey={active}>
            <WorkflowPreview active={active} />
          </AnimatedPreview>
        </div>
      </div>
    </section>
  );
}

function DecisionJourney() {
  return (
    <section className="decisionJourney" id="how-it-works">
      <div className="journeyIntro">
        <span className="blueKicker">From signal to next move</span>
        <h2>Your team should never have to guess what matters today.</h2>
        <p>
          Inem watches the handoffs between research, outreach and pipeline,
          then turns scattered activity into one decision your team can act on.
        </p>
        <a href="#demo">
          See it with your sales process <ArrowRight size={15} />
        </a>
      </div>
      <div className="journeyCanvas">
        <header>
          <span>
            <i />
            Live account story
          </span>
          <b>Meridian Cloud</b>
          <small>Updated 8 minutes ago</small>
        </header>
        <div className="journeySignal">
          <span className="journeyLabel">01 · Notice</span>
          <div>
            <b>Pricing intent is rising</b>
            <p>
              Four people from Meridian revisited pricing and security pages
              this week.
            </p>
          </div>
          <span className="signalCount">4 visits</span>
        </div>
        <div className="journeyThread">
          <i />
          <i />
          <i />
        </div>
        <div className="journeySignal decision">
          <span className="journeyLabel">02 · Decide</span>
          <div>
            <b>This account is worth attention</b>
            <p>
              It matches your enterprise ICP, has an active cloud migration and
              no open opportunity.
            </p>
            <div className="evidenceChips">
              <span>92 fit score</span>
              <span>Verified signal</span>
              <span>High confidence</span>
            </div>
          </div>
        </div>
        <div className="journeyThread">
          <i />
          <i />
          <i />
        </div>
        <div className="journeySignal action">
          <span className="journeyLabel">03 · Act</span>
          <div>
            <b>Open a conversation today</b>
            <p>
              Reach the VP of Infrastructure with the security proof point they
              viewed.
            </p>
          </div>
          <button>
            Review suggested outreach <ArrowRight size={14} />
          </button>
        </div>
        <footer>
          <CheckCircle2 />
          <span>
            <b>Nothing disappears between tools</b>
            <small>
              The research, decision, message and outcome stay attached to one
              account story.
            </small>
          </span>
        </footer>
      </div>
    </section>
  );
}

function OnePageSolutions() {
  return (
    <section className="growthLeaks" id="solutions">
      <div className="growthHead">
        <span className="blueKicker">Where revenue loses momentum</span>
        <h2>Fix the handoffs that quietly cost you customers.</h2>
        <p>
          Most teams do not need more sales activity. They need a clearer way to
          decide where effort belongs and what happens next.
        </p>
      </div>
      <div className="growthMosaic">
        <article className="leakResearch">
          <div className="leakCopy">
            <span>Too much noise</span>
            <h3>Your prospect list keeps growing. Confidence does not.</h3>
            <p>
              See why an account fits before anyone spends time researching or
              writing.
            </p>
          </div>
          <div className="miniAccounts">
            <header>
              <b>Accounts worth a closer look</b>
              <small>Ranked by evidence</small>
            </header>
            {[
              ["Nomba", "92", "Security hiring"],
              ["SeamlessHR", "89", "New market"],
              ["Helium Health", "76", "Recent funding"],
            ].map((x, i) => (
              <div key={x[0]}>
                <span className="rank">0{i + 1}</span>
                <b>{x[0]}</b>
                <small>{x[2]}</small>
                <strong>{x[1]}</strong>
              </div>
            ))}
          </div>
        </article>
        <article className="leakInterest">
          <span>Hidden buying intent</span>
          <h3>The warmest account is often buried in activity.</h3>
          <div className="intentPulse">
            <i />
            <div>
              <b>Meridian Cloud</b>
              <small>4 high-intent visits · 8 min ago</small>
            </div>
            <strong>Hot</strong>
          </div>
          <p>
            Bring meaningful signals into the same view as fit, contacts and
            open deals.
          </p>
        </article>
        <article className="leakMemory">
          <span>Follow-up by memory</span>
          <h3>Good conversations should not depend on someone remembering.</h3>
          <ul>
            <li>
              <Check />
              Share security overview <small>Today</small>
            </li>
            <li>
              <Check />
              Confirm buying committee <small>Tomorrow</small>
            </li>
            <li>
              <Clock3 />
              Proposal review <small>Friday</small>
            </li>
          </ul>
        </article>
        <article className="leakReceipt">
          <div>
            <span>Every decision has a receipt</span>
            <h3>Know what created revenue, not only where the deal ended.</h3>
          </div>
          <div className="receiptFlow">
            <span>ICP evidence</span>
            <ArrowRight />
            <span>Account signal</span>
            <ArrowRight />
            <span>Human action</span>
            <ArrowRight />
            <strong>₦8.4M won</strong>
          </div>
        </article>
      </div>
    </section>
  );
}

function ProofSection() {
  const voices = [
    {
      quote:
        "We stopped debating which accounts looked interesting. The reason to act is right there beside the account.",
      name: "Ada Okafor",
      role: "Revenue operations lead",
      tone: "blue",
    },
    {
      quote:
        "The team starts the day with a short list of decisions, not another dashboard to interpret.",
      name: "Tobi Adeyemi",
      role: "Sales team lead",
      tone: "dark",
    },
    {
      quote:
        "I can finally trace a won deal back to the segment, signal and follow-up that created it.",
      name: "Nneka Eze",
      role: "Founder and commercial lead",
      tone: "sand",
    },
  ];
  return (
    <section className="proofSection">
      <div className="proofStats">
        {[
          ["3.4x", "more qualified opportunities"],
          ["28%", "faster follow-up time"],
          ["94%", "of active deals with a next action"],
          ["1 view", "from research to revenue"],
        ].map((x) => (
          <div key={x[0]}>
            <strong>{x[0]}</strong>
            <span>{x[1]}</span>
          </div>
        ))}
      </div>
      <div className="voiceWall">
        <div className="voiceIntro">
          <span className="blueKicker">Early access feedback</span>
          <h2>Clarity feels different at every level of the team.</h2>
          <p>
            Three perspectives on what changes when evidence and action live in
            the same place.
          </p>
        </div>
        {voices.map((v, i) => (
          <blockquote className={"voiceCard " + v.tone} key={v.name}>
            <span className="quoteMark">“</span>
            <p>{v.quote}</p>
            <footer>
              <span className="avatar">
                {v.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </span>
              <span>
                <b>{v.name}</b>
                <small>{v.role}</small>
              </span>
            </footer>
            {i === 0 && <em>Beta feedback</em>}
          </blockquote>
        ))}
      </div>
    </section>
  );
}

function CapabilitySection() {
  const rows = [
    [
      Search,
      "Research with context",
      "Search companies against a selected ICP, see why each account fits, and keep source and verification dates visible.",
    ],
    [
      ContactRound,
      "Reach the right people",
      "Find relevant decision-makers, review contact quality and organize contacts before they enter a campaign.",
    ],
    [
      Send,
      "Launch with control",
      "Create tailored outreach, require human approval, schedule follow-ups and keep every reply connected to its source campaign.",
    ],
    [
      BriefcaseBusiness,
      "Convert with discipline",
      "Track deal value, stage history, tasks, proposals, next actions and verified outcomes without losing the original account context.",
    ],
  ];
  return (
    <section className="capabilitySection">
      <div className="capabilityMedia">
        <img
          src={stockFounder}
          alt="Two professionals working together at a laptop"
        />
        <div>
          <span>Next best action</span>
          <b>Follow up with 7 engaged accounts</b>
          <small>Based on campaign activity and open tasks</small>
        </div>
      </div>
      <div className="capabilityCopy">
        <span className="blueKicker">More than a lead database</span>
        <h2>Carry context through every stage of the sale.</h2>
        <p className="capabilityIntro">
          Inem Acquire keeps research, conversations, tasks and revenue evidence
          attached to the same customer journey.
        </p>
        {rows.map(([I, t, d]) => (
          <article key={t}>
            <I />
            <div>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function OnePagePricing() {
  const [yearly, setYearly] = useState(false);
  const plans = [
    {
      name: "Starter",
      monthly: 20,
      yearly: 16,
      desc: "For founders and small teams proving a repeatable acquisition motion.",
      features: [
        "1 workspace and 2 team members",
        "1 active offer and ICP",
        "500 prospect research credits",
        "Core campaigns and pipeline",
        "Standard reports",
      ],
    },
    {
      name: "Growth",
      monthly: 59,
      yearly: 47,
      desc: "For sales teams ready to scale research, outreach and reporting.",
      popular: true,
      features: [
        "5 team members",
        "Unlimited offers and ICPs",
        "2,500 prospect research credits",
        "Advanced campaigns and inbox",
        "AI diagnosis and advisor",
        "Custom reports and integrations",
      ],
    },
    {
      name: "Scale",
      custom: true,
      desc: "For larger organizations that need greater capacity, governance and support.",
      features: [
        "Flexible seats and usage",
        "Role-based access and SSO",
        "Advanced security controls",
        "Custom data integrations",
        "Dedicated onboarding",
        "Priority support and success plan",
      ],
    },
  ];
  return (
    <section className="pricingSection" id="pricing">
      <div className="sectionHead">
        <span className="blueKicker">Plans for every stage</span>
        <h2>Start focused. Scale with confidence.</h2>
        <p>
          Choose a plan that fits your team today. Change plans as your sales
          system grows.
        </p>
        <div className="billingToggle" aria-label="Billing frequency">
          <button
            aria-pressed={!yearly}
            className={!yearly ? "active" : ""}
            onClick={() => setYearly(false)}
          >
            Monthly
          </button>
          <button
            aria-pressed={yearly}
            className={yearly ? "active" : ""}
            onClick={() => setYearly(true)}
          >
            Yearly <span>Save 20%</span>
          </button>
        </div>
      </div>
      <div className="planGrid">
        {plans.map((plan) => (
          <article className={plan.popular ? "popular" : ""} key={plan.name}>
            {plan.popular && <span className="popularLabel">Most popular</span>}
            <h3>{plan.name}</h3>
            <p>{plan.desc}</p>
            <div className="planPrice">
              {plan.custom ? (
                <strong>Custom</strong>
              ) : (
                <>
                  <strong>${yearly ? plan.yearly : plan.monthly}</strong>
                  <span>/ month</span>
                </>
              )}
              <small>
                {plan.custom
                  ? "Talk to us about your requirements"
                  : yearly
                    ? "Billed annually"
                    : "Billed monthly"}
              </small>
            </div>
            <Button
              as={plan.custom ? "a" : Link}
              href={plan.custom ? "#demo" : undefined}
              to={plan.custom ? undefined : "/signup"}
              kind={plan.popular ? "primary" : "secondary"}
            >
              {plan.custom ? "Request a quote" : "Start free"}{" "}
              <ArrowRight size={15} />
            </Button>
            <ul>
              {plan.features.map((f) => (
                <li key={f}>
                  <Check />
                  {f}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <p className="pricingNote">
        All plans include guided onboarding, data export and human approval
        before outbound communication. Usage limits reset monthly.
      </p>
    </section>
  );
}

function FaqSection() {
  const faqs = [
    [
      "Can I use Inem Acquire without replacing my CRM?",
      "Yes. Start with Inem Acquire as your acquisition workspace, then connect or export qualified companies, contacts and deals to your existing CRM.",
    ],
    [
      "Does Inem Acquire send messages automatically?",
      "Your team controls outbound communication. Drafts, recipients and campaign settings can require approval before anything is sent.",
    ],
    [
      "Where does prospect data come from?",
      "Records can combine licensed provider data, public company information and details supplied by your team. Sources and verification dates remain visible.",
    ],
    [
      "What happens when information is missing?",
      "The platform marks unknown inputs and lowers confidence instead of presenting assumptions as verified facts.",
    ],
    [
      "Can each product have a different ICP?",
      "Yes. Every offer can have its own ICPs, prospect searches, messages, campaigns and performance reporting.",
    ],
    [
      "Is there a free trial?",
      "Starter and Growth plans include a 14-day trial. No payment card is required to create the initial workspace.",
    ],
  ];
  return (
    <section className="faqSection">
      <div>
        <span className="blueKicker">Common questions</span>
        <h2>Everything you need to evaluate Inem Acquire.</h2>
        <p>
          Still have a question? Request a demo and we will walk through your
          specific sales process.
        </p>
        <a href="#demo">
          Talk to our team <ArrowRight size={15} />
        </a>
      </div>
      <div className="faqList">
        {faqs.map((f, i) => (
          <details key={f[0]} open={i === 0}>
            <summary>
              {f[0]}
              <Plus />
            </summary>
            <p>{f[1]}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function DemoSection() {
  return (
    <section className="demoSection" id="demo">
      <div className="demoCopy">
        <span className="blueKicker">See it with your own sales process</span>
        <h2>Request a personalized demo.</h2>
        <p>
          Tell us what your team sells and where acquisition feels difficult.
          We’ll show you how the connected workflow can help.
        </p>
      </div>
      <LiveDemoForm />
    </section>
  );
}
function MarketingPage({ type }) {
  const data = {
    "how-it-works": [
      "A connected path from diagnosis to revenue",
      "Replace disconnected tools and unclear handoffs with one measurable acquisition process.",
    ],
    features: [
      "Every tool your team needs to acquire customers",
      "Research, engagement, pipeline and reporting-built around your offers and ideal customers.",
    ],
    pricing: [
      "Start focused. Scale when the process works.",
      "Clear plans with explicit research, enrichment and outreach limits.",
    ],
    solutions: [
      "Designed for considered B2B sales",
      "Practical workflows for SaaS companies, agencies and professional service teams.",
    ],
    "b2b-saas": [
      "Build a repeatable SaaS pipeline",
      "Connect product positioning, target accounts, multi-threaded outreach and revenue evidence.",
    ],
    agencies: [
      "Win more of the right client work",
      "Find accounts that value your specialty and keep every opportunity moving.",
    ],
    "service-businesses": [
      "Turn expertise into consistent opportunities",
      "Package your offer, target best-fit buyers and build a reliable follow-up rhythm.",
    ],
    about: [
      "Built to make acquisition less uncertain",
      "Inem Acquire helps teams make better sales decisions with evidence, clarity and control.",
    ],
    blog: [
      "Ideas for more predictable growth",
      "Practical guides for finding, engaging and converting the right customers.",
    ],
    security: [
      "Your sales data stays yours",
      "Tenant isolation, least-privilege access and audit-ready controls by design.",
    ],
    privacy: [
      "Privacy at Inem Acquire",
      "How we collect, use and protect account and workspace information.",
    ],
    terms: [
      "Terms of service",
      "The terms that govern use of the Inem Acquire platform.",
    ],
    "acceptable-use": [
      "Responsible platform use",
      "Rules designed to keep prospecting respectful, lawful and useful.",
    ],
    "data-processing": [
      "Data processing information",
      "How Inem Acquire handles customer data and service providers.",
    ],
  }[type];
  return (
    <>
      <PublicNav />
      <main className="marketing">
        <section className="pageHero">
          <Pill tone="green">INEM ACQUIRE</Pill>
          <h1>{data[0]}</h1>
          <p>{data[1]}</p>
          <Button as={Link} to={type === "pricing" ? "/signup" : "/book-demo"}>
            {type === "pricing" ? "Start free" : "See Inem Acquire"}{" "}
            <ArrowRight size={16} />
          </Button>
        </section>
        {type === "pricing" ? (
          <Pricing />
        ) : type === "blog" ? (
          <Blog />
        ) : (
          <FeatureBlocks type={type} />
        )}
      </main>
      <PublicFooter />
    </>
  );
}
function FeatureBlocks({ type }) {
  const items = [
    [
      "Evidence before opinions",
      "Every finding links back to known facts, supplied information or a clearly marked assumption.",
    ],
    [
      "A workflow your team can follow",
      "From discovery to follow-up, each record has a clear owner and next action.",
    ],
    [
      "Human control by default",
      "Your team reviews contacts, messaging and major changes before they happen.",
    ],
  ];
  return (
    <section className="featureBlocks">
      {items.map((x, i) => (
        <article key={x[0]}>
          <span>0{i + 1}</span>
          <div>
            <h2>{x[0]}</h2>
            <p>{x[1]}</p>
            <Link to="/features">
              Explore the capability <ArrowRight size={15} />
            </Link>
          </div>
          <div className={"abstract a" + i}>
            <Lightbulb />
          </div>
        </article>
      ))}
    </section>
  );
}
function Pricing() {
  return (
    <section className="pricingGrid">
      {[
        [
          "Foundation",
          "₦95,000",
          "For small teams building their first repeatable system.",
        ],
        [
          "Growth",
          "₦275,000",
          "For teams ready to scale research, campaigns and reporting.",
        ],
        [
          "Scale",
          "Custom",
          "For multi-team organizations with advanced controls.",
        ],
      ].map((p, i) => (
        <article className={i === 1 ? "featured" : ""} key={p[0]}>
          {i === 1 && <Pill tone="green">MOST POPULAR</Pill>}
          <h2>{p[0]}</h2>
          <p>{p[2]}</p>
          <b>{p[1]}</b>
          {p[1] !== "Custom" && <small>/ month</small>}
          <Button
            as={Link}
            to="/signup"
            kind={i === 1 ? "primary" : "secondary"}
          >
            Choose {p[0]}
          </Button>
          {[
            "Connected sales workspace",
            "ICP and prospect discovery",
            "Campaign approval workflow",
            "Pipeline and revenue reporting",
          ].map((x) => (
            <span className="checkLine" key={x}>
              <Check /> {x}
            </span>
          ))}
        </article>
      ))}
    </section>
  );
}
function Blog() {
  return (
    <section className="blogGrid">
      {[
        "Why more leads rarely fix a broken sales process",
        "How to create an ICP your team can actually use",
        "The revenue evidence every B2B team should track",
      ].map((x, i) => (
        <article key={x}>
          <div className={"blogArt b" + i} />
          <Pill>
            {i === 0 ? "STRATEGY" : i === 1 ? "TARGETING" : "MEASUREMENT"}
          </Pill>
          <h2>{x}</h2>
          <p>
            Practical guidance for building a more focused, measurable
            acquisition system.
          </p>
          <Link to="#">
            Read guide <ArrowRight size={15} />
          </Link>
        </article>
      ))}
    </section>
  );
}
function ContactPage() {
  return (
    <>
      <PublicNav />
      <main className="marketing">
        <DemoSection />
      </main>
      <PublicFooter />
    </>
  );
}
function NotFound() {
  return (
    <main className="notFound">
      <Brand />
      <h1>That page isn’t in this workspace.</h1>
      <p>The link may be outdated or you may not have access.</p>
      <Button as={Link} to="/app/dashboard">
        Return to dashboard
      </Button>
    </main>
  );
}
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      {routes.public.slice(1).map((p) => (
        <Route
          key={p}
          path={p}
          element={
            ["/book-demo", "/contact"].includes(p) ? (
              <ContactPage />
            ) : (
              <MarketingPage type={p.split("/").pop()} />
            )
          }
        />
      ))}
      {[
        "signup",
        "login",
        "forgot-password",
        "reset-password",
        "verify-email",
      ].map((mode) => (
        <Route
          key={mode}
          path={"/" + mode}
          element={<AuthPage key={mode} mode={mode} />}
        />
      ))}
      <Route path="/auth/callback" element={<AuthPage mode="callback" />} />
      <Route path="/invite/:token" element={<AuthPage mode="invite" />} />
      <Route
        path="/onboarding/*"
        element={
          <RequireAuth>
            <SetupPage />
          </RequireAuth>
        }
      />
      <Route
        path="/app/*"
        element={
          <RequireAuth>
            <LiveWorkspace />
          </RequireAuth>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
