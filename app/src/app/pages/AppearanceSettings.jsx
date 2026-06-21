import { useEffect, useState } from 'react';
import { Card, CardTitle } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Breadcrumb, Banner } from '@/ui/Breadcrumb';

const themes = [
  {
    value: 'green',
    label: 'Green',
    description: 'Default DPP Studio theme',
    color: 'bg-brand-600'
  },
  {
    value: 'blue',
    label: 'Blue',
    description: 'Blue interface theme',
    color: 'bg-blue-600'
  },
  {
    value: 'purple',
    label: 'Purple',
    description: 'Purple interface theme',
    color: 'bg-purple-600'
  }
];

export function AppearanceSettings() {
  const [selectedTheme, setSelectedTheme] = useState(
    localStorage.getItem('appearanceTheme') || 'green'
  );
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', selectedTheme);
  }, [selectedTheme]);

  const saveAppearance = () => {
    localStorage.setItem('appearanceTheme', selectedTheme);

    setMsg({
      kind: 'success',
      text: 'Appearance settings saved successfully.'
    });
  };

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Appearance' }
        ]}
      />

      <div>
        <h1 className="text-2xl font-semibold text-ink">Appearance</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Choose the color theme for your personal workspace.
        </p>
      </div>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      <Card className="p-6">
        <CardTitle>Color theme</CardTitle>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {themes.map((theme) => (
            <button
              key={theme.value}
              type="button"
              onClick={() => setSelectedTheme(theme.value)}
              className={`rounded-2xl border p-4 text-left transition ${
                selectedTheme === theme.value
                  ? 'border-brand-600 bg-brand-50'
                  : 'border-black/10 bg-card hover:border-brand-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`h-10 w-10 rounded-full ${theme.color}`} />

                <div>
                  <div className="font-medium text-ink">{theme.label}</div>
                  <div className="text-sm text-ink-muted">
                    {theme.description}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-black/10 bg-canvas p-3">
                <div className="mb-2 h-3 w-20 rounded bg-brand-600" />
                <div className="mb-2 h-2 w-full rounded bg-brand-100" />
                <div className="h-2 w-2/3 rounded bg-brand-200" />
              </div>
            </button>
          ))}
        </div>

        <div className="mt-6 flex justify-end border-t border-black/5 pt-5">
          <Button type="button" onClick={saveAppearance}>
            Save
          </Button>
        </div>
      </Card>
    </div>
  );
}