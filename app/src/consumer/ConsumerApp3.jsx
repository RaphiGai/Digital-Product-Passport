import { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Leaf,
  Recycle,
  MapPin,
  Layers,
  Droplets,
  Wrench,
  Trash2,
  ExternalLink,
  BadgeCheck,
  Sparkles,
  AlertCircle,
  Repeat,
  PlayCircle,
  Gauge,
  Fingerprint,
  FileCheck,
  Download,
  Share2,
  Copy,
  Printer,
  ShoppingBag,
  Megaphone
} from 'lucide-react';
import { MARKETING_LINK_LABEL } from '@/lib/fieldCatalogue';

/**
 * Public consumer view (no auth). Opened from a QR scan at /public/dpp/:token.
 * Renders the visibility-filtered passport from the backend public-handler.js
 * (product, variant, batch, materials/BOM tree, marketing). No internal fields.
 */

function tokenFromPath() {
  const url = new URL(window.location.href);
  const q = url.searchParams.get('token');
  if (q) return q;
  const m = url.pathname.match(/\/dpp\/([^/]+)/);
  return m ? m[1] : null;
}

const ESPR_LABEL = {
  compliant: 'ESPR compliant',
  in_review: 'ESPR in review',
  non_compliant: 'Not compliant',
  draft: 'ESPR draft'
};

/** de-DE number: comma decimal, dot thousands. Returns null for empty. */
const deNum = (v, digits = 2) =>
  v == null || v === ''
    ? null
    : new Intl.NumberFormat('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(v));

/** ISO date → DD.MM.YYYY (German standard). */
const deDate = (v) => {
  if (!v) return null;
  const [y, m, d] = String(v).slice(0, 10).split('-');
  return d && m && y ? `${d}.${m}.${y}` : String(v).slice(0, 10);
};

/** Human-readable file size. */
const fmtSize = (b) =>
  b == null ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`;

/**
 * Only allow http(s) or site-relative hrefs on this PUBLIC page. Returns undefined for
 * anything else (e.g. a stored `javascript:` / `data:` value), so it renders as a
 * non-clickable link. Defense-in-depth alongside the server-side http(s) validation.
 */
const safeHref = (url) => {
  if (!url) return undefined;
  const s = String(url).trim();
  return /^https?:\/\//i.test(s) || s.startsWith('/') ? s : undefined;
};

const DOC_TYPE_LABEL = {
  certificate: 'Certificate',
  test_report: 'Test report',
  declaration_of_conformity: 'Declaration of conformity',
  safety_data_sheet: 'Safety data sheet',
  manual: 'Manual',
  other: 'Document'
};

export function ConsumerApp() {
  const token = tokenFromPath();
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    if (!token) return undefined; // no token → the entry form is shown
    setState({ status: 'loading' });
    fetch(`/public/dpp/${token}`, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error('not found');
        return r.json();
      })
      .then((data) => setState({ status: 'ok', data }))
      .catch(() => setState({ status: 'error' }));
    return undefined;
  }, [token]);

  return (
    <div className="min-h-full bg-canvas">
      {token && state.status === 'ok' ? (
        // Passport brings its own container (single column, or 3-column with side rails
        // when the DPP has left/right-placed marketing tiles).
        <Passport dpp={state.data} />
      ) : (
        <div className="mx-auto max-w-lg px-4 pb-12">
          {!token && <TokenEntry />}
          {token && state.status === 'loading' && <CenteredNote text="Loading passport…" />}
          {token && state.status === 'error' && <NotFound />}
        </div>
      )}
    </div>
  );
}

// Public token-entry page (no QR scan): paste the QR token → open the consumer DPP.
function TokenEntry() {
  const [value, setValue] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const t = value.trim();
    if (t) window.location.href = `/consumer.html?token=${encodeURIComponent(t)}`;
  };
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 text-center">
      <ShieldCheck className="h-10 w-10 text-brand-600" />
      <div>
        <h1 className="text-lg font-semibold text-ink">Open a product passport</h1>
        <p className="mt-1 max-w-xs text-sm text-ink-muted">
          Enter the QR token printed on the product to view its Digital Product Passport.
        </p>
      </div>
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-3">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 369135ad-….<signature>"
          className="w-full rounded-lg border border-black/10 bg-card px-4 py-2 text-sm text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          View passport
        </button>
      </form>
    </div>
  );
}

function CenteredNote({ text }) {
  return <div className="flex h-72 items-center justify-center text-ink-muted">{text}</div>;
}

function NotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 text-center">
      <AlertCircle className="h-10 w-10 text-ink-muted" />
      <h1 className="text-lg font-semibold text-ink">Passport not available</h1>
      <p className="max-w-xs text-sm text-ink-muted">
        This product passport could not be found, or the QR link is invalid or has expired.
      </p>
      <a href="/lookup.html" className="text-sm font-medium text-brand-700 hover:underline">
        Try another token
      </a>
    </div>
  );
}

function ShareActions({ token }) {
  const [copied, setCopied] = useState('');

  const publicUrl = `${window.location.origin}/consumer.html?token=${encodeURIComponent(token)}`;

  const copy = async (text, label) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 1800);
  };

  const share = async () => {
    if (navigator.share) {
      await navigator.share({
        title: 'Digital Product Passport',
        text: 'Open this Digital Product Passport',
        url: publicUrl
      });
    } else {
      await copy(publicUrl, 'Link copied');
    }
  };

  return (
    <section className="mt-4 rounded-2xl border border-black/5 bg-card p-4 shadow-sm print:hidden">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Printer className="h-4 w-4" />
          Download PDF
        </button>

        <button
          type="button"
          onClick={share}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm font-medium text-ink hover:bg-gray-50"
        >
          <Share2 className="h-4 w-4" />
          Share link
        </button>

        <button
          type="button"
          onClick={() => copy(publicUrl, 'Link copied')}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm font-medium text-ink hover:bg-gray-50"
        >
          <Copy className="h-4 w-4" />
          Copy link
        </button>

        <button
          type="button"
          onClick={() => copy(token, 'Token copied')}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm font-medium text-ink hover:bg-gray-50"
        >
          <Copy className="h-4 w-4" />
          Copy token
        </button>
      </div>

      {copied && <p className="mt-2 text-center text-xs text-brand-700">{copied}</p>}
    </section>
  );
}

function Passport({ dpp }) {
  const p = dpp.product ?? {};
  const v = dpp.variant ?? {};
  const b = dpp.batch ?? {};
  const agg = dpp.aggregated?.values ?? {};
  const origin = p.country_of_origin || b.country_of_origin;
  const token = tokenFromPath();

  // Prefer the rolled-up BOM aggregate (batch's own value + mass-weighted component
  // contributions) over the batch's own component-excluding value. Fall back to the
  // simple value when no aggregate is available. Formatted in German (de-DE).
  const co2 = deNum(agg.co2_footprint_kg ?? b.co2_footprint_kg, 2);
  const recycled = deNum(agg.recycled_content_pct ?? b.recycled_content_pct, 2);

  // The product story sits directly under the hero (1st block), before the stats and
  // composition — it is the marketing lead-in to the passport.
  const story = p.storytelling?.length > 0 ? p.storytelling : null;

  // Marketing placement: inline in "Discover more" vs. left/right side rail (desktop) /
  // "Featured" block (mobile). null/legacy ⇒ inline.
  const marketing = dpp.marketing ?? [];
  const inlineLinks = marketing.filter((m) => !m.placement || m.placement === 'discover_more');
  const leftLinks = marketing.filter((m) => m.placement === 'left');
  const rightLinks = marketing.filter((m) => m.placement === 'right');
  const sideLinks = [...leftLinks, ...rightLinks];

  const body = (
    <>
      <Hero product={p} variant={v} espr={p.espr_compliance} />

      {story && (
        <Section icon={Sparkles} title="The story" className="mt-4">
          <div className="space-y-3">
            {story.map((s, i) => (
              <div key={i}>
                {s.title && <p className="text-sm font-medium text-ink">{s.title}</p>}
                {s.body && <p className="text-sm text-ink-muted">{s.body}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      <Stats co2={co2} recycled={recycled} origin={origin} hasStoryAbove={!!story} />

      <div className="mt-4 space-y-4">
        <Section icon={Layers} title="Materials & composition">
          <KeyVal label="Fibre composition" value={p.fibre_composition} />
          <KeyVal label="Substances of concern" value={p.substances_of_concern} />
          <KeyVal label="Country of origin" value={origin} />
          {b.batch_number && <KeyVal label="Production batch" value={b.batch_number} />}
          {b.production_date && <KeyVal label="Produced" value={deDate(b.production_date)} />}
        </Section>

        {(p.durability_score != null || p.repairability_score != null) && (
          <Section icon={Gauge} title="Durability & repairability">
            <ScoreBar label="Durability" score={p.durability_score} />
            <ScoreBar label="Repairability" score={p.repairability_score} />
          </Section>
        )}

        {hasCareInfo(p) && (
          <Section icon={Droplets} title="Care, repair, reuse & end-of-life">
            <CareBlock icon={Droplets} label="Care & washing" text={p.care_instructions} videoUrl={p.care_video_url} productsUrl={p.care_products_url} />
            <CareBlock icon={Wrench} label="Repair" text={p.repair_instructions} videoUrl={p.repair_video_url} productsUrl={p.repair_products_url} />
            <CareBlock icon={Repeat} label="Reuse" text={p.reuse_instructions} videoUrl={p.reuse_video_url} productsUrl={p.reuse_products_url} />
            <CareBlock icon={Trash2} label="End-of-life" text={p.disposal_instructions} videoUrl={p.disposal_video_url} productsUrl={p.disposal_products_url} />
          </Section>
        )}

        {dpp.materials?.length > 0 && (
          <Section icon={Layers} title="What it's made of">
            <Materials items={dpp.materials} />
          </Section>
        )}

        {dpp.documents?.length > 0 && (
          <Section icon={FileCheck} title="Certificates & documents">
            <ul className="space-y-2">
              {dpp.documents.map((d) => (
                <li key={d.id}>
                  <a
                    href={d.download_url}
                    download={d.file_name || true}
                    className="flex items-center justify-between gap-2 rounded-lg border border-black/5 px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-gray-50"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Download className="h-4 w-4 shrink-0 text-ink-muted" />
                      <span className="truncate">{d.title || d.file_name}</span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-muted">
                      {[DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type, fmtSize(d.file_size)].filter(Boolean).join(' · ')}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </Section>
          
        )}

        {/* Narrow-screen fallback for left/right-placed tiles (rails are hidden below lg). */}
        {sideLinks.length > 0 && (
          <div className="lg:hidden">
            <Section icon={Megaphone} title="Featured">
              <div className="grid grid-cols-2 gap-3">
                {sideLinks.map((m, i) => (
                  <MarketingTile key={i} link={m} />
                ))}
              </div>
            </Section>
          </div>
        )}

        {inlineLinks.length > 0 && (
          <Section icon={ExternalLink} title="Discover more">
            <div className="space-y-3">
              {inlineLinks.map((m, i) => (
                <MarketingCard key={i} link={m} flip={i % 2 === 1} />
              ))}
            </div>
          </Section>
        )}

        <Identification ident={dpp.identification} product={dpp.product} />

        <Authenticity dpp={dpp} />
      </div>

      <ShareActions token={token} />

      <footer className="mt-8 text-center text-xs text-ink-muted">
        EU Digital Product Passport · ESPR
        <div className="mt-1">Powered by DPP Studio</div>
      </footer>
    

    
    </>
  );

  // No side-placed tiles → the classic single centered column (look unchanged).
  if (sideLinks.length === 0) {
    return <div className="mx-auto max-w-lg px-4 pb-12">{body}</div>;
  }

  // With side tiles → 3-column layout on desktop: sticky rails flank the centered passport.
  // The center keeps px-4 so the Hero's -mx-4 bleed stays aligned. Both rails render (one
  // may be empty) so the passport stays centered.
  return (
    <div className="mx-auto flex max-w-6xl justify-center gap-6 px-4 pb-12">
      <MarketingRail links={leftLinks} />
      <div className="w-full max-w-lg px-4">{body}</div>
      <MarketingRail links={rightLinks} />
    </div>
  );
}

function Hero({ product, variant, espr }) {
  const image = variant.image_data || variant.image_url;
  return (
    <header className="-mx-4 rounded-b-3xl bg-gradient-to-br from-brand-600 to-brand-800 px-6 pb-7 pt-8 text-white shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-brand-100">
            <ShieldCheck className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Digital Product Passport</span>
          </div>
          <h1 className="mt-3 text-2xl font-semibold leading-tight">{product.name ?? 'Product'}</h1>
          <p className="mt-1 text-sm text-brand-100">
            {[product.brand, product.category, product.model].filter(Boolean).join(' · ')}
          </p>
          {(variant.color || variant.size) && (
            <p className="mt-0.5 text-xs text-brand-200">
              {[variant.color, variant.size].filter(Boolean).join(' / ')}
              {variant.sku ? ` · ${variant.sku}` : ''}
            </p>
          )}
        </div>
        {image && (
          <img
            src={image}
            alt={product.name ?? 'Product'}
            className="h-24 w-24 shrink-0 rounded-2xl border border-white/25 object-cover shadow-md sm:h-28 sm:w-28"
          />
        )}
      </div>
      {product.description && (
        <p className="mt-3 text-sm leading-relaxed text-white/90">{product.description}</p>
      )}
      {espr && (
        <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
          <BadgeCheck className="h-3.5 w-3.5" />
          {ESPR_LABEL[espr] ?? espr}
        </span>
      )}
    </header>
  );
}

function Stats({ co2, recycled, origin, hasStoryAbove }) {
  const tiles = [
    co2 != null && { icon: Leaf, value: `${co2} kg`, label: 'CO₂ footprint' },
    recycled != null && { icon: Recycle, value: `${recycled} %`, label: 'Recycled content' },
    origin && { icon: MapPin, value: origin, label: 'Origin' }
  ].filter(Boolean);

  if (!tiles.length) return null;

  // Directly under the hero the tiles overlap its rounded bottom (-mt-5). When the story
  // sits between hero and stats, use a normal gap instead so nothing clips the story card.
  return (
    <div className={`${hasStoryAbove ? 'mt-4' : '-mt-5'} grid grid-cols-3 gap-3`}>
      {tiles.map((t, i) => {
        const Icon = t.icon;
        return (
          <div
            key={i}
            className="flex flex-col items-center gap-1 rounded-2xl border border-black/5 bg-card px-2 py-3 text-center shadow-sm"
          >
            <Icon className="h-4 w-4 text-brand-600" />
            <span className="text-sm font-semibold text-ink">{t.value}</span>
            <span className="text-[11px] leading-tight text-ink-muted">{t.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function Section({ icon: Icon, title, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-black/5 bg-card p-5 shadow-sm ${className}`}>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Icon className="h-4 w-4 text-brand-600" />
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * Image/video-only marketing tile for the side rails + mobile "Featured" block. The whole
 * tile is the hyperlink; the title/subtitle sit as an overlay and a video adds a play
 * badge. Falls back to a compact link row when the link has no image.
 */
function MarketingTile({ link }) {
  const image = link.image_data || link.image_url;
  const href = safeHref(link.url);
  const isVideo = link.media_type === 'video';

  if (!image) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-between gap-2 rounded-lg border border-black/5 px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-gray-50"
      >
        <span className="truncate">{link.title}</span>
        <ExternalLink className="h-4 w-4 shrink-0 text-ink-muted" />
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="relative block overflow-hidden rounded-xl border border-black/5 shadow-sm transition-transform hover:-translate-y-0.5"
    >
      <img src={image} alt={link.title || ''} className="aspect-[4/3] w-full object-cover print:hidden" />
      {isVideo && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/20">
          <PlayCircle className="h-9 w-9 text-white drop-shadow" />
        </span>
      )}
      {(link.title || link.subtitle) && (
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 pb-2 pt-6">
          {link.title && <span className="block truncate text-xs font-semibold text-white">{link.title}</span>}
          {link.subtitle && <span className="block truncate text-[11px] text-white/85">{link.subtitle}</span>}
        </span>
      )}
    </a>
  );
}

/** A desktop-only (lg+) sticky side rail of image/video marketing tiles. */
function MarketingRail({ links }) {
  return (
    <aside className="hidden w-56 shrink-0 pt-8 lg:block">
      <div className="sticky top-6 space-y-4">
        {links.map((m, i) => (
          <MarketingTile key={i} link={m} />
        ))}
      </div>
    </aside>
  );
}

/**
 * Marketing/advertising tile (US5.8). With an image or video thumbnail it renders as a
 * media card — the thumbnail alternates left/right (`flip`) and the whole card is the
 * hyperlink, so the consumer view doubles as a marketing surface. A video tile adds a
 * play overlay. Without an image it falls back to the compact link row.
 */
function MarketingCard({ link, flip }) {
  const image = link.image_data || link.image_url;
  const typeLabel = MARKETING_LINK_LABEL[link.link_type] ?? link.link_type;
  const isVideo = link.media_type === 'video';

  if (!image) {
    return (
      <a
        href={safeHref(link.url)}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-between gap-2 rounded-lg border border-black/5 px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-gray-50"
      >
        <span className="min-w-0">
          <span className="block truncate">{link.title}</span>
          {link.subtitle && <span className="block truncate text-xs font-normal text-ink-muted">{link.subtitle}</span>}
        </span>
        <ExternalLink className="h-4 w-4 shrink-0 text-ink-muted" />
      </a>
    );
  }

  return (
    <a
      href={safeHref(link.url)}
      target="_blank"
      rel="noreferrer"
      className={`flex items-stretch gap-4 overflow-hidden rounded-xl border border-black/5 transition-colors hover:bg-gray-50 ${flip ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Thumbnails are hidden in the printed PDF so large images don't bloat the output. */}
      <div className="relative h-24 w-24 shrink-0 sm:h-28 sm:w-28 print:hidden">
        <img src={image} alt={link.title} className="h-full w-full object-cover" />
        {isVideo && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/20">
            <PlayCircle className="h-8 w-8 text-white drop-shadow" />
          </span>
        )}
      </div>
      <div className={`flex min-w-0 flex-col justify-center py-3 ${flip ? 'pl-4' : 'pr-4'}`}>
        <span className="text-[11px] font-medium uppercase tracking-wide text-brand-600">{typeLabel}</span>
        <span className="mt-0.5 text-sm font-semibold text-ink">{link.title}</span>
        {link.subtitle && <span className="mt-0.5 text-sm text-ink-muted">{link.subtitle}</span>}
        <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-brand-700">
          {isVideo ? 'Watch' : 'Discover'} <ExternalLink className="h-3.5 w-3.5" />
        </span>
      </div>
    </a>
  );
}

function KeyVal({ label, value }) {
  if (!value) return null;
  return (
    <div className="border-t border-black/5 py-2.5 first:border-0 first:pt-0">
      <dt className="text-xs uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value}</dd>
    </div>
  );
}

/** True when the product has any care/repair/reuse/end-of-life text, video or shop link. */
function hasCareInfo(p) {
  return Boolean(
    p.care_instructions || p.care_video_url || p.care_products_url ||
    p.repair_instructions || p.repair_video_url || p.repair_products_url ||
    p.reuse_instructions || p.reuse_video_url || p.reuse_products_url ||
    p.disposal_instructions || p.disposal_video_url || p.disposal_products_url
  );
}

function CareBlock({ icon: Icon, label, text, videoUrl, productsUrl }) {
  if (!text && !videoUrl && !productsUrl) return null;
  return (
    <div className="flex gap-3 border-t border-black/5 py-2.5 first:border-0 first:pt-0">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
        {text && <p className="mt-0.5 text-sm text-ink">{text}</p>}
        {(videoUrl || productsUrl) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            {videoUrl && (
              <a
                href={safeHref(videoUrl)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
              >
                <PlayCircle className="h-4 w-4" /> Watch video
              </a>
            )}
            {productsUrl && (
              <a
                href={safeHref(productsUrl)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
              >
                <ShoppingBag className="h-4 w-4" /> Recommended products
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** ESPR score (0–10) rendered as a labelled progress bar. */
function ScoreBar({ label, score }) {
  if (score == null || score === '') return null;
  const n = Number(score);
  if (Number.isNaN(n)) return null;
  const pct = Math.max(0, Math.min(100, (n / 10) * 100));
  return (
    <div className="border-t border-black/5 py-3 first:border-0 first:pt-0">
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink">{label}</span>
        <span className="text-sm font-semibold text-ink">{deNum(n, 1)} / 10</span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div className="h-2 rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Recursive bill-of-materials tree. */
function Materials({ items, depth = 0 }) {
  if (!items?.length) return null;
  return (
    <ul className={depth === 0 ? 'space-y-2.5' : 'mt-2.5 space-y-2.5 border-l border-black/10 pl-3'}>
      {items.map((m, i) => (
        <li key={m.component_ID ?? i}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-sm font-medium text-ink">{m.name}</span>
              {m.role && <span className="ml-2 text-xs text-ink-muted">{m.role}</span>}
              {m.fibre_composition && (
                <div className="text-xs text-ink-muted">{m.fibre_composition}</div>
              )}
            </div>
            {(m.external_dpp_url || m.sub_dpp?.qr_token) && (
              <div className="shrink-0 text-right text-xs">
                {m.external_dpp_url ? (
                  <a
                    href={safeHref(m.external_dpp_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-brand-700 hover:underline"
                  >
                    Supplier DPP <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <a
                    href={`/consumer.html?token=${encodeURIComponent(m.sub_dpp.qr_token)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-brand-700 hover:underline"
                  >
                    View passport <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}
          </div>
          {m.components?.length > 0 && <Materials items={m.components} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}

const PRODUCT_TYPE_LABEL = {
  finished: 'Finished product',
  material: 'Material',
  component: 'Component',
  packaging: 'Packaging'
};

const cap = (v) => (v ? String(v).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : v);

/**
 * Product identification & traceability (US6.11). Renders only the fields present.
 * Product identifiers (GTIN/UPC/EIN) and lifecycle fields (type/status) arrive via the
 * visibility-filtered product section — internal by default, opt-in public per field.
 */
function Identification({ ident, product }) {
  if (!ident && !product) return null;
  const p = product ?? {};
  const rows = [
    ['Product ID', ident?.product_id],
    ['GTIN', p.gtin],
    ['UPC', p.upc],
    ['EIN', p.ein],
    ['Batch number', ident?.batch_number],
    ['Serial number', ident?.serial_number],
    ['UPI', ident?.upi],
    ['Passport ID', ident?.dpp_id],
    ['Product type', p.product_type ? (PRODUCT_TYPE_LABEL[p.product_type] ?? cap(p.product_type)) : null],
    ['Product status', cap(p.status)]
  ].filter(([, v]) => v);
  if (!rows.length) return null;
  return (
    <Section icon={Fingerprint} title="Identification & traceability">
      <dl>
        {rows.map(([label, value]) => (
          <div key={label} className="border-t border-black/5 py-2.5 first:border-0 first:pt-0">
            <dt className="text-xs uppercase tracking-wide text-ink-muted">{label}</dt>
            <dd className="mt-0.5 break-all font-mono text-sm text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

function Authenticity({ dpp }) {
  return (
    <section className="rounded-2xl border border-brand-200 bg-brand-50 p-5">
      <div className="flex items-center gap-3">
        <BadgeCheck className="h-6 w-6 shrink-0 text-brand-600" />
        <div>
          <p className="text-sm font-semibold text-ink">Authentic digital product passport</p>
          <p className="text-xs text-ink-muted">
            Version {dpp.version ?? 1}
            {dpp.last_updated ? ` · updated ${deDate(dpp.last_updated)}` : ''}
          </p>
        </div>
      </div>
    </section>
  );
}
