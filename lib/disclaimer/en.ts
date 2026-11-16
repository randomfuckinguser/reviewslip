// English is the canonical source for the first-visit terms/disclaimer modal.
// This text is legally sensitive — keep it isolated here (not in the general UI
// dictionary) so it is easy to audit and review. Every other locale mirrors
// this shape; a missing locale falls back to English (see ./index.ts).

export interface Disclaimer {
  /** Short label so the modal can be re-shown if the terms change (bump it). */
  version: string;
  title: string;
  intro: string;
  risksHeading: string;
  risks: string[];
  liabilityHeading: string;
  liability: string;
  agree: string;
  accept: string;
  fullTerms: string;
}

const en: Disclaimer = {
  version: "2",
  title: "Please read before continuing",
  intro:
    "Reviewslip is a tool that helps your genuine customers write and post their own reviews. How you use it is entirely your responsibility, and there are real risks you should understand before you begin.",
  risksHeading: "Risks you accept",
  risks: [
    "Reviews created with Reviewslip may be filtered, hidden, or removed by Google at any time — including retroactively, months later.",
    "Misuse — asking only happy customers, offering incentives, posting from shared devices or your own network, or driving sudden spikes in review volume — can cause your listing to be flagged, given a public consumer alert, or suspended.",
    "Fake, incentivised, gated, or fabricated reviews violate Google's policies and the law in a growing number of markets — the FTC's rules in the United States, the EU's Unfair Commercial Practices and Omnibus Directives, the UK's Digital Markets, Competition and Consumers Act 2024, and Asian rules such as Japan's stealth-marketing regulation and China's anti-unfair-competition law — several of which carry penalties assessed per violation.",
    "You are solely responsible for complying with all applicable laws and with the policies of Google and any other platform you use, wherever you operate.",
    "Results are not guaranteed. Reviewslip does not control whether reviews are accepted, kept, or removed.",
  ],
  liabilityHeading: "No liability",
  liability:
    'Reviewslip is provided "as is" and "as available", without warranties of any kind. To the maximum extent permitted by law, Reviewslip and its owners and operators accept no liability whatsoever for any loss or damage arising from your use of the service — including removed or rejected reviews, flagged or suspended listings, regulatory or legal penalties, lost revenue, or reputational harm. You use Reviewslip entirely at your own risk.',
  agree:
    "By selecting “I understand and agree”, and by continuing to use this site, you confirm that you have read, understood, and accepted this notice and our full Terms of Service.",
  accept: "I understand and agree",
  fullTerms: "Read the full Terms of Service",
};

export default en;
