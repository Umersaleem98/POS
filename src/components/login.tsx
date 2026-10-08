"use client";
import { ShoppingBag, Layers, ArrowRight, ArrowUpRight } from "lucide-react";
export default function Login({
  error,
  busy,
  onSubmit,
  onDemo,
}: {
  error: string;
  busy: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onDemo: () => void;
}) {
  return (
    <div className="login-page">
      <div className="login-story">
        <div className="brand">
          <span className="brand-icon">P</span>POS
          <span className="brand-tag">WORKSPACE</span>
        </div>
        <span className="eyebrow">BUILT FOR YOUR EVERYDAY</span>
        <h1>
          A better day
          <br />
          at the counter.
        </h1>
        <p>
          Bring your sales, stock, and people together.
          <br />
          One clear view. More room to grow.
        </p>
        <div className="login-tiles">
          <div>
            <ShoppingBag size={32} />
            <strong>Sell with confidence</strong>
            <span>A checkout that keeps up with you.</span>
          </div>
          <div>
            <Layers size={32} />
            <strong>Know your inventory</strong>
            <span>Every product. Every movement.</span>
          </div>
        </div>
        <small>YOUR BUSINESS, BEAUTIFULLY ORGANIZED.</small>
      </div>
      <div className="login-form">
        <span className="eyebrow">WELCOME TO POS</span>
        <h2>Let’s get to work.</h2>
        <p>Sign in to your retail workspace.</p>
        <form onSubmit={onSubmit}>
          <label>
            Email address
            <input
              name="email"
              type="email"
              required
              placeholder="owner@pos.local"
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              placeholder="Your password"
              autoComplete="current-password"
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button className="primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
            <ArrowRight size={18} />
          </button>
        </form>
        <div className="divider">or explore first</div>
        <button className="secondary wide" onClick={onDemo}>
          Open interactive demo <ArrowUpRight size={16} />
        </button>
        <p className="help">
          First time? Follow the included README to connect XAMPP MySQL and
          create your super admin account.
        </p>
      </div>
    </div>
  );
}
