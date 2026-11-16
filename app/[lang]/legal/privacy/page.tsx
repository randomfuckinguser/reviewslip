import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { buildPageMetadata } from "@/lib/i18n/metadata";
import inner from "../../inner.module.css";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/legal/privacy">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  return buildPageMetadata(
    lang,
    "/legal/privacy",
    getDictionary(lang).seo.privacy
  );
}

/**
 * The policy itself is English on every locale, deliberately.
 *
 * The heading and navigation stay translated, but a privacy policy is the text
 * a regulator reads and a court construes — a machine translation of it would be
 * a second, subtly different set of promises, and whichever version someone
 * relied on would be the one that mattered. Standard practice is one
 * authoritative language, said plainly, which is what the note below does.
 */
export default async function PrivacyPage({
  params,
}: PageProps<"/[lang]/legal/privacy">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const t = getDictionary(lang);
  const p = t.legal.privacy;

  return (
    <>
      <header className={inner.header}>
        <div className={`wrap ${inner.headerInner}`}>
          <span className="eyebrow">{p.eyebrow}</span>
          <h1 className={inner.h1}>{p.title}</h1>
          <p className={inner.small}>Last updated: [DATE]</p>
        </div>
      </header>

      <section className="section">
        <div className={`wrap ${inner.prose}`}>
          <div className={inner.callout}>
            <strong>Attorney review note:</strong> This draft reflects
            Reviewslip’s home jurisdiction as Thailand, including a section on
            Thailand’s Personal Data Protection Act (PDPA). Please confirm the
            fully registered company name, fill in the remaining bracketed
            placeholders (dates, retention periods), confirm the description of
            cookies, analytics tools and AI providers matches what is actually
            used, and have this Policy reviewed by counsel familiar with privacy
            law in Thailand and any other places users are located — Thai PDPA
            compliance often involves operational steps (a designated contact
            point, a data processing record, and cross-border transfer
            safeguards) beyond this Policy’s text.
          </div>

          {lang !== "en" && (
            <p className={inner.small}>
              This policy is published in English only. Translations elsewhere on
              this site are provided for convenience; the English text is the
              authoritative version.
            </p>
          )}

          <h2>1. Scope of this policy</h2>
          <p>
            This Privacy Policy explains how Reviewslip (“Reviewslip,” “we,”
            “us,” or “our”) collects, uses, discloses, and protects information
            in connection with the Reviewslip website, web application, QR review
            slips, AI drafting tools, dashboards, and related services
            (collectively, the “Service”). Capitalized terms not defined in this
            Policy have the meaning given to them in our Terms of Service.
          </p>

          <h2>2. Information we collect</h2>

          <h3>A. Information provided by business users</h3>
          <p>When a business registers or uses a Reviewslip account, we collect:</p>
          <ul>
            <li>
              Account registration details (name, business name, business email,
              phone number);
            </li>
            <li>Business location information and contact details;</li>
            <li>
              Configuration data (review destination URLs, custom categories,
              landing page designs, and QR code settings);
            </li>
            <li>
              Billing and transaction history (payment details are processed
              securely directly by third-party payment gateways); and
            </li>
            <li>Support communications and feedback.</li>
          </ul>

          <h3>B. Information submitted through end-customer experiences</h3>
          <p>
            End-customers interacting with a Reviewslip QR code or link do not
            need to create an account. When interacting with a Reviewslip
            experience, we may collect:
          </p>
          <ul>
            <li>
              Feedback selections, ratings, categories, or keywords chosen by the
              customer;
            </li>
            <li>
              Text entries or custom descriptions submitted to assist AI drafting;
            </li>
            <li>Edits made to suggested draft reviews; and</li>
            <li>
              Any additional information voluntarily submitted through the review
              portal.
            </li>
          </ul>
          <p>
            <strong>Note for customers:</strong> Please do not submit sensitive
            personal identifiers (such as financial account numbers, passwords, or
            government ID numbers) into review feedback fields.
          </p>

          <h3>C. Automatically collected information</h3>
          <p>
            When anyone accesses the Service, we automatically log standard
            technical data, including:
          </p>
          <ul>
            <li>IP address and approximate location derived from IP;</li>
            <li>
              Browser type, device type, operating system, and language settings;
            </li>
            <li>
              Date/time stamps, referring/exit URLs, and clickstream data; and
            </li>
            <li>Diagnostic logs and performance metrics.</li>
          </ul>

          <h2>3. Cookies and tracking technologies</h2>
          <p>
            We and our service providers use essential cookies, local storage, and
            similar web technologies to ensure the Service functions securely,
            remember preferences, maintain user sessions, and analyze aggregate
            traffic patterns. [If applicable, list any specific analytics or
            advertising technologies you use, e.g. Google Analytics, Meta Pixel:
            ___.]
          </p>
          <p>
            You can manage cookie preferences via your web browser settings.
            Disabling essential cookies may impair core application features.
          </p>
          <p>
            <strong>Do Not Track:</strong> Our Service does not currently change
            its behavior in response to “Do Not Track” browser signals.
          </p>
          <p>
            <strong>Global Privacy Control:</strong> Because we do not sell or
            share personal information for cross-context behavioral advertising,
            we do not currently process opt-out preference signals such as Global
            Privacy Control (GPC) as sale/share opt-outs. If our data practices
            change, we will update this Policy and our opt-out mechanisms
            accordingly.
          </p>

          <h2>4. How we use information</h2>
          <p>We process collected data to:</p>
          <ul>
            <li>Operate, maintain, host, and deliver the features of the Service;</li>
            <li>Facilitate AI-assisted draft generation requested by users;</li>
            <li>Process subscriptions and manage user billing;</li>
            <li>
              Authenticate accounts and prevent fraudulent, unauthorized, or
              abusive activity;
            </li>
            <li>Provide user support and respond to inquiries;</li>
            <li>
              Monitor application performance, troubleshoot errors, and optimize
              usability; and
            </li>
            <li>
              Comply with legal obligations and enforce our Terms of Service.
            </li>
          </ul>

          <h2>5. AI processing and third-party infrastructure</h2>
          <p>
            <strong>How AI works:</strong> Reviewslip uses third-party artificial
            intelligence API providers (such as OpenAI) to convert user selections
            and feedback keywords into readable draft review text.
          </p>
          <p>
            <strong>Data security and model training:</strong> Data transmitted to
            our AI infrastructure partners is encrypted in transit and processed
            solely to generate real-time draft suggestions. We do not permit
            third-party AI providers to use your review inputs or feedback data to
            train public AI models. We may change AI infrastructure providers from
            time to time; any new provider will be bound by confidentiality and
            data protection obligations consistent with this Policy.
          </p>
          <p>
            <strong>Advertising:</strong> We do not sell or monetize customer
            review content for targeted advertising purposes.
          </p>

          <h2>6. How we share information</h2>
          <p>
            We do not sell personal data for monetary gain. We share data only
            with trusted third parties under the following circumstances:
          </p>
          <ul>
            <li>
              <strong>Service providers:</strong> Cloud host providers, database
              infrastructure, secure payment gateways, email delivery systems, and
              AI processing APIs bound by confidentiality and security
              obligations.
            </li>
            <li>
              <strong>Legal and protection requirements:</strong> When required by
              law, subpoena, court order, or to protect the safety, rights, or
              property of Reviewslip, our users, or the public.
            </li>
            <li>
              <strong>Business reorganization:</strong> In connection with a
              corporate merger, acquisition, financing, asset sale, or bankruptcy
              proceeding.
            </li>
          </ul>
          <p>We do not share Customer Content across different Business accounts.</p>

          <h2>7. Legal bases for processing (GDPR / UK GDPR)</h2>
          <p>
            If you reside in the EEA or UK, our legal bases for processing
            personal information are:
          </p>
          <ul>
            <li>
              <strong>Contractual necessity:</strong> To perform our obligations
              under our Terms of Service.
            </li>
            <li>
              <strong>Legitimate interests:</strong> To secure, operate, and
              improve our services, provided your privacy rights do not override
              these interests.
            </li>
            <li>
              <strong>Legal obligation:</strong> To comply with statutory and
              regulatory mandates.
            </li>
            <li>
              <strong>Consent:</strong> Where explicit consent has been provided
              (e.g. non-essential cookies).
            </li>
          </ul>
          <p>
            Where a business subscriber, rather than Reviewslip, determines the
            purposes and means of processing End-Customer personal data (for
            example, deciding which customers to invite for feedback), that
            business subscriber is the data controller responsible for
            establishing its own lawful basis. See Section 14.
          </p>

          <h2>8. International data transfers</h2>
          <p>
            Reviewslip and its infrastructure providers may process and store data
            on servers located in the United States and other regions outside your
            home jurisdiction. Where required, we use standard contractual clauses
            (SCCs) or equivalent transfer safeguards approved by applicable
            regulators, including any mechanisms recognized under Thailand’s
            Personal Data Protection Act for transferring personal data outside
            Thailand.
          </p>

          <h2>9. Data retention and security</h2>
          <p>
            We retain personal information for as long as reasonably necessary to
            provide the Service, comply with legal, tax, and accounting
            obligations, resolve disputes, and enforce our agreements. As general
            guidance:
          </p>
          <ul>
            <li>
              Business Account data is retained for the duration of your active
              subscription and for up to [RETENTION PERIOD] afterward;
            </li>
            <li>
              End-Customer feedback, ratings, and draft content submitted through
              your dashboard is retained for up to [RETENTION PERIOD] unless you
              request earlier deletion; and
            </li>
            <li>
              Automatically collected technical and log data is retained for up to
              [RETENTION PERIOD] for security and diagnostic purposes.
            </li>
          </ul>
          <p>You may request deletion of specific data as described in Section 10.</p>
          <p>
            <strong>Security:</strong> We implement administrative, technical, and
            physical security measures designed to protect data against
            unauthorized access, loss, or disclosure. However, no internet
            transmission is completely risk-free, and we cannot guarantee absolute
            security.
          </p>
          <p>
            <strong>Breach notification:</strong> If we become aware of a security
            incident affecting your personal information, we will notify affected
            individuals and/or applicable regulators as required by applicable law.
          </p>

          <h2>10. Your privacy rights</h2>
          <p>Depending on your jurisdiction, you may have the right to:</p>
          <ul>
            <li>Access the personal information we hold about you;</li>
            <li>Correct inaccurate or outdated information;</li>
            <li>Delete (erase) your personal data;</li>
            <li>Restrict or object to certain processing activities;</li>
            <li>Data portability (receive a portable copy of your data); and</li>
            <li>
              Withdraw consent at any time where processing was based on consent.
            </li>
          </ul>
          <p>
            To exercise any of these rights, please contact us at{" "}
            <a href="mailto:info@reviewslip.com">info@reviewslip.com</a>. We may
            verify your identity before processing your request. If you are
            located in the EEA or UK and believe we have not adequately addressed
            your request, you also have the right to lodge a complaint with your
            local data protection supervisory authority.
          </p>

          <h2>11. California privacy rights (CCPA/CPRA)</h2>
          <p>
            Under the California Consumer Privacy Act (CCPA), California residents
            have specific rights regarding their personal information:
          </p>
          <ul>
            <li>
              <strong>Right to know / access:</strong> Request disclosure of
              categories and specific pieces of personal data collected.
            </li>
            <li>
              <strong>Right to delete:</strong> Request deletion of personal
              information maintained by us.
            </li>
            <li>
              <strong>Right to correct:</strong> Request correction of inaccurate
              personal data.
            </li>
            <li>
              <strong>No sale or sharing:</strong> Reviewslip does not sell
              personal information or “share” personal data for cross-context
              behavioral advertising as defined by the CCPA. Because of this, we
              do not currently need to honor opt-out preference signals for that
              purpose; see Section 3.
            </li>
          </ul>

          <h2>12. Other U.S. state privacy rights</h2>
          <p>
            Residents of certain other U.S. states with comprehensive privacy laws
            (including, as of this Policy’s last update, Colorado, Connecticut,
            Virginia, Utah, and others) may have rights similar to those described
            in Sections 10 and 11, such as the right to access, correct, delete,
            and port personal information, and to opt out of certain processing.
            To exercise these rights, contact us at{" "}
            <a href="mailto:info@reviewslip.com">info@reviewslip.com</a>.
          </p>

          <h2>13. Thailand Personal Data Protection Act (PDPA) rights</h2>
          <p>
            Because Reviewslip is based in Thailand, we also process personal
            information in accordance with Thailand’s Personal Data Protection Act
            B.E. 2562 (2019) (“Thai PDPA”). If you are located in Thailand, your
            rights include:
          </p>
          <ul>
            <li>
              The right to be informed of how your personal data is collected and
              used;
            </li>
            <li>The right to access and request a copy of your personal data;</li>
            <li>The right to request correction of inaccurate personal data;</li>
            <li>
              The right to request erasure, destruction, or anonymization of your
              personal data;
            </li>
            <li>The right to restrict or object to certain processing;</li>
            <li>The right to data portability; and</li>
            <li>
              The right to withdraw consent at any time, without affecting the
              lawfulness of processing carried out before withdrawal.
            </li>
          </ul>
          <p>
            To exercise these rights, contact us at{" "}
            <a href="mailto:info@reviewslip.com">info@reviewslip.com</a>. You also
            have the right to lodge a complaint with Thailand’s Office of the
            Personal Data Protection Committee (PDPC) if you believe we have not
            handled your personal data in compliance with the Thai PDPA.
          </p>

          <h2>14. Role as data processor and business customer relations</h2>
          <p>
            When end-customers interact with a Reviewslip QR code generated by a
            business subscriber, that business subscriber acts as the primary data
            controller for their customer interactions, and Reviewslip acts as a
            data processor. If you are an end-customer seeking to exercise privacy
            rights regarding data maintained directly by a business subscriber, you
            should contact that business directly.
          </p>
          <p>
            Business subscribers who need a written Data Processing Agreement (for
            example, to satisfy Article 28 of the GDPR) may request one by
            contacting <a href="mailto:info@reviewslip.com">info@reviewslip.com</a>.
          </p>

          <h2>15. Children’s privacy</h2>
          <p>
            The Service is strictly intended for individuals aged 18 and older. We
            do not knowingly collect or solicit personal information from children
            under 18. If we learn that we have collected data from a child under
            18, we will delete it promptly.
          </p>

          <h2>16. Updates to this Privacy Policy</h2>
          <p>
            We may revise this Privacy Policy periodically. Updated versions will
            be posted on this page with an updated “Last updated” date. Continued
            use of the Service after changes are published constitutes
            acknowledgment of the revised terms.
          </p>

          <h2>17. Contact us</h2>
          <p>
            For questions, privacy inquiries, or data rights requests, please
            contact:
          </p>
          <p>
            Reviewslip
            <br />
            Email: <a href="mailto:info@reviewslip.com">info@reviewslip.com</a>
            <br />
            Address: 108 Moo 8, T. On Tai, San Kamphaeng, Chiang Mai 50130,
            Thailand
          </p>
        </div>
      </section>
    </>
  );
}
