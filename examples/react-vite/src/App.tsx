import { PlanCard } from './PlanCard';

const plans = [
  { name: 'Starter', price: 0, features: ['1 project', 'Community support'] },
  { name: 'Pro', price: 12, features: ['Unlimited projects', 'Email support', 'Webhooks'] },
  { name: 'Team', price: 49, features: ['Everything in Pro', 'SSO', 'Audit log'] },
];

export function App() {
  return (
    <main className="page">
      <header className="hero">
        <h1>Pricing</h1>
        <p>Press <kbd>⌥G</kbd> / <kbd>Alt+G</kbd>, click anything, and leave a comment.</p>
      </header>
      <section className="plans">
        {plans.map((plan) => <PlanCard key={plan.name} {...plan} />)}
      </section>
      <form className="signup" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="email">Work email</label>
        <input id="email" type="email" placeholder="you@company.com" required />
        <button type="submit">Start free trial</button>
      </form>
    </main>
  );
}
