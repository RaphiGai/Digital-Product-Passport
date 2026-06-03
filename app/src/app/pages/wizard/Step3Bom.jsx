import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { odataList, ApiError } from '@/api/client';
import { useCreate } from '@/api/hooks';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Banner } from '@/ui/Breadcrumb';
import { FormSection, FieldRow, Input, Select } from '@/ui/Form';
import { WizardContext } from './Step2Variant';

export function Step3Bom({ ctx, next, back }) {
  const [row, setRow] = useState({ component_ID: '', quantity: '', unit: '%', component_role: '' });
  const [added, setAdded] = useState(/** @type {{name:string, role:string, qty:string}[]} */ ([]));
  const [error, setError] = useState('');

  // Candidate components: other products in the tenant (materials, components, packaging…).
  const { data: products } = useQuery({
    queryKey: ['Products', 'bom-candidates'],
    queryFn: () => odataList('Products', { orderby: 'name', top: 200 })
  });
  const candidates = (products ?? []).filter((p) => p.ID !== ctx.productId);

  const create = useCreate('ProductBOMs');

  const set = (key) => (e) => setRow((r) => ({ ...r, [key]: e.target.value }));

  const addComponent = () => {
    setError('');
    if (!row.component_ID) {
      setError('Pick a component product.');
      return;
    }
    create.mutate(
      {
        parent_ID: ctx.variantId,
        component_ID: row.component_ID,
        quantity: row.quantity ? Number(row.quantity) : null,
        unit: row.unit || null,
        component_role: row.component_role || null,
        is_mandatory: true,
        status: 'active'
      },
      {
        onSuccess: () => {
          const name = candidates.find((c) => c.ID === row.component_ID)?.name ?? 'Component';
          setAdded((a) => [...a, { name, role: row.component_role, qty: `${row.quantity} ${row.unit}` }]);
          setRow({ component_ID: '', quantity: '', unit: '%', component_role: '' });
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not add the component.')
      }
    );
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="p-6">
        {error && (
          <div className="mb-4">
            <Banner kind="error">{error}</Banner>
          </div>
        )}
        <FormSection
          title="Bill of materials"
          description="Add the component products that make up this variant. Optional — you can skip and add them later."
        >
          <FieldRow label="Component product" htmlFor="comp" className="md:col-span-2">
            <Select
              id="comp"
              value={row.component_ID}
              onChange={set('component_ID')}
              options={[
                { value: '', label: candidates.length ? 'Select a product…' : 'No other products available' },
                ...candidates.map((c) => ({ value: c.ID, label: `${c.name}${c.brand ? ` · ${c.brand}` : ''}` }))
              ]}
            />
          </FieldRow>
          <FieldRow label="Quantity" htmlFor="qty">
            <Input id="qty" type="number" value={row.quantity} onChange={set('quantity')} placeholder="80" />
          </FieldRow>
          <FieldRow label="Unit" htmlFor="unit">
            <Select
              id="unit"
              value={row.unit}
              onChange={set('unit')}
              options={[
                { value: '%', label: '%' },
                { value: 'g', label: 'g' },
                { value: 'kg', label: 'kg' },
                { value: 'pcs', label: 'pcs' }
              ]}
            />
          </FieldRow>
          <FieldRow label="Role" htmlFor="role" className="md:col-span-2" hint="e.g. Main fabric, Stretch yarn, Zipper">
            <Input id="role" value={row.component_role} onChange={set('component_role')} placeholder="Main fabric" />
          </FieldRow>
        </FormSection>

        <div className="flex justify-end">
          <Button type="button" variant="outline" disabled={create.isPending} onClick={addComponent}>
            {create.isPending ? 'Adding…' : '+ Add component'}
          </Button>
        </div>

        {added.length > 0 && (
          <ul className="mt-4 space-y-1.5 border-t border-black/5 pt-4">
            {added.map((a, i) => (
              <li key={i} className="flex justify-between text-sm">
                <span className="text-ink">
                  {a.name}
                  {a.role ? ` · ${a.role}` : ''}
                </span>
                <span className="text-ink-muted">{a.qty}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex items-center justify-between border-t border-black/5 pt-5">
          <Button type="button" variant="ghost" onClick={back}>
            Back
          </Button>
          <Button type="button" onClick={next}>
            {added.length ? 'Continue' : 'Skip'}
          </Button>
        </div>
      </Card>

      <WizardContext ctx={ctx} />
    </div>
  );
}
