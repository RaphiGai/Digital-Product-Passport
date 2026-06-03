import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreate } from '@/api/hooks';
import { ApiError } from '@/api/client';
import { Card, CardTitle } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Banner } from '@/ui/Breadcrumb';
import { FormSection, FieldRow, Select } from '@/ui/Form';
import { WizardContext } from './Step2Variant';

export function Step5Dpp({ ctx, back }) {
  const navigate = useNavigate();
  const [dppType, setDppType] = useState('product');
  const [visibility, setVisibility] = useState('internal');
  const [error, setError] = useState('');

  const create = useCreate('DPPs', {
    invalidate: [['DPPs'], ['count', 'DPPs']],
    onSuccess: (row) => navigate(`/dpps/${row.ID}`)
  });

  const generate = () => {
    setError('');
    create.mutate(
      {
        product_ID: ctx.productId,
        variant_ID: ctx.variantId || null,
        batch_ID: ctx.batchId || null,
        dpp_type: dppType,
        visibility
      },
      { onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not generate the DPP.') }
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
          title="Generate digital product passport"
          description="Creates the DPP for this product. It starts as a draft — approve and publish it afterwards to generate the QR code."
        >
          <FieldRow label="Passport type" htmlFor="type">
            <Select
              id="type"
              value={dppType}
              onChange={(e) => setDppType(e.target.value)}
              options={[
                { value: 'product', label: 'Product' },
                { value: 'material', label: 'Material' },
                { value: 'item', label: 'Item' }
              ]}
            />
          </FieldRow>
          <FieldRow label="Visibility" htmlFor="vis" hint="Starts internal; becomes public on publish.">
            <Select
              id="vis"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              options={[
                { value: 'internal', label: 'Internal' },
                { value: 'public', label: 'Public' }
              ]}
            />
          </FieldRow>
        </FormSection>

        <div className="flex items-center justify-between border-t border-black/5 pt-5">
          <Button type="button" variant="ghost" onClick={back}>
            Back
          </Button>
          <Button type="button" disabled={create.isPending} onClick={generate}>
            {create.isPending ? 'Generating…' : 'Generate DPP'}
          </Button>
        </div>
      </Card>

      <div className="space-y-4">
        <WizardContext ctx={ctx} />
        <Card>
          <CardTitle>What happens next</CardTitle>
          <p className="mt-2 text-sm text-ink-muted">
            After generating, you land on the passport where you can <b>approve</b>, then{' '}
            <b>publish</b> it — publishing creates the signed QR token and the public consumer view.
          </p>
        </Card>
      </div>
    </div>
  );
}
