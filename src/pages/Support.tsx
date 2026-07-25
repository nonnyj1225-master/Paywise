import { useState } from "react";

interface FaqItem {
  q: string;
  a: string;
}

const faqs: FaqItem[] = [
  {
    q: "How do I add a bill?",
    a: "Go to the Bills tab in the bottom navigation, tap the '+ Add Bill' button, fill in the name, amount, due date, category, and priority, then save. Your bill will appear in the list and factor into your Best Course of Action projection.",
  },
  {
    q: "How does the Best Course of Action work?",
    a: "PayWise analyzes your pay schedule, estimated take-home pay, bill due dates, and categories to rank bills by urgency. It factors in due dates, bill priority, category severity (e.g., housing is more critical than subscriptions), and available funds across pay periods to suggest which bills to pay from each paycheck.",
  },
  {
    q: "What tax rate does PayWise use?",
    a: "PayWise uses estimated effective tax rates (federal + state combined) based on your state. For example, Florida uses ~22% (federal only, no state income tax), while California uses ~28%. You can override this with a custom tax rate in Settings.",
  },
  {
    q: "How do I compare two jobs?",
    a: "Go to the Compare tab, select two job profiles from your job history, and PayWise will show a side-by-side comparison of hourly rates, average net pay, tax rates, insurance deductions, and net pay after bills — so you can see which job leaves you with more money.",
  },
  {
    q: "How do I set up insurance deductions?",
    a: "Open Settings, scroll to 'Insurance Deductions', and add a deduction. You can enter a percentage of gross pay, a fixed dollar amount per check, or use the 'Learn from last check' option — enter what was actually deducted from a recent paycheck and PayWise calculates the percentage for you.",
  },
  {
    q: "Can I use PayWise for multiple jobs?",
    a: "Yes! In Settings, tap 'Add New Job' to create additional pay profiles with different hourly rates, pay schedules, and tax regions. Switch between active jobs anytime. The Compare tab lets you compare any two jobs from your history side by side.",
  },
  {
    q: "What are Savings Goals?",
    a: "Savings Goals let you set targets (like 'Emergency Fund — $1,000'), track progress, and add contributions as you go. PayWise shows your projected savings from your Best Course of Action plan, which you can put toward these goals.",
  },
  {
    q: "How do I reset my password?",
    a: "Password reset is not yet available in the app. If you need to reset your password, please contact us at support@paywise.app and we'll help you out as soon as possible.",
  },
];

export default function Support() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) => {
    setOpenIndex(openIndex === i ? null : i);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Help &amp; Support</h2>

      {/* FAQ */}
      <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-200 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Frequently Asked Questions</h3>
        <div className="space-y-1">
          {faqs.map((faq, i) => (
            <div key={i} className="border border-gray-100 rounded-lg overflow-hidden">
              <button
                onClick={() => toggle(i)}
                className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-900 hover:bg-gray-50 transition-colors"
              >
                <span>{faq.q}</span>
                <span className={`ml-2 transform transition-transform text-gray-400 ${openIndex === i ? "rotate-180" : ""}`}>
                  ▼
                </span>
              </button>
              {openIndex === i && (
                <div className="px-4 pb-3 text-sm text-gray-600 leading-relaxed">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Contact */}
      <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-200 space-y-3">
        <h3 className="text-lg font-semibold text-gray-900">Contact Us</h3>
        <p className="text-sm text-gray-600">
          Have questions or feedback? Email us at{" "}
          <a href="mailto:support@paywise.app" className="text-indigo-600 hover:text-indigo-700 underline">
            support@paywise.app
          </a>
          .
        </p>
        <p className="text-sm text-gray-500">
          You can also use <strong>Nonny</strong> — the 💬 chat button in the corner — for navigation help within the app.
        </p>
      </div>

      {/* About */}
      <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-200 space-y-3">
        <h3 className="text-lg font-semibold text-gray-900">About PayWise</h3>
        <p className="text-sm text-gray-600 leading-relaxed">
          PayWise helps hourly, shift, and gig workers take control of their finances. Enter your pay details,
          track your bills, and get a smart paycheck-by-paycheck plan that shows exactly what to pay and
          when — plus what's safe to save or spend. PayWise also connects you to free local financial
          counseling resources.
        </p>
        <p className="text-xs text-gray-400">
          PayWise is not a financial advisor. All projections are estimates based on the information you provide.
        </p>
      </div>
    </div>
  );
}
