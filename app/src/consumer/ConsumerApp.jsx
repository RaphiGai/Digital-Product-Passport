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
  AlertCircle
} from 'lucide-react';

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

export function ConsumerApp() {
  const token = tokenFromPath();
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    if (!token) {
      setState({ status: 'error' });
      return;
    }
    fetch(`/public/dpp/${token}`, { headers: { Accept: 'application/json' } })
      .then((r) => {
        if (!r.ok) throw new Error('not found');
        return r.json();
      })
      .then((data) => setState({ status: 'ok', data }))
      .catch(() => setState({ status: 'error' }));
  }, [token]);

  return (
    <div className="min-h-full bg-canvas">
      <div className="mx-auto max-w-lg px-4 pb-12">
        {state.status === 'loading' && <CenteredNote text="Loading passport…" />}
        {state.status === 'error' && <NotFound />}
        {state.status === 'ok' && <Passport dpp={state.data} />}
      </div>
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
    </div>
  );
}

function Passport({ dpp }) {
  const p = dpp.product ?? {};
  const v = dpp.variant ?? {};
  const b = dpp.batch ?? {};
  const origin = p.country_of_origin || b.country_of_origin;

  return (
    <>
      <Hero product={p} variant={v} espr={p.espr_compliance} />

      <Stats co2={b.co2_footprint_kg} recycled={b.recycled_content_pct} origin={origin} />

      <div className="mt-4 space-y-4">
        <Section icon={Layers} title="Materials & composition">
          <KeyVal label="Fibre composition" value={p.fibre_composition} />
          <KeyVal label="Substances of concern" value={p.substances_of_concern} />
          <KeyVal label="Country of origin" value={origin} />
          {b.batch_number && <KeyVal label="Production batch" value={b.batch_number} />}
          {b.production_date && <KeyVal label="Produced" value={b.production_date} />}
        </Section>

        <Section icon={Droplets} title="Care, repair & end-of-life">
          <CareBlock icon={Droplets} label="Care" text={p.care_instructions} />
          <CareBlock icon={Wrench} label="Repair" text={p.repair_instructions} />
          <CareBlock icon={Trash2} label="End-of-life" text={p.disposal_instructions} />
        </Section>

        {dpp.materials?.length > 0 && (
          <Section icon={Layers} title="What it's made of">
            <Materials items={dpp.materials} />
          </Section>
        )}

        {dpp.storytelling?.length > 0 && (
          <Section icon={Sparkles} title="The story">
            <div className="space-y-3">
              {dpp.storytelling.map((s, i) => (
                <div key={i}>
                  {s.title && <p className="text-sm font-medium text-ink">{s.title}</p>}
                  {s.body && <p className="text-sm text-ink-muted">{s.body}</p>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {dpp.marketing?.length > 0 && (
          <Section icon={ExternalLink} title="More information">
            <ul className="space-y-2">
              {dpp.marketing.map((m, i) => (
                <li key={i}>
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-2 rounded-lg border border-black/5 px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-gray-50"
                  >
                    {m.title}
                    <ExternalLink className="h-4 w-4 text-ink-muted" />
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Authenticity dpp={dpp} />
      </div>

      <footer className="mt-8 text-center text-xs text-ink-muted">
        EU Digital Product Passport · ESPR
        <div className="mt-1">Powered by DPP Studio</div>
      </footer>
    </>
  );
}

function Hero({ product, variant, espr }) {
  return (
    <header className="-mx-4 rounded-b-3xl bg-gradient-to-br from-brand-600 to-brand-800 px-6 pb-7 pt-8 text-white shadow-sm">
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

function Stats({ co2, recycled, origin }) {
  const tiles = [
    co2 != null && { icon: Leaf, value: `${co2} kg`, label: 'CO₂ footprint' },
    recycled != null && { icon: Recycle, value: `${recycled}%`, label: 'Recycled content' },
    origin && { icon: MapPin, value: origin, label: 'Origin' }
  ].filter(Boolean);

  if (!tiles.length) return null;

  return (
    <div className="-mt-5 grid grid-cols-3 gap-3">
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

function Section({ icon: Icon, title, children }) {
  return (
    <section className="rounded-2xl border border-black/5 bg-card p-5 shadow-sm">
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

function CareBlock({ icon: Icon, label, text }) {
  if (!text) return null;
  return (
    <div className="flex gap-3 border-t border-black/5 py-2.5 first:border-0 first:pt-0">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
        <p className="mt-0.5 text-sm text-ink">{text}</p>
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
            <div className="shrink-0 text-right text-xs text-ink-muted">
              {m.quantity != null && (
                <span>
                  {m.quantity}
                  {m.unit ? ` ${m.unit}` : ''}
                </span>
              )}
              {m.external_dpp_url && (
                <a
                  href={m.external_dpp_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-brand-700 hover:underline"
                >
                  Supplier DPP <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
          {m.components?.length > 0 && <Materials items={m.components} depth={depth + 1} />}
        </li>
      ))}
    </ul>
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
            {dpp.last_updated ? ` · updated ${String(dpp.last_updated).slice(0, 10)}` : ''}
          </p>
        </div>
      </div>
    </section>
  );
}
