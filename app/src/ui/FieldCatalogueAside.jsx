import { Card, CardTitle } from './Card';

/**
 * "Field catalogue" sidebar from the create-form mockups: lists fields with
 * MANDATORY / optional, ordered mandatory-first.
 * @param {{ fields: import('@/lib/fieldCatalogue').CatalogueField[] }} props
 */
export function FieldCatalogueAside({ fields }) {
  const sorted = [...fields].sort((a, b) => Number(b.mandatory) - Number(a.mandatory));
  return (
    <Card>
      <CardTitle>Field catalogue</CardTitle>
      <ul className="mt-3 space-y-1.5">
        {sorted.map((f) => (
          <li key={f.key} className="flex items-center justify-between text-sm">
            <span className="text-ink">{f.label}</span>
            <span
              className={
                f.mandatory
                  ? 'text-xs font-semibold uppercase tracking-wide text-red-600'
                  : 'text-xs text-ink-muted'
              }
            >
              {f.mandatory ? 'Mandatory' : 'optional'}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
