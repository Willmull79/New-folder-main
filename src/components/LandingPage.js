import React, { useEffect, useState } from 'react';
import { AuthScreen } from './AuthScreen.js';

const SUPPORT_EMAIL = 'support@fantasydynastyleagues.com';

const LegalPage = ({ title, onBack }) => (
    <div className="landing-root min-h-screen min-h-[100dvh] flex flex-col">
        <div className="flex-1 max-w-2xl mx-auto w-full px-5 py-16">
            <button type="button" onClick={onBack} className="landing-link text-sm mb-8">
                Back
            </button>
            <h1 className="landing-display text-4xl sm:text-5xl text-white mb-6">{title}</h1>
            <p className="landing-muted leading-relaxed">
                This page is a placeholder and will be updated with full legal terms soon.
                For questions, contact{' '}
                <a className="landing-link underline" href={`mailto:${SUPPORT_EMAIL}`}>
                    {SUPPORT_EMAIL}
                </a>
                .
            </p>
        </div>
        <SiteFooter onTerms={() => {}} onPrivacy={() => {}} compact />
    </div>
);

const SiteFooter = ({ onTerms, onPrivacy, compact = false }) => (
    <footer className={`landing-footer ${compact ? 'landing-footer-compact' : ''}`}>
        <div className="landing-footer-inner">
            <p className="landing-display landing-footer-brand tracking-wide">FANTASY DYNASTY LEAGUES</p>
            <nav className="landing-footer-nav">
                <a href={`mailto:${SUPPORT_EMAIL}`} className="landing-link">
                    Contact Us
                </a>
                <button type="button" onClick={onTerms} className="landing-link">
                    Terms of Service
                </button>
                <button type="button" onClick={onPrivacy} className="landing-link">
                    Privacy Policy
                </button>
            </nav>
        </div>
    </footer>
);

/**
 * Public marketing landing for Stripe website verification.
 * Software / roster tooling copy only.
 */
export const LandingPage = ({
    showMessage,
    hasPendingInvite = false,
    forceAuth = false,
    onAuthSuccess,
}) => {
    const [view, setView] = useState(forceAuth || hasPendingInvite ? 'auth' : 'home');
    const [authPreferRegister, setAuthPreferRegister] = useState(false);

    useEffect(() => {
        if (forceAuth || hasPendingInvite) {
            setView('auth');
        }
    }, [forceAuth, hasPendingInvite]);

    if (view === 'terms') {
        return <LegalPage title="Terms of Service" onBack={() => setView('home')} />;
    }
    if (view === 'privacy') {
        return <LegalPage title="Privacy Policy" onBack={() => setView('home')} />;
    }

    if (view === 'auth') {
        return (
            <div className="landing-root min-h-screen min-h-[100dvh] flex flex-col">
                <div className="px-4 pt-4">
                    <button type="button" onClick={() => setView('home')} className="landing-link text-sm">
                        Back to FANTASY DYNASTY LEAGUES
                    </button>
                </div>
                <div className="flex-1">
                    <AuthScreen
                        showMessage={showMessage}
                        hasPendingInvite={hasPendingInvite}
                        onAuthSuccess={onAuthSuccess}
                        startInRegisterMode={authPreferRegister}
                    />
                </div>
                <SiteFooter
                    onTerms={() => setView('terms')}
                    onPrivacy={() => setView('privacy')}
                    compact
                />
            </div>
        );
    }

    const openRegister = () => {
        setAuthPreferRegister(true);
        setView('auth');
    };

    return (
        <div className="landing-root min-h-screen min-h-[100dvh] flex flex-col">
            <section className="landing-hero" aria-label="FANTASY DYNASTY LEAGUES">
                <div className="landing-hero-visual" aria-hidden="true" />
                <div className="landing-hero-content">
                    <p className="landing-display landing-fade-up landing-brand">
                        FANTASY DYNASTY LEAGUES
                    </p>
                    <h1 className="landing-fade-up-delay landing-headline">
                        Fully customizable dynasty football leagues
                    </h1>
                    <p className="landing-fade-up-delay landing-subcopy">
                        Open year-round — in season and off-season. Starting at $4 a month or $35 a year,
                        with the first month free so you can check out the site.
                    </p>
                    <div className="landing-fade-up-delay-2 landing-cta-row">
                        <button
                            type="button"
                            onClick={openRegister}
                            className="landing-cta landing-cta-primary"
                        >
                            Get started
                        </button>
                        <a href="#pricing" className="landing-cta landing-cta-secondary">
                            View pricing
                        </a>
                    </div>
                </div>
            </section>

            <section className="landing-pricing" aria-label="What you can customize">
                <div className="landing-pricing-inner">
                    <h2 className="landing-display landing-pricing-title">
                        Everything is customizable
                    </h2>
                    <p className="landing-pricing-lead">
                        Run IDP leagues, team defense, or both. Set up to 14 starters or as few as you want —
                        same with the bench. Salaries if you want them, auctions, regular drafts, snake drafts —
                        you name it, we do it. And if we do not, we will create it.
                    </p>
                </div>
            </section>

            <section id="pricing" className="landing-pricing">
                <div className="landing-pricing-inner">
                    <h2 className="landing-display landing-pricing-title">
                        Simple software pricing
                    </h2>
                    <p className="landing-pricing-lead">
                        $4 a month or $35 a year — first month free so you can try the site.
                    </p>
                    <button
                        type="button"
                        onClick={openRegister}
                        className="landing-cta landing-cta-alt"
                    >
                        Start now
                    </button>
                </div>
            </section>

            <SiteFooter
                onTerms={() => setView('terms')}
                onPrivacy={() => setView('privacy')}
            />
        </div>
    );
};

export default LandingPage;
