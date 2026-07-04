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

  const co2 = deNum(agg.co2_footprint_kg ?? b.co2_footprint_kg, 2);
  const recycled = deNum(agg.recycled_content_pct ?? b.recycled_content_pct, 2);

  const story = p.storytelling?.length > 0 ? p.storytelling : null;
  const marketing = dpp.marketing ?? [];

  return (
    <div className="min-h-screen bg-canvas">
      <Hero product={p} variant={v} espr={p.espr_compliance} />

      <main className="mx-auto max-w-6xl px-4 pb-12">
        <Stats co2={co2} recycled={recycled} origin={origin} />

        {story && (
          <section className="mt-6 rounded-3xl border border-black/5 bg-card p-5 shadow-sm md:p-8">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-brand-600" />
              <h2 className="text-lg font-semibold text-ink">The story behind this product</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {story.map((s, i) => (
                <article key={i} className="rounded-2xl bg-brand-50/60 p-4">
                  {s.title && <h3 className="text-sm font-semibold text-ink">{s.title}</h3>}
                  {s.body && <p className="mt-1 text-sm leading-relaxed text-ink-muted">{s.body}</p>}
                </article>
              ))}
            </div>
          </section>
        )}

        {marketing.length > 0 && (
          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-ink">Discover more</h2>
                <p className="text-sm text-ink-muted">Care, styling, brand content and product services.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {marketing.map((m, i) => (
                <MarketingCard key={i} link={m} />
              ))}
            </div>
          </section>
        )}

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            <Section icon={Layers} title="Materials & composition">
              <KeyVal label="Fibre composition" value={p.fibre_composition} />
              <KeyVal label="Substances of concern" value={p.substances_of_concern} />
              <KeyVal label="Country of origin" value={origin} />
              {b.batch_number && <KeyVal label="Production batch" value={b.batch_number} />}
              {b.production_date && <KeyVal label="Produced" value={deDate(b.production_date)} />}
            </Section>

            {dpp.materials?.length > 0 && (
              <Section icon={Layers} title="What it's made of">
                <Materials items={dpp.materials} />
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
          </div>

          <aside className="space-y-4">
            {(p.durability_score != null || p.repairability_score != null) && (
              <Section icon={Gauge} title="Durability & repairability">
                <ScoreBar label="Durability" score={p.durability_score} />
                <ScoreBar label="Repairability" score={p.repairability_score} />
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
                        className="flex items-center justify-between gap-2 rounded-xl border border-black/5 px-3 py-2.5 text-sm font-medium text-ink transition hover:bg-gray-50"
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

            <Identification ident={dpp.identification} product={dpp.product} />
            <Authenticity dpp={dpp} />
            <ShareActions token={token} />
          </aside>
        </div>

        <footer className="mt-10 text-center text-xs text-ink-muted">
          EU Digital Product Passport · ESPR
          <div className="mt-1">Powered by DPP Studio</div>
        </footer>
      </main>
    </div>
  );
}

function Hero({ product, variant, espr }) {
  const image = variant.image_data || variant.image_url;

  return (
    <header className="relative overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_34%)]" />

      <div className="relative mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-[1.1fr_0.9fr] md:items-center md:py-14">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium uppercase tracking-wider text-brand-100">
            <ShieldCheck className="h-4 w-4" />
            Digital Product Passport
          </div>

          <h1 className="mt-5 text-3xl font-semibold leading-tight md:text-5xl">
            {product.name ?? 'Product'}
          </h1>

          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/85 md:text-base">
            {product.description ||
              [product.brand, product.category, product.model].filter(Boolean).join(' · ')}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {[product.brand, product.category, product.model, variant.color, variant.size, variant.sku]
              .filter(Boolean)
              .map((x) => (
                <span key={x} className="rounded-full bg-white/15 px-3 py-1 text-xs text-white/90">
                  {x}
                </span>
              ))}
          </div>

          {espr && (
            <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-brand-700">
              <BadgeCheck className="h-3.5 w-3.5" />
              {ESPR_LABEL[espr] ?? espr}
            </span>
          )}
        </div>

        {image && (
          <div className="relative mx-auto w-full max-w-sm">
            <div className="absolute -inset-4 rounded-[2rem] bg-white/10 blur-xl" />
            <img
              src={image}
              alt={product.name ?? 'Product'}
              className="relative aspect-[4/5] w-full rounded-[2rem] border border-white/20 object-cover shadow-2xl"
            />
          </div>
        )}
      </div>
    </header>
  );
}

function Stats({ co2, recycled, origin }) {
  const tiles = [
    co2 != null && { icon: Leaf, value: `${co2} kg`, label: 'CO₂ footprint' },
    recycled != null && { icon: Recycle, value: `${recycled} %`, label: 'Recycled content' },
    origin && { icon: MapPin, value: origin, label: 'Origin' }
  ].filter(Boolean);

  if (!tiles.length) return null;

  return (
    <section className="mt-6 grid gap-3 sm:grid-cols-3">
      {tiles.map((t, i) => {
        const Icon = t.icon;
        return (
          <div key={i} className="rounded-3xl border border-black/5 bg-card p-5 shadow-sm">
            <Icon className="h-5 w-5 text-brand-600" />
            <p className="mt-3 text-xl font-semibold text-ink">{t.value}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-ink-muted">{t.label}</p>
          </div>
        );
      })}
    </section>
  );
}

function MarketingCard({ link }) {
  const image = link.image_data || link.image_url;
  const href = safeHref(link.url);
  const typeLabel = MARKETING_LINK_LABEL[link.link_type] ?? link.link_type;
  const isVideo = link.media_type === 'video';

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group overflow-hidden rounded-3xl border border-black/5 bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      {image && (
        <div className="relative">
          <img src={image} alt={link.title || ''} className="aspect-[16/10] w-full object-cover" />
          {isVideo && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/20">
              <PlayCircle className="h-11 w-11 text-white drop-shadow" />
            </span>
          )}
        </div>
      )}

      <div className="p-4">
        {typeLabel && (
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">
            {typeLabel}
          </p>
        )}

        <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-ink">
          {link.title}
        </h3>

        {link.subtitle && (
          <p className="mt-1 line-clamp-2 text-sm text-ink-muted">
            {link.subtitle}
          </p>
        )}

        <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-700">
          {isVideo ? 'Watch' : 'Open'} <ExternalLink className="h-3.5 w-3.5" />
        </span>
      </div>
    </a>
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
