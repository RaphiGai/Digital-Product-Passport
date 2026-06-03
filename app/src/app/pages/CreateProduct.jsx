import { useState } from 'react';
import { Card } from '@/ui/Card';
import { Breadcrumb } from '@/ui/Breadcrumb';
import { Stepper } from './wizard/Stepper';
import { Step1Product } from './wizard/Step1Product';
import { Step2Variant } from './wizard/Step2Variant';
import { Step3Bom } from './wizard/Step3Bom';
import { Step4Batch } from './wizard/Step4Batch';
import { Step5Dpp } from './wizard/Step5Dpp';

/**
 * Multi-step product wizard:
 *   1 Product model → 2 Variant → 3 Bill of materials → 4 Batch → 5 Generate DPP
 * Created IDs flow through `ctx` so each step links to the previous entity.
 */
export function CreateProduct() {
  const [step, setStep] = useState(1);
  const [ctx, setCtx] = useState({
    productId: null,
    productName: '',
    variantId: null,
    variantLabel: '',
    batchId: null
  });

  const next = () => setStep((s) => Math.min(s + 1, 5));
  const back = () => setStep((s) => Math.max(s - 1, 1));
  const stepProps = { ctx, setCtx, next, back };

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Products', to: '/products' },
          { label: 'Create product' }
        ]}
      />
      <div>
        <h1 className="text-2xl font-semibold text-ink">Create product</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {ctx.productName ? `${ctx.productName} — ` : ''}step {step} of 5
        </p>
      </div>

      <Card className="py-4">
        <Stepper current={step} />
      </Card>

      {step === 1 && <Step1Product {...stepProps} />}
      {step === 2 && <Step2Variant {...stepProps} />}
      {step === 3 && <Step3Bom {...stepProps} />}
      {step === 4 && <Step4Batch {...stepProps} />}
      {step === 5 && <Step5Dpp {...stepProps} />}
    </div>
  );
}
