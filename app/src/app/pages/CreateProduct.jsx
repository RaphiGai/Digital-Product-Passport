import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/ui/Card';
import { Breadcrumb } from '@/ui/Breadcrumb';
import { Stepper } from './wizard/Stepper';
import { Step1Product } from './wizard/Step1Product';
import { Step2Variant } from './wizard/Step2Variant';
import { Step3Bom } from './wizard/Step3Bom';

/**
 * Slim product wizard: 1 Product model → 2 Add variants → 3 Bill of materials.
 * Batches and the DPP are created later from each variant's batch view.
 */
export function CreateProduct() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [ctx, setCtx] = useState({ productId: null, productName: '', variantId: null, variantLabel: '' });

  const next = () => setStep((s) => Math.min(s + 1, 3));
  const back = () => setStep((s) => Math.max(s - 1, 1));
  const finish = () => navigate(`/products/${ctx.productId}`);

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
          {ctx.productName ? `${ctx.productName} — ` : ''}step {step} of 3
        </p>
      </div>

      <Card className="py-4">
        <Stepper current={step} />
      </Card>

      {step === 1 && <Step1Product ctx={ctx} setCtx={setCtx} next={next} />}
      {step === 2 && (
        <Step2Variant
          ctx={ctx}
          setCtx={setCtx}
          onBack={back}
          onPrimary={next}
          primaryLabel="Continue to BOM"
        />
      )}
      {step === 3 && (
        <Step3Bom ctx={ctx} onBack={back} onPrimary={finish} primaryLabel="Finish" />
      )}
    </div>
  );
}
